import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MatCard, MatCardContent, MatCardActions } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatInput } from '@angular/material/input';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BookingService, Booking, ProblemReason } from '../services/booking.service';
import { AuthService } from '../services/auth.service';
import { ChatService } from '../services/chat.service';
import { ChatSocketService } from '../services/chat-socket.service';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCard, MatCardContent, MatCardActions,
    MatButton,
    MatIcon,
    MatDivider,
    MatProgressSpinner,
    MatTooltipModule,
    ReactiveFormsModule,
    MatFormFieldModule, MatSelect, MatOption, MatInput,
  ],
  templateUrl: './my-bookings.html',
  styleUrl: './my-bookings.css',
})
export class MyBookingsComponent implements OnInit {
  private bookingService = inject(BookingService);
  private chatService = inject(ChatService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);
  authService = inject(AuthService);

  bookings = signal<Booking[]>([]);
  loading  = signal(false);
  actionLoading = signal<number | null>(null);
  message  = signal('');

  /** bookingId whose "Message" button is currently working, for a per-card spinner. */
  messagingLoading = signal<number | null>(null);

  /** True when viewing incoming requests (provider /requests route) */
  isRequestsView = signal(false);

  ngOnInit(): void {
    const isRequests = this.route.snapshot.data['requestsView'] === true;
    this.isRequestsView.set(isRequests);
    this.loadBookings();

    // Live: the list refreshes the moment a booking changes (no page reload)
    this.chatSocket.on('booking:changed').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadBookings(true));
    this.chatSocket.on('socket:reconnected').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadBookings(true));
  }

  loadBookings(silent = false): void {
    if (!silent) this.loading.set(true);
    const view = this.isRequestsView() ? 'requests' as const : undefined;
    this.bookingService.getMyBookings(view).subscribe({
      next: (bookings) => {
        this.bookings.set(bookings);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  confirmBooking(booking: Booking): void {
    this.actionLoading.set(booking.bookingId);
    this.bookingService.updateStatus(booking.bookingId, 'CONFIRMED').subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.message.set('Booking confirmed!');
        this.loadBookings();
        setTimeout(() => this.message.set(''), 3000);
      },
      error: (err) => this.showError(err),
    });
  }

  /** Provider turns down a pending request, optionally telling the requester why. */
  declineBooking(booking: Booking): void {
    const reason = prompt('Decline this request? Optionally tell the requester why:');
    if (reason === null) return; // dialog dismissed
    this.actionLoading.set(booking.bookingId);
    this.bookingService.updateStatus(booking.bookingId, 'DECLINED', reason || undefined).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.flash('Request declined.');
        this.loadBookings();
      },
      error: (err) => this.showError(err),
    });
  }

  private flash(msg: string): void {
    this.message.set(msg);
    setTimeout(() => this.message.set(''), 3000);
  }

  /** Show the backend's rule message (e.g. the 24-hour cancellation cutoff). */
  private showError(err: any): void {
    this.actionLoading.set(null);
    this.flash(err?.error?.message || 'Something went wrong. Please try again.');
    this.loadBookings();
  }

  cancelBooking(booking: Booking): void {
    const refundNote = booking.paymentStatus === 'PAID' ? ' This session will be refunded.' : '';
    if (!confirm('Are you sure you want to cancel this booking?' + refundNote)) return;
    this.actionLoading.set(booking.bookingId);
    this.bookingService.updateStatus(booking.bookingId, 'CANCELLED').subscribe({
      next: (res) => {
        this.actionLoading.set(null);
        this.flash(res.refunded ? 'Booking cancelled and your payment was refunded.'
          : res.refundStatus ? 'Booking cancelled. Your refund is being processed.' : 'Booking cancelled.');
        this.loadBookings();
      },
      error: (err) => this.showError(err),
    });
  }

  /** What the requester can pick when something went wrong. */
  readonly problemReasons: { value: ProblemReason; label: string; isPlanChange?: boolean }[] = [
    { value: 'NO_SHOW',       label: "The provider didn't show up" },
    { value: 'NOT_DONE',      label: "The work wasn't done" },
    { value: 'NOT_AS_AGREED', label: 'The work was not as agreed' },
    { value: 'UNREACHABLE',   label: "I couldn't reach the provider" },
    { value: 'PLANS_CHANGED', label: 'My plans changed', isPlanChange: true },
    { value: 'OTHER',         label: 'Something else' },
  ];

  /** The booking whose "Report a problem" panel is open. */
  reportingId = signal<number | null>(null);
  problemReason = new FormControl<ProblemReason | null>(null);
  problemDetails = new FormControl('', { nonNullable: true });

  openProblem(booking: Booking): void {
    this.problemReason.setValue(null);
    this.problemDetails.setValue('');
    this.reportingId.set(booking.bookingId);
  }

  closeProblem(): void {
    this.reportingId.set(null);
  }

  /** Report the problem: the booking is cancelled and any payment goes back to the requester. */
  submitProblem(booking: Booking): void {
    const reason = this.problemReason.value;
    if (!reason) { this.flash('Please choose what went wrong.'); return; }
    const details = this.problemDetails.value.trim();
    if (reason === 'OTHER' && details.length < 5) { this.flash('Please describe the problem (at least 5 characters).'); return; }
    this.actionLoading.set(booking.bookingId);
    this.bookingService.reportProblem(booking.bookingId, reason, details || undefined).subscribe({
      next: (res) => {
        this.actionLoading.set(null);
        this.reportingId.set(null);
        this.flash(booking.paymentStatus !== 'PAID' ? 'Problem reported and the booking was cancelled.'
          : res.refunded ? 'Problem reported. The booking was cancelled and your payment was refunded.'
          : 'Problem reported. The booking was cancelled and your refund is being processed.');
        this.loadBookings();
      },
      error: (err) => this.showError(err),
    });
  }

  /** Either side can mark a confirmed booking completed; requester is then routed to leave a review. */
  completeBooking(booking: Booking): void {
    this.actionLoading.set(booking.bookingId);
    this.bookingService.updateStatus(booking.bookingId, 'COMPLETED').subscribe({
      next: () => {
        this.actionLoading.set(null);
        if (!this.isRequestsView()) {
          this.router.navigate(['/review', booking.bookingId], {
            state: { booking: { bookingId: booking.bookingId, service: booking.service, provider: booking.provider } },
          });
        } else {
          this.message.set('Booking marked as completed.');
          this.loadBookings();
          setTimeout(() => this.message.set(''), 3000);
        }
      },
      error: () => this.actionLoading.set(null),
    });
  }

  /**
   * Start (or reuse) the conversation with the other party on this booking,
   * pin this booking to it, and open /messages with that conversation selected.
   */
  messageUser(booking: Booking): void {
    if (this.messagingLoading() !== null) return;

    const otherUserId = this.isRequestsView()
      ? booking.requester.id
      : booking.provider.id;

    this.messagingLoading.set(booking.bookingId);
    this.chatService.startConversation(otherUserId, booking.bookingId).subscribe({
      next: (conversation) => {
        this.messagingLoading.set(null);
        this.router.navigate(['/messages'], { queryParams: { conversation: conversation.conversationId } });
      },
      error: () => {
        this.messagingLoading.set(null);
        this.flash('Could not open the conversation. Please try again.');
      },
    });
  }

  leaveReview(booking: Booking): void {
    this.router.navigate(['/review', booking.bookingId], {
      state: { booking: { bookingId: booking.bookingId, service: booking.service, provider: booking.provider } },
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'CONFIRMED': return 'status-confirmed';
      case 'CANCELLED': return 'status-cancelled';
      case 'DECLINED':  return 'status-declined';
      case 'PENDING':   return 'status-pending';
      case 'COMPLETED': return 'status-completed';
      case 'EXPIRED':   return 'status-expired';
      default:          return '';
    }
  }

  getPaymentStatusClass(paymentStatus: string): string {
    switch (paymentStatus) {
      case 'PAID':   return 'status-confirmed';
      case 'FAILED': return 'status-cancelled';
      default:       return 'status-pending'; // UNPAID
    }
  }

  getPaymentStatusIcon(paymentStatus: string): string {
    switch (paymentStatus) {
      case 'PAID':   return 'check_circle';
      case 'FAILED': return 'error';
      default:       return 'schedule'; // UNPAID
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'CONFIRMED': return 'check_circle';
      case 'CANCELLED': return 'cancel';
      case 'DECLINED':  return 'block';
      case 'PENDING':   return 'pending';
      case 'COMPLETED': return 'task_alt';
      case 'EXPIRED':   return 'timer_off';
      default:          return 'help';
    }
  }

  getServiceIcon(svc: string): string {
    switch (svc) {
      case 'Snow Shovelling': return 'ac_unit';
      case 'Babysitting':     return 'child_care';
      case 'Tutoring':        return 'school';
      case 'Lawn Mowing':     return 'yard';
      default:                return 'handyman';
    }
  }

  getInitials(firstName: string, lastName: string): string {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
}
