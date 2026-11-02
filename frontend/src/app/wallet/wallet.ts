import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { PaymentService, MyPayments, PaymentEntry, LedgerStatus } from '../services/payment.service';
import { AuthService } from '../services/auth.service';
import { ChatSocketService } from '../services/chat-socket.service';

type Tab = 'paid' | 'earned';

/** "Payments" for requesters; "Payments & earnings" for providers. An online payment
 *  is HELD safely by the platform until the session has happened with no issue raised;
 *  then it is credited to the provider's balance the same day (RELEASED). The provider
 *  can withdraw it once the 7-day hold is over. A cancelled booking is REFUNDED. */
@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIcon, MatButton, MatProgressSpinner],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class WalletComponent implements OnInit {
  private paymentService = inject(PaymentService);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);
  private snackBar = inject(MatSnackBar);
  authService = inject(AuthService);

  data = signal<MyPayments | null>(null);
  loading = signal(true);
  error = signal('');
  tab = signal<Tab>('paid');
  withdrawing = signal(false);

  isProvider = computed(() => this.authService.isProvider());

  entries = computed<PaymentEntry[]>(() => {
    const d = this.data();
    if (!d) return [];
    return this.tab() === 'earned' ? d.earned.entries : d.paid.entries;
  });

  totals = computed(() => {
    const d = this.data();
    if (!d) return null;
    return this.tab() === 'earned' ? d.earned.totals : d.paid.totals;
  });

  ngOnInit(): void {
    // A provider lands on their earnings; everyone else on what they've paid
    if (this.authService.isProvider()) this.tab.set('earned');
    this.load();
    // Live: payments and releases show up the moment they happen
    this.chatSocket.on('booking:changed').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
    this.chatSocket.on('socket:reconnected').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  private load(): void {
    this.paymentService.getMine().subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your payments.');
        this.loading.set(false);
      },
    });
  }

  withdraw(): void {
    if (this.withdrawing()) return;
    this.withdrawing.set(true);
    this.paymentService.withdraw().subscribe({
      next: (res) => {
        this.withdrawing.set(false);
        this.snackBar.open(res.message, 'OK', { duration: 5000 });
        this.load();
      },
      error: (err) => {
        this.withdrawing.set(false);
        this.snackBar.open(err.error?.message || 'Could not request the withdrawal.', 'Dismiss', { duration: 6000 });
      },
    });
  }

  /** Where one earned payment stands in the journey from "paid" to "withdrawn". */
  earnedStage(e: PaymentEntry): string {
    if (e.status !== 'RELEASED') return this.statusLabel(e.status);
    if (e.payoutId) return 'Withdrawn';
    if (e.availableAt && new Date(e.availableAt).getTime() > Date.now()) {
      return `Credited — withdrawable ${new Date(e.availableAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
    }
    return 'Available to withdraw';
  }

  amountOf(e: PaymentEntry): number {
    return this.tab() === 'earned' ? e.providerAmount : e.amount;
  }

  counterparty(e: PaymentEntry): string {
    return this.tab() === 'earned' ? `from ${e.payer.name}` : `to ${e.provider.name}`;
  }

  statusLabel(status: LedgerStatus): string {
    const earned = this.tab() === 'earned';
    switch (status) {
      case 'HELD':          return earned ? 'Held — job not done yet' : 'Held safely until the job is done';
      case 'RELEASED':      return earned ? 'Credited' : 'Paid to the provider';
      case 'REFUNDED':      return earned ? 'Refunded to the requester' : 'Refunded to you';
      case 'REFUND_FAILED': return 'Refund in progress';
    }
  }

  statusClass(status: LedgerStatus): string {
    switch (status) {
      case 'HELD':          return 'chip-held';
      case 'RELEASED':      return 'chip-released';
      case 'REFUNDED':      return 'chip-refunded';
      case 'REFUND_FAILED': return 'chip-failed';
    }
  }

  trackByPayment(_i: number, e: PaymentEntry): number {
    return e.paymentId;
  }
}
