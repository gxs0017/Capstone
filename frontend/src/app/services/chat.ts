import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** A conversation row as returned by the backend inbox query (BRIDGE 1). */
export interface Conversation {
  conversation_id: number;
  participant_one_id: number;
  participant_two_id: number;
  booking_id: number | null;
  created_at: string;
  updated_at: string;
  //participant names
  p1_first: string;
  p1_last: string;
  p2_first: string;
  p2_last: string;
  // count of unread messages
  unread_count?: number;
  // is a chatroom already exists or not
  existing?: boolean;
}

export interface ChatMessage {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: boolean | number;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {

  private apiUrl = 'http://localhost:5000/api/chat';

  constructor(private http: HttpClient) { }

  // getsthe data for the inbox page

  getMyConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.apiUrl}/conversations`);
  }

  // create a new or get directed to an existing chatroom between users 
  startConversation(otherUserId: number, bookingId?: number): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.apiUrl}/conversations`, {
      otherUserId,
      bookingId
    });
  }

  // recieve the messagesfrom the chatrooms
  getConversationMessages(conversationId: number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.apiUrl}/conversations/${conversationId}/messages`);
  }

  //marks unread as read messages
  markConversationRead(conversationId: number): Observable<{ success: boolean; markedRead: number }> {
    return this.http.patch<{ success: boolean; markedRead: number }>(
      `${this.apiUrl}/conversations/${conversationId}/read`,
      {}
    );
  }

  // sending a new message
  sendMessage(conversationId: number, content: string): Observable<{ success: boolean; messageId: number }> {
    return this.http.post<{ success: boolean; messageId: number }>(
      `${this.apiUrl}/conversations/${conversationId}/messages`,
      { content }
    );
  }
}
