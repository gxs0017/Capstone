import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../core/api.config';
import { AuthService } from './auth.service';
import { ChatMessage } from './chat';

@Injectable({
  providedIn: 'root',
})
export class ChatSocketService {
  private authService = inject(AuthService);
  private socket: Socket | null = null;

  //Opens an authenticated connection if one isn't active
  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) return; 

    //websockets are prioritized but allows the user to repeated re check
    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }

  joinConversation(conversationId: number): void {
    this.socket?.emit('conversation:join', conversationId);
  }

  leaveConversation(conversationId: number): void {
    this.socket?.emit('conversation:leave', conversationId);
  }

  //turns the sockets new message events into observables
  onNewMessage(): Observable<ChatMessage> {
    return new Observable<ChatMessage>((subscriber) => {
      if (!this.socket) {
        subscriber.complete();
        return;
      }
      const handler = (msg: ChatMessage) => subscriber.next(msg);
      this.socket.on('message:new', handler);
      return () => this.socket?.off('message:new', handler);
    });
  }

  //closes the socket
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
