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
import { ChatSocketService } from '../services/chat-socket.service';

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
  private chatSocket = inject(ChatSocketService);
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
    // Live: reload quietly whenever any booking or payment activity is logged
    this.chatSocket.connect();
    this.subs.add(this.chatSocket.on<{ action: string }>('audit:new').pipe(debounceTime(700))
      .subscribe((e) => { if (/^(BOOKING_|PAYMENT_|PAYOUT_)/.test(e.action)) this.load(this.currentPage(), true); }));
    this.subs.add(
      this.searchFilter.valueChanges.pipe(debounceTime(400), distinctUntilChanged())
        .subscribe(() => this.load(1)),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(page = 1, silent = false): void {
    if (!silent) this.loading.set(true);
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

  /** Admin cancelling needs a reason: it is sent to BOTH people in their Messages inbox. */
  cancelTarget = signal<Booking | null>(null);
  reasonCtl = new FormControl('');

  openCancel(b: Booking): void {
    this.reasonCtl.setValue('');
    this.cancelTarget.set(b);
  }

  closeCancel(): void {
    this.cancelTarget.set(null);
  }

  /** The message both people will receive (same wording the server sends). */
  preview(b: Booking): string {
    return [
      `Booking ID : ${b.bookingId}`,
      `Date: ${b.scheduledDate ? new Date(b.scheduledDate).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'}`,
      `Service Provider: ${b.provider.firstName} ${b.provider.lastName}`,
      `Service Requester: ${b.requester.firstName} ${b.requester.lastName}`,
      `Reason: ${(this.reasonCtl.value || '').trim() || '…'}`,
      '',
      'Money will be refunded to the requester as this service is nulled.',
    ].join('\n');
  }

  confirmCancel(): void {
    const b = this.cancelTarget();
    const reason = (this.reasonCtl.value || '').trim();
    if (!b) return;
    if (reason.length < 3) { this.flash('Please give a reason — both people will be told.'); return; }
    this.actionLoading.set(b.bookingId);
    this.adminService.cancelBooking(b.bookingId, reason).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.cancelTarget.set(null);
        this.flash(`Booking #${b.bookingId} cancelled. The requester and provider have been messaged.`);
        this.load(this.currentPage());
        this.changed.emit();
      },
      error: (err) => {
        this.actionLoading.set(null);
        this.flash(err?.error?.message || 'Failed to cancel booking.');
        this.load(this.currentPage());
      },
    });
  }

  /** Clear an open "problem reported" flag: the job counts as done and the provider is credited. */
  resolve(b: Booking): void {
    if (!confirm(`Clear the reported issue on booking #${b.bookingId}? The job will count as done and the provider will be credited. (To refund the requester instead, cancel the booking.)`)) return;
    this.actionLoading.set(b.bookingId);
    this.adminService.resolveIssue(b.bookingId).subscribe({
      next: (res) => { this.actionLoading.set(null); this.flash(res.message); this.load(this.currentPage()); this.changed.emit(); },
      error: (err) => { this.actionLoading.set(null); this.flash(err?.error?.message || 'Could not resolve the issue.'); },
    });
  }

  private flash(msg: string): void {
    this.actionMessage.set(msg);
    setTimeout(() => this.actionMessage.set(''), 5000);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }
}
