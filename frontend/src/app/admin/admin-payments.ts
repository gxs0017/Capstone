import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { AdminService, AdminPaymentsOverview, AdminPayoutEntry } from '../services/admin.service';
import { ChatSocketService } from '../services/chat-socket.service';

/** Admin "Payments" tab: ledger totals, recent entries, and a manual settle
 *  (release completed payments / retry failed refunds). */
@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [CommonModule, MatButton, MatIcon, MatProgressSpinner],
  templateUrl: './admin-payments.html',
  styleUrl: './admin.css',
})
export class AdminPaymentsComponent implements OnInit {
  private adminService = inject(AdminService);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);
  paying = signal<number | null>(null);

  data = signal<AdminPaymentsOverview | null>(null);
  loading = signal(false);
  settling = signal(false);
  error = signal('');
  statuses = ['HELD', 'RELEASED', 'REFUNDED', 'REFUND_FAILED'];

  ngOnInit(): void {
    this.load();
    // Live: refresh whenever payment or payout activity is logged
    this.chatSocket.connect();
    this.chatSocket.on<{ action: string }>('audit:new').pipe(debounceTime(700), takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => { if (/^(PAYMENT|PAYOUT|BOOKING_)/.test(e.action)) this.load(true); });
  }

  markPaid(p: AdminPayoutEntry): void {
    if (!confirm(`Mark the ${p.amount.toFixed(2)} payout to ${p.provider?.name} as sent? Do this after you've transferred the money.`)) return;
    this.paying.set(p.payoutId);
    this.adminService.markPayoutPaid(p.payoutId).subscribe({
      next: () => { this.paying.set(null); this.load(true); },
      error: () => { this.paying.set(null); this.error.set('Could not update the payout.'); },
    });
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.adminService.getPayments().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set('Could not load payments.'); this.loading.set(false); },
    });
  }

  settle(): void {
    this.settling.set(true);
    this.adminService.settlePayments().subscribe({
      next: () => { this.settling.set(false); this.load(); },
      error: () => { this.settling.set(false); this.error.set('Settling failed.'); },
    });
  }

  total(status: string) {
    return this.data()?.totals[status] ?? { count: 0, gross: 0, fees: 0 };
  }
}
