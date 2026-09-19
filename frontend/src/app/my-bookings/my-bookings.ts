import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
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
