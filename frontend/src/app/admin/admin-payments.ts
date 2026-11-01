import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { AdminService, AdminPaymentsOverview } from '../services/admin.service';

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

  data = signal<AdminPaymentsOverview | null>(null);
  loading = signal(false);
  settling = signal(false);
  error = signal('');
  statuses = ['HELD', 'RELEASED', 'REFUNDED', 'REFUND_FAILED'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
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
