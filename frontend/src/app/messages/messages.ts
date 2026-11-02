import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ChatService, Conversation, ChatMessage, BookingOption } from '../services/chat.service';
import { ChatSocketService } from '../services/chat-socket.service';
import { BookingService, Booking } from '../services/booking.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButton, MatIconButton,
    MatIcon,
    MatFormField, MatLabel, MatInput,
    MatProgressSpinner,
    MatMenu, MatMenuItem, MatMenuTrigger,
  ],
  templateUrl: './messages.html',
  styleUrl: './messages.css',
})
export class MessagesComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private chatSocket = inject(ChatSocketService);
  private bookingService = inject(BookingService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);

  private pendingSelectId: number | null = null;
  private messageSub?: Subscription;
  private reconnectSub?: Subscription;

  conversations = signal<Conversation[]>([]);
  messages = signal<ChatMessage[]>([]);
  selected = signal<Conversation | null>(null);

  /** The pinned booking's full, freshly-fetched detail — never cached page state. */
  pinnedBooking = signal<Booking | null>(null);
  pinnedBookingLoading = signal(false);
  bookingOptions = signal<BookingOption[]>([]);

  loadingConversations = signal(false);
  loadingMessages = signal(false);
  sending = signal(false);

  draft = '';

  readonly myId = computed(() => this.authService.currentUser()?.id ?? null);

  ngOnInit(): void {
    const idParam = this.route.snapshot.queryParamMap.get('conversation');
    this.pendingSelectId = idParam ? Number(idParam) : null;

    this.loadConversations();

    // Defensive: the navbar normally owns this connection, but a direct
    // deep link to /messages should still work on its own.
    this.chatSocket.connect();
    this.messageSub = this.chatSocket.onNewMessage().subscribe((msg) => this.handleIncomingMessage(msg));
    // After a dropped connection, catch up on anything missed
    this.reconnectSub = this.chatSocket.on('socket:reconnected').subscribe(() => {
      this.loadConversations();
      const current = this.selected();
      if (current) {
        this.chatSocket.joinConversation(current.conversationId);
        this.loadMessages(current.conversationId);
      }
    });
  }

  ngOnDestroy(): void {
    const current = this.selected();
    if (current) this.chatSocket.leaveConversation(current.conversationId);
    this.messageSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  private handleIncomingMessage(msg: ChatMessage): void {
    const current = this.selected();
    const isOpenThread = current && msg.conversationId === current.conversationId;

    if (isOpenThread) {
      this.appendMessage(msg);
      if (msg.senderId !== this.myId()) {
        this.chatService.markConversationRead(msg.conversationId).subscribe({ error: () => {} });
      }
    }

    // Keeps the sidebar's ordering/unread counts current even for threads
    // that aren't open right now.
    this.loadConversations();
  }

  private appendMessage(msg: ChatMessage): void {
    this.messages.update((list) =>
      list.some((m) => m.messageId === msg.messageId) ? list : [...list, msg]
    );
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, horizontalPosition: 'center', verticalPosition: 'bottom' });
  }

  loadConversations(): void {
    this.loadingConversations.set(true);
    this.chatService.getConversations().subscribe({
      next: (convos) => {
        this.conversations.set(convos);
        this.loadingConversations.set(false);

        if (this.pendingSelectId !== null) {
          const target = convos.find((c) => c.conversationId === this.pendingSelectId);
          this.pendingSelectId = null;
          if (target) this.selectConversation(target);
        } else {
          // Keep the pinned-booking panel in sync if the open conversation's pin changed elsewhere.
          const current = this.selected();
          if (current) {
            const updated = convos.find((c) => c.conversationId === current.conversationId);
            if (updated && updated.pinnedBookingId !== current.pinnedBookingId) {
              this.selected.set(updated);
              this.loadPinnedBooking(updated.pinnedBookingId);
            }
          }
        }
      },
      error: () => {
        this.loadingConversations.set(false);
        this.notify("Couldn't load your conversations. Check your connection and try again.");
      },
    });
  }

  selectConversation(convo: Conversation): void {
    const previous = this.selected();
    if (previous?.conversationId === convo.conversationId) return;

    if (previous) this.chatSocket.leaveConversation(previous.conversationId);
    this.chatSocket.joinConversation(convo.conversationId);

    this.selected.set(convo);
    this.messages.set([]);
    this.bookingOptions.set([]);
    this.loadMessages(convo.conversationId);
    this.loadPinnedBooking(convo.pinnedBookingId);

    if (convo.unreadCount > 0) {
      this.chatService.markConversationRead(convo.conversationId).subscribe({
        next: () => this.loadConversations(),
        error: () => {},
      });
    }
  }

  loadMessages(conversationId: number): void {
    this.loadingMessages.set(true);
    this.chatService.getMessages(conversationId).subscribe({
      next: (msgs) => {
        this.messages.set(msgs);
        this.loadingMessages.set(false);
      },
      error: () => {
        this.loadingMessages.set(false);
        this.notify("Couldn't load this conversation.");
      },
    });
  }

  /** Always re-fetched from the backend — never trusts cached page state —
   *  so the panel is correct after a refresh and for whichever booking is
   *  currently pinned, even if the pair has several bookings together. */
  private loadPinnedBooking(bookingId: number | null): void {
    if (bookingId === null) {
      this.pinnedBooking.set(null);
      return;
    }
    this.pinnedBookingLoading.set(true);
    this.bookingService.getBookingById(bookingId).subscribe({
      next: (b) => {
        this.pinnedBooking.set(b);
        this.pinnedBookingLoading.set(false);
      },
      error: () => {
        this.pinnedBooking.set(null);
        this.pinnedBookingLoading.set(false);
      },
    });
  }

  openPinPicker(): void {
    const convo = this.selected();
    if (!convo) return;
    this.chatService.getBookingOptions(convo.conversationId).subscribe({
      next: (options) => this.bookingOptions.set(options),
      error: () => this.notify("Couldn't load shared bookings."),
    });
  }

  pinBooking(bookingId: number | null): void {
    const convo = this.selected();
    if (!convo) return;
    this.chatService.pinBooking(convo.conversationId, bookingId).subscribe({
      next: (updated) => {
        this.selected.set(updated);
        this.loadPinnedBooking(updated.pinnedBookingId);
        this.loadConversations();
      },
      error: () => this.notify('Could not update the pinned booking.'),
    });
  }

  onEnter(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey) return;
    keyEvent.preventDefault();
    this.send();
  }

  send(): void {
    const content = this.draft.trim();
    const convo = this.selected();
    if (!content || !convo || this.sending()) return;

    this.sending.set(true);
    this.chatService.sendMessage(convo.conversationId, content).subscribe({
      next: (msg) => {
        this.draft = '';
        this.sending.set(false);
        // A held/rejected message never arrives over the socket (only its
        // sender may ever see it), so append it directly from this response.
        if (msg.status !== 'SENT') this.appendMessage(msg);
      },
      error: () => {
        this.sending.set(false);
        this.notify('Message failed to send. Try again.');
      },
    });
  }

  isMine(msg: ChatMessage): boolean {
    return msg.senderId === this.myId();
  }

  heldPlaceholder(msg: ChatMessage): string {
    return msg.status === 'BLOCKED'
      ? `Message held for review — ID #${msg.caseId}`
      : `Message rejected by a moderator — ID #${msg.caseId}`;
  }

  initialsFor(convo: Conversation): string {
    const { firstName, lastName } = convo.otherParticipant;
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
  }

  otherParticipantName(convo: Conversation): string {
    return `${convo.otherParticipant.firstName} ${convo.otherParticipant.lastName}`.trim();
  }

  trackByConversation(_i: number, convo: Conversation): number {
    return convo.conversationId;
  }

  trackByMessage(_i: number, msg: ChatMessage): number {
    return msg.messageId;
  }

  trackByBookingOption(_i: number, opt: BookingOption): number {
    return opt.bookingId;
  }
}
