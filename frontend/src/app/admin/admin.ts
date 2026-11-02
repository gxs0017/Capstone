import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatChip } from '@angular/material/chips';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDivider } from '@angular/material/divider';
import { AdminService, AdminUser, AdminUserPage, DashboardStats } from '../services/admin.service';
import { AdminBookingsComponent } from './admin-bookings';
import { AdminLogsComponent } from './admin-logs';
import { AdminModerationComponent } from './admin-moderation';
import { AdminPaymentsComponent } from './admin-payments';
import { AdminPostsComponent } from './admin-posts';
import { ChatService } from '../services/chat.service';
import { ChatSocketService } from '../services/chat-socket.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCard, MatCardContent, MatCardTitle,
    MatButton, MatIconButton,
    MatIcon,
    MatFormFieldModule, MatInput,
    MatSelect, MatOption,
    MatChip,
    MatProgressSpinner,
    MatTooltipModule,
    MatDivider,
    AdminBookingsComponent,
    AdminLogsComponent,
    AdminModerationComponent,
    AdminPaymentsComponent,
    AdminPostsComponent,
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent implements OnInit, OnDestroy {
  private adminService = inject(AdminService);
  private chatService = inject(ChatService);
  private chatSocket = inject(ChatSocketService);
  private router = inject(Router);
  private subs = new Subscription();

  // Stats
  stats = signal<DashboardStats | null>(null);

  // User list
  users = signal<AdminUser[]>([]);
  total = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  readonly pageSize = 10;

  loading = signal(false);
  actionLoading = signal<number | null>(null); // userId being acted on
  actionMessage = signal('');

  tab = signal<'users' | 'bookings' | 'logs' | 'moderation' | 'payments' | 'posts'>('users');

  /** Set by "Activity" on a user: the Logs tab opens already filtered to that person. */
  logUser = signal('');
  live = signal(false);

  // Inline profile editor (one user at a time)
  editingId = signal<number | null>(null);
  saving = signal(false);
  editForm = new FormGroup({
    firstName:   new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    lastName:    new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    email:       new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(100)] }),
    phoneNumber: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(25)] }),
    street:      new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    city:        new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
    province:    new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(20)] }),
    postalCode:  new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(10)] }),
  });

  readonly editFields = [
    { name: 'firstName', label: 'First name' },
    { name: 'lastName', label: 'Last name' },
    { name: 'email', label: 'Email' },
    { name: 'phoneNumber', label: 'Phone' },
    { name: 'street', label: 'Street' },
    { name: 'city', label: 'City' },
    { name: 'province', label: 'Province' },
    { name: 'postalCode', label: 'Postal code' },
  ] as const;

  // Filters
  roleFilter   = new FormControl('');
  searchFilter = new FormControl('');

  ngOnInit(): void {
    this.loadStats();
    this.loadUsers();

    // Live: the server pushes fresh platform numbers every second
    this.chatSocket.connect();
    this.subs.add(this.chatSocket.on<DashboardStats>('admin:stats').subscribe((s) => { this.stats.set(s); this.live.set(true); }));
    // ...and the user list refreshes when someone registers, is blocked, etc.
    this.subs.add(this.chatSocket.on<{ action: string }>('audit:new').pipe(debounceTime(600)).subscribe((e) => {
      if (this.tab() === 'users' && /^(REGISTER|USER_)/.test(e.action)) this.loadUsers(this.currentPage());
    }));

    // Auto-filter on role change
    this.subs.add(
      this.roleFilter.valueChanges.subscribe(() => this.loadUsers(1))
    );

    // Auto-filter on search with debounce
    this.subs.add(
      this.searchFilter.valueChanges.pipe(
        debounceTime(400),
        distinctUntilChanged()
      ).subscribe(() => this.loadUsers(1))
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /** Admin opens (or starts) a conversation with this user in the Messages inbox. */
  messageUser(user: AdminUser): void {
    this.chatService.startConversation(user.id).subscribe({
      next: (c) => this.router.navigate(['/messages'], { queryParams: { conversation: c.conversationId } }),
      error: () => { this.actionMessage.set('Could not open the conversation.'); setTimeout(() => this.actionMessage.set(''), 4000); },
    });
  }

  /** Jump to the Logs tab filtered to everything this person has done. */
  viewActivity(user: AdminUser): void {
    this.logUser.set(user.email);
    this.tab.set('logs');
  }

  loadStats(): void {
    this.adminService.getStats().subscribe({
      next: (s) => this.stats.set(s),
    });
  }

  loadUsers(page = 1): void {
    this.loading.set(true);
    this.adminService
      .getUsers(
        this.roleFilter.value || undefined,
        this.searchFilter.value || undefined,
        page,
        this.pageSize
      )
      .subscribe({
        next: (result: AdminUserPage) => {
          this.users.set(result.data);
          this.total.set(result.total);
          this.totalPages.set(result.totalPages);
          this.currentPage.set(result.page);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  applyFilters(): void {
    this.loadUsers(1);
  }

  clearFilters(): void {
    this.roleFilter.reset();
    this.searchFilter.reset();
    this.loadUsers(1);
  }

  toggleBlock(user: AdminUser): void {
    this.actionLoading.set(user.id);
    this.actionMessage.set('');
    this.adminService.toggleBlock(user.id, !user.isBlocked).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.loadUsers(this.currentPage());
        this.loadStats();
      },
      error: (err) => {
        this.actionLoading.set(null);
        this.actionMessage.set(err?.error?.message || 'Failed to update user status.');
        setTimeout(() => this.actionMessage.set(''), 4000);
      },
    });
  }

  deleteUser(user: AdminUser): void {
    if (!confirm(`Delete ${user.firstName} ${user.lastName}? They will lose access and their active bookings will be cancelled; history is kept.`)) {
      return;
    }
    this.actionLoading.set(user.id);
    this.actionMessage.set('');
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.loadUsers(this.currentPage());
        this.loadStats();
      },
      error: (err) => {
        this.actionLoading.set(null);
        this.actionMessage.set(err?.error?.message || 'Failed to delete user.');
        setTimeout(() => this.actionMessage.set(''), 4000);
      },
    });
  }

  startEdit(user: AdminUser): void {
    this.editForm.reset({
      firstName: user.firstName, lastName: user.lastName, email: user.email,
      phoneNumber: user.phoneNumber, street: user.street, city: user.city,
      province: user.province, postalCode: user.postalCode,
    });
    this.editingId.set(user.id);
    this.actionMessage.set('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(user: AdminUser): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.adminService.updateUser(user.id, this.editForm.getRawValue()).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
        this.saving.set(false);
        this.editingId.set(null);
      },
      error: (err) => {
        this.saving.set(false);
        this.actionMessage.set(err?.error?.message || 'Failed to update user.');
        setTimeout(() => this.actionMessage.set(''), 4000);
      },
    });
  }

  // Pagination
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.loadUsers(page);
  }

  prevPage(): void { this.goToPage(this.currentPage() - 1); }
  nextPage(): void { this.goToPage(this.currentPage() + 1); }

  get pageNumbers(): number[] {
    const total   = this.totalPages();
    const current = this.currentPage();
    const window  = 2;
    const start   = Math.max(1, current - window);
    const end     = Math.min(total, current + window);
    const nums: number[] = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'ADMIN':     return 'badge-admin';
      case 'PROVIDER':  return 'badge-provider';
      case 'REQUESTER': return 'badge-requester';
      default:          return '';
    }
  }

  getInitials(user: AdminUser): string {
    return (user.firstName[0] + user.lastName[0]).toUpperCase();
  }
}
