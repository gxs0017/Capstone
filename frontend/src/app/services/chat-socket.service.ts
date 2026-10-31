import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../core/api.config';
import { AuthService } from './auth.service';
import { ChatMessage } from './chat.service';

/**
 * Owns the one Socket.IO connection for chat. Lifecycle (connect/disconnect)
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

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) return;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.socket.on('message:new', (msg: ChatMessage) => this.newMessage$.next(msg));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
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
