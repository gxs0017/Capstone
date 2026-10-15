import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChatService, Conversation, ChatMessage } from '../../services/chat';
import { ChatSocketService } from '../../services/chat-socket';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButton, MatIconButton,
    MatIcon,
    MatFormField, MatLabel, MatInput,
    MatProgressSpinner,
    TextFieldModule,
  ],
  templateUrl: './inbox.html',
  styleUrl: './inbox.css',
})
export class InboxComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private chatSocket = inject(ChatSocketService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);

  private pendingSelectId: number | null = null;

  conversations = signal<Conversation[]>([]);
  messages = signal<ChatMessage[]>([]);
  selected = signal<Conversation | null>(null);

  loadingConversations = signal(false);
  loadingMessages = signal(false);
  sending = signal(false);

  conversationsError = signal(false);

  messagesError = signal(false);

  draft = '';

  private messageSub?: Subscription;

  readonly myId = computed(() => this.authService.currentUser()?.id ?? null);

  ngOnInit(): void {

    const idParam = this.route.snapshot.queryParamMap.get('conversation');
    this.pendingSelectId = idParam ? Number(idParam) : null;

    this.loadConversations();

    this.chatSocket.connect();
    this.messageSub = this.chatSocket.onNewMessage().subscribe((msg) => {
      this.handleIncomingMessage(msg);
    });
  }

  ngOnDestroy(): void {

    const current = this.selected();
    if (current) {
      this.chatSocket.leaveConversation(current.conversation_id);
    }
    this.messageSub?.unsubscribe();
    this.chatSocket.disconnect();
  }

  private handleIncomingMessage(msg: ChatMessage): void {
    const current = this.selected();
    const isOpenThread = current && msg.conversation_id === current.conversation_id;

    if (!isOpenThread) {

      if (msg.sender_id !== this.myId()) {
        this.bumpUnread(msg.conversation_id);
      }

      this.loadConversations();
      return;
    }

    this.messages.update((list) => {
      if (list.some((m) => m.message_id === msg.message_id)) {
        return list;
      }
      return [...list, msg];
    });

    if (msg.sender_id !== this.myId()) {
      this.chatService.markConversationRead(msg.conversation_id).subscribe({
        error: () => {},
      });
    }

    this.loadConversations();
  }

  private bumpUnread(conversationId: number): void {
    this.conversations.update((list) =>
      list.map((c) =>
        c.conversation_id === conversationId
          ? { ...c, unread_count: (c.unread_count ?? 0) + 1 }
          : c
      )
    );
  }

  private clearUnread(conversationId: number): void {
    this.conversations.update((list) =>
      list.map((c) =>
        c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c
      )
    );
  }


  private notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  loadConversations(): void {
    this.loadingConversations.set(true);
    this.conversationsError.set(false);
    this.chatService.getMyConversations().subscribe({
      next: (convos) => {
        this.conversations.set(convos);
        this.loadingConversations.set(false);

        if (this.pendingSelectId !== null) {
          const target = convos.find((c) => c.conversation_id === this.pendingSelectId);
          this.pendingSelectId = null;
          if (target) {
            this.selectConversation(target);
          }
        }
      },
      error: () => {
        this.loadingConversations.set(false);
        this.conversationsError.set(true);
        this.notify('Couldn\'t load your conversations. Check your connection and try again.');
      },
    });
  }

  selectConversation(convo: Conversation): void {
    const previous = this.selected();
    if (previous?.conversation_id === convo.conversation_id) return;

    if (previous) {
      this.chatSocket.leaveConversation(previous.conversation_id);
    }
    this.chatSocket.joinConversation(convo.conversation_id);

    this.selected.set(convo);
    this.messages.set([]);
    this.loadMessages(convo.conversation_id);

    if ((convo.unread_count ?? 0) > 0) {
      this.clearUnread(convo.conversation_id);
      this.chatService.markConversationRead(convo.conversation_id).subscribe({
        error: () => {},
      });
    }
  }

  loadMessages(conversationId: number): void {
    this.loadingMessages.set(true);
    this.messagesError.set(false);
    this.chatService.getConversationMessages(conversationId).subscribe({
      next: (msgs) => {
        this.messages.set(msgs);
        this.loadingMessages.set(false);
      },
      error: () => {
        this.loadingMessages.set(false);
        this.messagesError.set(true);
        this.notify('Couldn\'t load this conversation.');
      },
    });
  }

  retryMessages(): void {
    const current = this.selected();
    if (current) {
      this.loadMessages(current.conversation_id);
    }
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
    this.chatService.sendMessage(convo.conversation_id, content).subscribe({
      next: () => {
        this.draft = '';
        this.sending.set(false);
      },
      error: () => {
        this.sending.set(false);
        this.notify('Message failed to send. Try again.');
      },
    });
  }

  isMine(msg: ChatMessage): boolean {
    return msg.sender_id === this.myId();
  }

  otherParticipantName(convo: Conversation): string {
    const me = this.myId();
    if (convo.participant_one_id === me) {
      return `${convo.p2_first} ${convo.p2_last}`.trim();
    }
    return `${convo.p1_first} ${convo.p1_last}`.trim();
  }

  initialsFor(convo: Conversation): string {
    const name = this.otherParticipantName(convo);
    const parts = name.split(' ').filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  }

  trackByConversation(_index: number, convo: Conversation): number {
    return convo.conversation_id;
  }

  trackByMessage(_index: number, msg: ChatMessage): number {
    return msg.message_id;
  }
}
