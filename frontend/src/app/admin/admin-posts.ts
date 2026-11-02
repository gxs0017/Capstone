import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminService, AdminPost } from '../services/admin.service';
import { ChatSocketService } from '../services/chat-socket.service';

/** Admin "Posts" tab: every board post in any state. Archive hides a post but keeps it;
 *  Remove takes it down for good (still on record); Restore puts it back. The author
 *  is told why, and every action is logged. */
@Component({
  selector: 'app-admin-posts',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCard, MatCardContent, MatButton, MatIconButton, MatIcon,
    MatFormFieldModule, MatInput, MatSelect, MatOption, MatProgressSpinner, MatTooltipModule,
  ],
  templateUrl: './admin-posts.html',
  styleUrl: './admin.css',
})
export class AdminPostsComponent implements OnInit {
  private adminService = inject(AdminService);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);

  posts = signal<AdminPost[]>([]);
  total = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  loading = signal(false);
  busyId = signal<number | null>(null);
  message = signal('');

  /** The post an action panel is open on, and which action. */
  acting = signal<{ post: AdminPost; action: 'ARCHIVE' | 'REMOVE' } | null>(null);
  reasonCtl = new FormControl('');

  statusFilter = new FormControl('');
  searchFilter = new FormControl('');
  readonly statuses = ['OPEN', 'CLOSED', 'ARCHIVED', 'REMOVED'];

  ngOnInit(): void {
    this.load(1);
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(1));
    this.searchFilter.valueChanges.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(1));

    // Live: new posts, comments and likes show up as they happen
    this.chatSocket.connect();
    this.chatSocket.on<{ action: string }>('audit:new').pipe(debounceTime(600), takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => { if (/^(POST_|COMMENT_)/.test(e.action)) this.load(this.currentPage(), true); });
  }

  load(page = 1, silent = false): void {
    if (!silent) this.loading.set(true);
    this.adminService.getAdminPosts(
      { status: this.statusFilter.value || undefined, search: this.searchFilter.value || undefined }, page,
    ).subscribe({
      next: (res) => {
        this.posts.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.currentPage.set(res.page);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  begin(post: AdminPost, action: 'ARCHIVE' | 'REMOVE'): void {
    this.reasonCtl.setValue('');
    this.acting.set({ post, action });
  }

  cancel(): void {
    this.acting.set(null);
  }

  confirm(): void {
    const a = this.acting();
    const reason = (this.reasonCtl.value || '').trim();
    if (!a) return;
    if (reason.length < 3) { this.flash('Please give a reason — the author is told why.'); return; }
    this.run(a.post, a.action, reason);
  }

  restore(post: AdminPost): void {
    this.run(post, 'RESTORE');
  }

  private run(post: AdminPost, action: 'ARCHIVE' | 'REMOVE' | 'RESTORE', reason?: string): void {
    this.busyId.set(post.postId);
    this.adminService.moderatePost(post.postId, action, reason).subscribe({
      next: () => {
        this.busyId.set(null);
        this.acting.set(null);
        this.flash(action === 'RESTORE' ? 'Post restored to the board.' : action === 'ARCHIVE' ? 'Post archived.' : 'Post removed.');
        this.load(this.currentPage(), true);
      },
      error: (err) => { this.busyId.set(null); this.flash(err?.error?.message || 'Could not update the post.'); },
    });
  }

  private flash(msg: string): void {
    this.message.set(msg);
    setTimeout(() => this.message.set(''), 4000);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }
}
