import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE } from '../core/api.config';

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** The signed-in user's notification feed: loaded once, then kept current by the socket. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private readonly API = `${API_BASE}/notifications`;

  items = signal<AppNotification[]>([]);
  unread = signal(0);

  load(): void {
    this.http.get<{ unread: number; data: AppNotification[] }>(this.API, { params: { limit: '30' } }).subscribe({
      next: (res) => { this.items.set(res.data); this.unread.set(res.unread); },
      error: () => {},
    });
  }

  /** A notification pushed live over the socket. */
  receive(n: AppNotification): void {
    this.items.update((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list].slice(0, 30)));
    this.unread.update((c) => c + 1);
  }

  markRead(n: AppNotification): void {
    if (n.isRead) return;
    this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    this.unread.update((c) => Math.max(0, c - 1));
    this.http.patch<{ unread: number }>(`${this.API}/${n.id}/read`, {}).subscribe({ error: () => {} });
  }

  markAllRead(): Observable<unknown> {
    this.items.update((list) => list.map((x) => ({ ...x, isRead: true })));
    this.unread.set(0);
    return this.http.patch(`${this.API}/read-all`, {}).pipe(tap({ error: () => this.load() }));
  }

  clear(): void {
    this.items.set([]);
    this.unread.set(0);
  }

  iconFor(type: string): string {
    if (type.startsWith('PAYMENT') || type.startsWith('PAYOUT')) return 'payments';
    if (type.startsWith('BOOKING_RECEIVED') || type === 'BOOKING_SENT') return 'event_available';
    if (type.startsWith('BOOKING')) return 'event_note';
    if (type === 'SERVICE_LIVE') return 'storefront';
    if (type === 'ADMIN_MESSAGE') return 'admin_panel_settings';
    if (type.startsWith('POST') || type.startsWith('COMMENT')) return 'forum';
    if (type === 'REVIEW_RECEIVED') return 'star';
    return 'notifications';
  }

  ago(iso: string): string {
    const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (secs < 45) return 'just now';
    if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
    if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }
}
