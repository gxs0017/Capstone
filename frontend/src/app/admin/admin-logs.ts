import { Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminService, AuditLogEntry } from '../services/admin.service';
import { ChatSocketService } from '../services/chat-socket.service';

interface Category { value: string; label: string; test: RegExp | null }

const CATEGORIES: Category[] = [
  { value: '',         label: 'Everything',            test: null },
  { value: 'account',  label: 'Sign-ins & accounts',   test: /^(REGISTER|LOGIN|LOGIN_FAILED|USER_|PROFILE_|CONTACT_|CHAT_AUTH)/ },
  { value: 'booking',  label: 'Bookings',              test: /^(BOOKING_|AVAILABILITY_|REVIEW_)/ },
  { value: 'payment',  label: 'Payments & payouts',    test: /^(PAYMENT|PAYOUT|PAYPAL|REFUND)/ },
  { value: 'message',  label: 'Messages',              test: /^(MESSAGE_|CONVERSATION_|CHAT_)/ },
  { value: 'post',     label: 'Board posts & comments', test: /^(POST_|COMMENT_)/ },
  { value: 'service',  label: 'Services',              test: /^SERVICE_/ },
  { value: 'admin',    label: 'Admin actions',         test: /(_BY_ADMIN|^USER_|^MESSAGE_(APPROVED|REJECTED)|^PAYOUT_PAID|ISSUE_RESOLVED)/ },
  { value: 'refused',  label: 'Refused / failed',      test: /^(REQUEST_REFUSED|LOGIN_FAILED|PAYMENT_AMOUNT_MISMATCH|REFUND_FAILED|MESSAGE_FLAGGED)/ },
];

/** Admin "Logs" tab: a live, searchable record of everything people do on the platform —
 *  sign-ins, bookings, payments, messages (with their text), posts, comments, services...
 *  New entries appear the instant they happen. Search by person, action, text or date,
 *  and export what you see for an investigation. */
@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInput, MatSelect, MatOption, MatIcon, MatButton, MatIconButton, MatProgressSpinner, MatTooltipModule],
  templateUrl: './admin-logs.html',
  styleUrl: './admin.css',
})
export class AdminLogsComponent implements OnInit {
  private adminService = inject(AdminService);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);

  /** Opening the tab from a user's "Activity" button pre-fills the person filter. */
  @Input() set userFilter(value: string) {
    if (value && value !== this.userCtl.value) this.userCtl.setValue(value);
  }

  readonly categories = CATEGORIES;
  logs = signal<AuditLogEntry[]>([]);
  loading = signal(false);
  live = signal(true);
  newCount = signal(0);

  userCtl = new FormControl('');
  searchCtl = new FormControl('');
  categoryCtl = new FormControl('');
  fromCtl = new FormControl('');
  toCtl = new FormControl('');

  visible = computed(() => {
    const cat = CATEGORIES.find((c) => c.value === this.categoryCtl.value);
    const list = this.logs();
    return cat?.test ? list.filter((l) => cat.test!.test(l.action)) : list;
  });

  ngOnInit(): void {
    this.load();

    [this.userCtl, this.searchCtl, this.fromCtl, this.toCtl].forEach((c) =>
      c.valueChanges.pipe(debounceTime(350), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load()));
    this.categoryCtl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.logs.update((l) => [...l]));

    // Every new action arrives the moment it happens
    this.chatSocket.connect();
    this.chatSocket.on<AuditLogEntry>('audit:new').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      if (!this.live() || !this.matchesFilters(e)) return;
      this.logs.update((l) => (l.some((x) => x.audit_id === e.audit_id) ? l : [e, ...l].slice(0, 500)));
      this.newCount.update((n) => n + 1);
    });
    this.chatSocket.on('socket:reconnected').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(true));
  }

  private matchesFilters(e: AuditLogEntry): boolean {
    const user = (this.userCtl.value || '').trim().toLowerCase();
    if (user) {
      const hay = `${e.user_name ?? ''} ${e.user_email ?? ''} ${e.user_id ?? ''}`.toLowerCase();
      if (!hay.includes(user)) return false;
    }
    const term = (this.searchCtl.value || '').trim().toLowerCase();
    if (term && !`${e.action} ${e.details ?? ''} ${e.ip_address ?? ''}`.toLowerCase().includes(term)) return false;
    return !this.fromCtl.value && !this.toCtl.value;
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.newCount.set(0);
    this.adminService.getAuditLogs({
      user: this.userCtl.value || undefined,
      search: this.searchCtl.value || undefined,
      from: this.fromCtl.value || undefined,
      to: this.toCtl.value ? `${this.toCtl.value} 23:59:59` : undefined,
    }, 500).subscribe({
      next: (logs) => { this.logs.set(logs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  clear(): void {
    [this.userCtl, this.searchCtl, this.categoryCtl, this.fromCtl, this.toCtl].forEach((c) => c.setValue('', { emitEvent: false }));
    this.load();
  }

  filterToUser(e: AuditLogEntry): void {
    if (e.user_id == null) return;
    this.userCtl.setValue(e.user_email || String(e.user_id));
  }

  /** Colour family for an action chip. */
  tone(action: string): string {
    const hit = CATEGORIES.slice(1, 7).find((c) => c.test!.test(action));
    return hit ? `tone-${hit.value}` : 'tone-other';
  }

  exportCsv(): void {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = this.visible().map((l) =>
      [l.created_at, l.user_id, l.user_name, l.user_email, l.user_role, l.action, l.details, l.ip_address].map(q).join(','));
    const csv = ['time,user_id,name,email,role,action,details,ip', ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
