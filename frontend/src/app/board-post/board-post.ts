import { Component, inject, signal, computed, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PostService, Post, PostComment } from '../services/post.service';
import { ChatService } from '../services/chat.service';
import { AuthService } from '../services/auth.service';
import { ChatSocketService } from '../services/chat-socket.service';
import { AdminService } from '../services/admin.service';
import { PostCategory, categoryOf } from '../core/post-meta';
import { timeAgo } from '../core/time-ago';

interface Thread {
  comment: PostComment;
  replies: PostComment[];
}

/** One board post with its full, public comment thread. Anyone can read it;
 *  signed-in members can comment, reply and like. */
@Component({
  selector: 'app-board-post',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatButton, MatIconButton, MatIcon,
    MatFormField, MatLabel, MatInput,
    MatProgressSpinner, MatTooltipModule,
  ],
  templateUrl: './board-post.html',
  styleUrl: './board-post.css',
})
export class BoardPostComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private postService = inject(PostService);
  private chatService = inject(ChatService);
  private adminService = inject(AdminService);
  private snackBar = inject(MatSnackBar);
  private chatSocket = inject(ChatSocketService);
  private destroyRef = inject(DestroyRef);
  authService = inject(AuthService);

  postId = 0;
  post = signal<Post | null>(null);
  comments = signal<PostComment[]>([]);
  loading = signal(true);
  notFound = signal(false);

  newComment = '';
  sending = signal(false);
  replyingTo = signal<number | null>(null);
  replyText = '';
  messaging = signal(false);

  /** Top-level comments, each with its replies underneath (oldest first). */
  threads = computed<Thread[]>(() => {
    const all = this.comments();
    return all
      .filter((c) => c.parentId === null)
      .map((comment) => ({ comment, replies: all.filter((r) => r.parentId === comment.commentId) }));
  });

  canParticipate = computed(() => this.authService.isLoggedIn() && !this.authService.isAdmin());

  ngOnInit(): void {
    this.postId = Number(this.route.snapshot.paramMap.get('id'));
    if (!this.postId) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.postService.getPost(this.postId).subscribe({
      next: (post) => {
        this.post.set(post);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
    this.loadComments();

    // Live: other people's comments, deletions and like counts appear without a refresh
    this.chatSocket.joinPost(this.postId);
    const live = <T>(event: string) => this.chatSocket.on<T>(event).pipe(takeUntilDestroyed(this.destroyRef));
    live<PostComment>('comment:new').subscribe((c) => {
      if (c.postId !== this.postId) return;
      this.comments.update((list) => (list.some((x) => x.commentId === c.commentId) ? list : [...list, c]));
    });
    live<{ postId: number; commentId: number }>('comment:removed').subscribe((e) => {
      if (e.postId !== this.postId) return;
      this.comments.update((list) => list.filter((x) => x.commentId !== e.commentId && x.parentId !== e.commentId));
    });
    live<{ postId: number; likeCount: number; commentCount: number }>('post:stats').subscribe((e) => {
      if (e.postId === this.postId) this.post.update((p) => (p ? { ...p, likeCount: e.likeCount, commentCount: e.commentCount } : p));
    });
    live<{ postId: number }>('post:removed').subscribe((e) => {
      if (e.postId === this.postId) this.post.update((p) => (p ? { ...p, status: 'CLOSED' } : p));
    });
  }

  ngOnDestroy(): void {
    if (this.postId) this.chatSocket.leavePost(this.postId);
  }

  private loadComments(): void {
    this.postService.getComments(this.postId).subscribe({
      next: (list) => this.comments.set(list),
      error: () => {},
    });
  }

  // ── Comments ────────────────────────────────────────────────────────────────
  submitComment(): void {
    const content = this.newComment.trim();
    if (!content || this.sending()) return;
    this.send(content);
  }

  startReply(commentId: number): void {
    this.replyingTo.set(this.replyingTo() === commentId ? null : commentId);
    this.replyText = '';
  }

  submitReply(parentId: number): void {
    const content = this.replyText.trim();
    if (!content || this.sending()) return;
    this.send(content, parentId);
  }

  private send(content: string, parentId?: number): void {
    this.sending.set(true);
    this.postService.addComment(this.postId, content, parentId).subscribe({
      next: (comment) => {
        // The live event may already have added it; never show a comment twice
        this.comments.update((list) => (list.some((x) => x.commentId === comment.commentId) ? list : [...list, comment]));
        this.post.update((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
        this.sending.set(false);
        if (parentId) {
          this.replyingTo.set(null);
          this.replyText = '';
        } else {
          this.newComment = '';
        }
      },
      error: (err) => {
        this.sending.set(false);
        this.notify(err?.error?.message || 'Could not post your comment.');
      },
    });
  }

  canDelete(c: PostComment): boolean {
    return this.authService.isAdmin() || this.authService.currentUser()?.id === c.author.id;
  }

  deleteComment(c: PostComment): void {
    if (!confirm('Delete this comment?' + (c.parentId === null ? ' Any replies under it will be removed too.' : ''))) return;
    this.postService.deleteComment(this.postId, c.commentId).subscribe({
      next: () => {
        // Drop the comment and (if it was a top-level one) its replies
        const gone = new Set<number>([c.commentId]);
        this.comments().filter((x) => x.parentId === c.commentId).forEach((x) => gone.add(x.commentId));
        this.comments.update((list) => list.filter((x) => !gone.has(x.commentId)));
        this.post.update((p) => (p ? { ...p, commentCount: Math.max(0, p.commentCount - gone.size) } : p));
      },
      error: () => this.notify('Could not delete the comment.'),
    });
  }

  // ── Post actions ────────────────────────────────────────────────────────────
  toggleLike(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    if (!this.canParticipate()) return;
    this.postService.toggleLike(this.postId).subscribe({
      next: (res) => this.post.update((p) => (p ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p)),
      error: () => this.notify('Could not update your like.'),
    });
  }

  message(): void {
    const post = this.post();
    if (!post) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.messaging.set(true);
    this.chatService.startConversation(post.poster.id).subscribe({
      next: (conversation) => {
        this.messaging.set(false);
        this.router.navigate(['/messages'], { queryParams: { conversation: conversation.conversationId } });
      },
      error: () => {
        this.messaging.set(false);
        this.notify('Could not start the conversation. Please try again.');
      },
    });
  }

  closePost(): void {
    if (!confirm('Mark this post as fulfilled? It will leave the board.')) return;
    this.postService.closePost(this.postId).subscribe({
      next: () => this.post.update((p) => (p ? { ...p, status: 'CLOSED' } : p)),
      error: () => this.notify('Could not close the post.'),
    });
  }

  deletePost(): void {
    if (!confirm('Delete this post and all its comments? This cannot be undone.')) return;
    this.adminService.deletePost(this.postId).subscribe({
      next: () => this.router.navigate(['/board']),
      error: () => this.notify('Could not delete the post.'),
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  isMine(): boolean {
    return this.authService.currentUser()?.id === this.post()?.poster.id;
  }

  meta(): PostCategory | null {
    const p = this.post();
    return p ? categoryOf(p.type) : null;
  }

  priceText(): string | null {
    const p = this.post();
    if (!p || p.price === null) return null;
    return p.type === 'FOR_SALE' && p.price === 0 ? 'Free' : `$${p.price}`;
  }

  ago(value: string): string {
    return timeAgo(value);
  }

  initials(first: string, last: string): string {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000, horizontalPosition: 'center', verticalPosition: 'bottom' });
  }

  trackByComment(_i: number, c: PostComment): number {
    return c.commentId;
  }
}
