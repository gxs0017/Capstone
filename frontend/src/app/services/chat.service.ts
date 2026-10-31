import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE } from '../core/api.config';

export type MessageStatus = 'SENT' | 'BLOCKED' | 'APPROVED' | 'REJECTED';

export interface Conversation {
  conversationId: number;
  otherParticipant: {
    id: number;
    firstName: string;
    lastName: string;
  };
  pinnedBookingId: number | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  messageId: number;
  conversationId: number;
  senderId: number;
  status: MessageStatus;
  /** null when this message is held/rejected and isn't yours to read. */
  content: string | null;
  /** Present only on your own held/rejected message — reference it when asking an admin why. */
  caseId?: number;
  isRead: boolean;
  createdAt: string;
}

export interface BookingOption {
  bookingId: number;
  service: string;
  status: string;
  scheduledDate: string | null;
  price: number | null;
  paymentStatus: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly API = `${API_BASE}/chat`;

  /** Total unread messages across every conversation — drives the navbar badge. */
  unreadTotal = signal(0);

  constructor(private http: HttpClient) {}

  getConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.API}/conversations`);
  }

  refreshUnreadCount(): void {
    this.http.get<{ total: number }>(`${this.API}/unread-count`).subscribe({
      next: (res) => this.unreadTotal.set(res.total),
      error: () => {},
    });
  }

  startConversation(otherUserId: number, bookingId?: number): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.API}/conversations`, { otherUserId, bookingId });
  }

  getBookingOptions(conversationId: number): Observable<BookingOption[]> {
    return this.http.get<BookingOption[]>(`${this.API}/conversations/${conversationId}/booking-options`);
  }

  pinBooking(conversationId: number, bookingId: number | null): Observable<Conversation> {
    return this.http.patch<Conversation>(`${this.API}/conversations/${conversationId}/pin`, { bookingId });
  }

  getMessages(conversationId: number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.API}/conversations/${conversationId}/messages`);
  }

  markConversationRead(conversationId: number): Observable<{ success: boolean; markedRead: number }> {
    return this.http.patch<{ success: boolean; markedRead: number }>(
      `${this.API}/conversations/${conversationId}/read`,
      {},
    ).pipe(tap(() => this.refreshUnreadCount()));
  }

  sendMessage(conversationId: number, content: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.API}/conversations/${conversationId}/messages`, { content });
  }
}
