import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminService, AuditLogEntry } from '../services/admin.service';

/** Admin "Logs" tab: general account/security audit trail (register, login,
 *  booking changes, admin actions, chat moderation events) — read-only. */
@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInput, MatIcon, MatIconButton, MatProgressSpinner, MatTooltipModule],
  templateUrl: './admin-logs.html',
  styleUrl: './admin.css',
})
export class AdminLogsComponent implements OnInit {
  private adminService = inject(AdminService);

  logs = signal<AuditLogEntry[]>([]);
  loading = signal(false);
  searchFilter = new FormControl('');

  filteredLogs = computed(() => {
    const term = (this.searchFilter.value || '').toLowerCase().trim();
    if (!term) return this.logs();
    return this.logs().filter((l) =>
      l.action.toLowerCase().includes(term) ||
      (l.details || '').toLowerCase().includes(term) ||
      (l.ip_address || '').toLowerCase().includes(term) ||
      String(l.user_id ?? '').includes(term)
    );
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminService.getAuditLogs(200).subscribe({
      next: (logs) => {
        this.logs.set(logs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
