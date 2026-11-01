import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PostService, Post, PostType } from '../services/post.service';
import { ChatService } from '../services/chat.service';
import { AuthService } from '../services/auth.service';
import { AdminService } from '../services/admin.service';
import { POST_CATEGORIES, PostCategory, categoryOf } from '../core/post-meta';
import { timeAgo } from '../core/time-ago';
import { DirectoryService, DirectoryEntry } from '../services/directory.service';
import { ChatSocketService } from '../services/chat-socket.service';

/** The Community Board: a neighbourhood feed alongside the normal search/book
 *  flow. Anyone can browse and read comments; logged-in members can post,
 *  comment, like, and message the poster. Defaults to "near me" (your city). */
@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatButton, MatIconButton, MatIcon,
    MatFormField, MatLabel, MatSuffix, MatInput,
    MatProgressSpinner,
    MatTooltipModule,
  ],
  templateUrl: './board.html',
  styleUrl: './board.css',
})
export class BoardComponent implements OnInit {
  private postService = inject(PostService);
  private chatService = inject(ChatService);
  private adminService = inject(AdminService);
  private directoryService = inject(DirectoryService);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  authService = inject(AuthService);

  readonly categories = POST_CATEGORIES;

  posts = signal<Post[]>([]);
  loading = signal(false);
  total = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  readonly pageSize = 10;

  categoryFilter = signal<PostType | ''>('');
  searchTerm = '';

  /** HOOD = the viewer's own neighbourhood, CITY = their city, ALL = everywhere. */
  areaMode = signal<'HOOD' | 'CITY' | 'ALL'>('ALL');
  myCity = computed(() => this.authService.currentUser()?.city || '');
  myHood = computed(() => this.authService.currentUser()?.neighbourhood || '');

  /** New posts that arrived live while the viewer was reading (shown as a "Show N new posts" pill). */
  newPosts = signal(0);

  /** "Recommended near you": nearest, best-rated providers (generated, never posted). */
  recommended = signal<DirectoryEntry[]>([]);

  composerOpen = signal(false);
  creating = signal(false);
  respondLoading = signal<number | null>(null);
  actionLoading = signal<number | null>(null);

  draft: { type: PostType; title: string; description: string; price: string } = {
    type: 'GENERAL', title: '', description: '', price: '',
  };

  get draftCategory(): PostCategory {
    return categoryOf(this.draft.type);
  }

  ngOnInit(): void {
    // Hyperlocal by default once we know where the viewer lives
    if (this.authService.isLoggedIn()) {
      if (this.myHood()) this.areaMode.set('HOOD');
      else if (this.myCity()) this.areaMode.set('CITY');
    }
    this.load(1);
    // Live feed: new posts surface as a pill (the list never jumps under the reader), counts update in place
    const live = <T>(event: string) => this.chatSocket.on<T>(event).pipe(takeUntilDestroyed(this.destroyRef));
    live<Post>('post:new').subscribe((p) => {
      if (p.poster.id !== this.authService.currentUser()?.id) this.newPosts.update((n) => n + 1);
    });
    live<{ postId: number; likeCount: number; commentCount: number }>('post:stats').subscribe((e) =>
      this.posts.update((list) => list.map((p) => (p.postId === e.postId ? { ...p, likeCount: e.likeCount, commentCount: e.commentCount } : p))));
    live<{ postId: number }>('post:removed').subscribe((e) => {
      this.posts.update((list) => list.filter((p) => p.postId !== e.postId));
      this.total.update((n) => Math.max(0, n - 1));
    });

    this.directoryService.getRecommendations(6).subscribe({
      next: (res) => this.recommended.set(res.data),
      error: () => {},
    });
  }

  load(page = 1): void {
    this.newPosts.set(0);
    this.loading.set(true);
    this.postService.getPosts(
      {
        type: this.categoryFilter() || undefined,
        search: this.searchTerm || undefined,
        city: this.areaMode() === 'CITY' ? this.myCity() : undefined,
        scope: this.areaMode() === 'HOOD' ? 'neighbourhood' : undefined,
      },
      page,
      this.pageSize,
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

  setCategory(type: PostType | ''): void {
    this.categoryFilter.set(type);
    this.load(1);
  }

  setArea(mode: 'HOOD' | 'CITY' | 'ALL'): void {
    this.areaMode.set(mode);
    this.load(1);
  }

  onSearch(): void {
    this.load(1);
  }

  // ── Composer ────────────────────────────────────────────────────────────────
  openComposer(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    if (this.authService.isAdmin()) {
      this.notify('Admins moderate the board but do not post to it.');
      return;
    }
    this.composerOpen.set(true);
  }

  closeComposer(): void {
    this.composerOpen.set(false);
  }

  pickCategory(type: PostType): void {
    this.draft.type = type;
  }

  submitPost(): void {
    if (!this.draft.title.trim() || !this.draft.description.trim()) return;

    this.creating.set(true);
    this.postService.createPost({
      type: this.draft.type,
      title: this.draft.title,
      description: this.draft.description,
      price: this.draftCategory.priceLabel && this.draft.price !== '' ? Number(this.draft.price) : null,
    }).subscribe({
      next: () => {
        this.creating.set(false);
        this.composerOpen.set(false);
        this.draft = { type: 'GENERAL', title: '', description: '', price: '' };
        // Show the new post: switch to the matching view if the filters would hide it
        this.categoryFilter.set('');
        this.searchTerm = '';
        this.load(1);
        this.notify('Posted to the board.');
      },
      error: (err) => {
        this.creating.set(false);
        this.notify(err?.error?.message || 'Could not create the post.');
      },
    });
  }

  // ── Card actions ────────────────────────────────────────────────────────────
  toggleLike(post: Post): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    if (this.authService.isAdmin()) return;
    this.postService.toggleLike(post.postId).subscribe({
      next: (res) => this.posts.update((list) =>
        list.map((p) => (p.postId === post.postId ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p))),
      error: () => this.notify('Could not update your like.'),
    });
  }

  respond(post: Post): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.respondLoading.set(post.postId);
    this.chatService.startConversation(post.poster.id).subscribe({
      next: (conversation) => {
        this.respondLoading.set(null);
        this.router.navigate(['/messages'], { queryParams: { conversation: conversation.conversationId } });
      },
      error: () => {
        this.respondLoading.set(null);
        this.notify('Could not start the conversation. Please try again.');
      },
    });
  }

  closePost(post: Post): void {
    if (!confirm('Mark this post as fulfilled and remove it from the board?')) return;
    this.actionLoading.set(post.postId);
    this.postService.closePost(post.postId).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.load(this.currentPage());
      },
      error: () => {
        this.actionLoading.set(null);
        this.notify('Could not close the post.');
      },
    });
  }

  deletePost(post: Post): void {
    if (!confirm(`Delete this post ("${post.title}") and all its comments? This cannot be undone.`)) return;
    this.actionLoading.set(post.postId);
    this.adminService.deletePost(post.postId).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.load(this.currentPage());
      },
      error: () => {
        this.actionLoading.set(null);
        this.notify('Could not delete the post.');
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  isMine(post: Post): boolean {
    return this.authService.currentUser()?.id === post.poster.id;
  }

  meta(post: Post): PostCategory {
    return categoryOf(post.type);
  }

  ago(value: string): string {
    return timeAgo(value);
  }

  priceText(post: Post): string | null {
    if (post.price === null) return null;
    if (post.type === 'FOR_SALE' && post.price === 0) return 'Free';
    return `$${post.price}`;
  }

  topService(e: DirectoryEntry): string {
    return e.services[0] ? `${e.services[0].name} · $${e.services[0].price}` : '';
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000, horizontalPosition: 'center', verticalPosition: 'bottom' });
  }

  trackByPost(_i: number, post: Post): number {
    return post.postId;
  }
}
