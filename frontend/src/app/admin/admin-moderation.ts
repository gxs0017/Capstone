import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { AdminService, FlaggedMessage } from '../services/admin.service';

/** Admin "Moderation" tab: held (auto-flagged) chat messages awaiting human review.
 *  Approving delivers the message into the conversation; rejecting keeps it
 *  permanently hidden. There is no automated flagging yet (see backend
 *  utils/chatModeration.js), so this queue is normally empty for now. */
@Component({
  selector: 'app-admin-moderation',
  standalone: true,
  imports: [CommonModule, MatCard, MatCardContent, MatButton, MatIcon, MatProgressSpinner],
  templateUrl: './admin-moderation.html',
  styleUrl: './admin.css',
})
export class AdminModerationComponent implements OnInit {
  private adminService = inject(AdminService);

  messages = signal<FlaggedMessage[]>([]);
  loading = signal(false);
  actionLoading = signal<number | null>(null);
  actionMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminService.getFlaggedMessages().subscribe({
      next: (messages) => {
        this.messages.set(messages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  review(msg: FlaggedMessage, approve: boolean): void {
    this.actionLoading.set(msg.messageId);
    this.adminService.reviewFlaggedMessage(msg.messageId, approve).subscribe({
      next: () => {
        this.actionLoading.set(null);
        this.messages.update((list) => list.filter((m) => m.messageId !== msg.messageId));
      },
      error: (err) => {
        this.actionLoading.set(null);
        this.actionMessage.set(err?.error?.message || 'Failed to review message.');
        setTimeout(() => this.actionMessage.set(''), 4000);
      },
    });
  }
}
