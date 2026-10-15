import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MatCard, MatCardContent, MatCardActions } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BookingService, Booking } from '../services/booking.service';
import { ChatService } from '../services/chat';
import { AuthService } from '../services/auth.service';

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
  ],
  templateUrl: './my-bookings.html',
  styleUrl: './my-bookings.css',
})
export class MyBookingsComponent implements OnInit {
  private bookingService = inject(BookingService);
  private chatService = inject(ChatService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
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
  }

  loadBookings(): void {
    this.loading.set(true);
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
      error: () => this.actionLoading.set(null),
    });
  }

  cancelBooking(booking: Booking): void {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    this.actionLoading.set(booking.bookingId);
    this.bookingService.updateStatus(booking.bookingId, 'CANCELLED').subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.message.set('Booking cancelled.');
        this.loadBookings();
        setTimeout(() => this.message.set(''), 3000);
      },
      error: () => this.actionLoading.set(null),
    });
  }

  /**
   * Start (or open the existing) conversation with the other party on this booking,
   * then navigate to the inbox with that conversation pre-selected.
   * The backend dedupes, so an existing chat is reused rather than duplicated.
   */
  messageUser(booking: Booking): void {
    if (this.messagingLoading() !== null) return;

    // The "other" user depends on which side we're viewing from.
    const otherUserId = this.isRequestsView()
      ? booking.requester.id
      : booking.provider.id;

    this.messagingLoading.set(booking.bookingId);
    this.chatService.startConversation(otherUserId, booking.bookingId).subscribe({
      next: (conversation) => {
        this.messagingLoading.set(null);
        this.router.navigate(['/inbox'], {
          queryParams: { conversation: conversation.conversation_id },
        });
      },
      error: () => {
        this.messagingLoading.set(null);
        this.message.set('Could not open the conversation. Please try again.');
        setTimeout(() => this.message.set(''), 3000);
      },
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'CONFIRMED': return 'status-confirmed';
      case 'CANCELLED': return 'status-cancelled';
      case 'PENDING':   return 'status-pending';
      default:          return '';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'CONFIRMED': return 'check_circle';
      case 'CANCELLED': return 'cancel';
      case 'PENDING':   return 'pending';
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
