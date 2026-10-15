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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  authService = inject(AuthService);

  bookings = signal<Booking[]>([]);
  loading  = signal(false);
  actionLoading = signal<number | null>(null);
  message  = signal('');

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
        this.flash(res.refunded ? 'Booking cancelled and refunded.' : 'Booking cancelled.');
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
        if (this.authService.isRequester()) {
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
