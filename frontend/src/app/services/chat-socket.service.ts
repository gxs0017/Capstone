import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../core/api.config';
import { AuthService } from './auth.service';
import { ChatMessage } from './chat.service';

/**
 * Owns the one Socket.IO connection for the whole app: chat messages plus the
 * live board and booking events (`on('post:new')`, `on('booking:changed')`, …). Lifecycle (connect/disconnect)
 * is driven by the navbar (tied to login state) so the connection — and the
 * unread badge it feeds — stays alive across the whole app, not just while
 * the /messages page is open.
 *
 * `newMessage$` is a long-lived Subject rather than wrapping the socket
 * directly, so a subscriber doesn't need to care whether it attached before
 * or after `connect()` actually created the underlying socket.
 */
@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private authService = inject(AuthService);
  private socket: Socket | null = null;
  private newMessage$ = new Subject<ChatMessage>();
  private events$ = new Subject<{ event: string; payload: any }>();
  private watchedPosts = new Set<number>();
  private socketToken: string | null = null;
  private hasConnected = false;

  /**
   * Opens the app's one socket. Signed-in users get their private channels (chat,
   * bookings, notifications; admins also get the live logs). Visitors who aren't
   * signed in connect as guests and still receive the public live data
   * (directory, board). If the sign-in state changed since the socket was
   * opened, it is replaced so the right channels are joined.
   */
  connect(): void {
    const token = this.authService.getToken() ?? null;

    // Already connected (or reconnecting) as the same person — never open a second socket
    if (this.socket?.active && this.socketToken === token) return;

    this.socket?.disconnect();
    this.socketToken = token;
    this.hasConnected = false;

    this.socket = io(SOCKET_URL, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.socket.on('message:new', (msg: ChatMessage) => this.newMessage$.next(msg));
    // Every other event (board, bookings, …) flows through one stream
    this.socket.onAny((event: string, payload: unknown) => {
      if (event !== 'message:new') this.events$.next({ event, payload });
    });
    // After a reconnect the server forgets post rooms; re-join the ones still open
    this.socket.on('connect', () => {
      this.watchedPosts.forEach((id) => this.socket?.emit('post:join', id));
      // After a dropped connection anything could have changed meanwhile: tell the pages to refetch
      if (this.hasConnected) this.events$.next({ event: 'socket:reconnected', payload: null });
      this.hasConnected = true;
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.socketToken = null;
    this.watchedPosts.clear();
  }

  /** A live stream of one server event, e.g. `on<Post>('post:new')`. */
  on<T = any>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const sub = this.events$.subscribe((e) => { if (e.event === event) subscriber.next(e.payload as T); });
      return () => sub.unsubscribe();
    });
  }

  /** Watch one board post's comments live (call leavePost when the page closes). */
  joinPost(postId: number): void {
    this.watchedPosts.add(postId);
    this.socket?.emit('post:join', postId);
  }

  leavePost(postId: number): void {
    this.watchedPosts.delete(postId);
    this.socket?.emit('post:leave', postId);
  }

  joinConversation(conversationId: number): void {
    this.socket?.emit('conversation:join', conversationId);
  }

  leaveConversation(conversationId: number): void {
    this.socket?.emit('conversation:leave', conversationId);
  }

  /** Every new message this socket's rooms receive (every conversation it's part of). */
  onNewMessage(): Observable<ChatMessage> {
    return this.newMessage$.asObservable();
  }
}
