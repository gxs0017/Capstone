import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
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
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent implements OnInit, OnDestroy {
  private adminService = inject(AdminService);
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

  // Filters
  roleFilter   = new FormControl('');
  searchFilter = new FormControl('');

  ngOnInit(): void {
    this.loadStats();
    this.loadUsers();

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
    if (!confirm(`Permanently delete ${user.firstName} ${user.lastName}? This cannot be undone.`)) {
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
