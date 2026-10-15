import { Component, inject, signal, OnInit, OnDestroy, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminService } from '../services/admin.service';
import { Booking } from '../services/booking.service';

/** Admin "Bookings" tab: browse every booking and cancel active ones with no cutoff. */
@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCard, MatCardContent,
    MatButton, MatIconButton, MatIcon,
    MatFormFieldModule, MatInput,
    MatSelect, MatOption,
    MatProgressSpinner, MatTooltipModule,
  ],
  templateUrl: './admin-bookings.html',
  styleUrl: './admin.css',
})
export class AdminBookingsComponent implements OnInit, OnDestroy {
  private adminService = inject(AdminService);
  private subs = new Subscription();

  /** Emitted after a booking changes so the dashboard stats can refresh. */
  changed = output<void>();

  readonly statuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'DECLINED', 'EXPIRED'];
  readonly pageSize = 10;

  bookings = signal<Booking[]>([]);
  total = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  loading = signal(false);
  actionLoading = signal<number | null>(null);
  actionMessage = signal('');

  statusFilter = new FormControl('');
  searchFilter = new FormControl('');

  ngOnInit(): void {
    this.load(1);
    this.subs.add(this.statusFilter.valueChanges.subscribe(() => this.load(1)));
    this.subs.add(
      this.searchFilter.valueChanges.pipe(debounceTime(400), distinctUntilChanged())
        .subscribe(() => this.load(1)),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(page = 1): void {
    this.loading.set(true);
    this.adminService
      .getBookings(this.statusFilter.value || undefined, this.searchFilter.value || undefined, page, this.pageSize)
      .subscribe({
        next: (res) => {
          this.bookings.set(res.data);
          this.total.set(res.total);
          this.totalPages.set(res.totalPages);
          this.currentPage.set(res.page);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  clearFilters(): void {
    this.statusFilter.reset();
    this.searchFilter.reset();
  }

  cancel(b: Booking): void {
    const refund = b.paymentStatus === 'PAID' ? ' The prepaid session will be refunded.' : '';
    if (!confirm(`Cancel booking #${b.bookingId} (${b.service})?${refund}`)) return;
    const reason = prompt('Reason for cancelling (optional, saved in the cancellation log):');
    if (reason === null) return; // dialog dismissed
    this.actionLoading.set(b.bookingId);
    this.adminService.cancelBooking(b.bookingId, reason.trim()).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.load(this.currentPage());
        this.changed.emit();
      },
      error: (err) => {
        this.actionLoading.set(null);
        this.actionMessage.set(err?.error?.message || 'Failed to cancel booking.');
        setTimeout(() => this.actionMessage.set(''), 4000);
        this.load(this.currentPage());
      },
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }
}
