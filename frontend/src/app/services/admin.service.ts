import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';
import { Booking } from './booking.service';

export interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserPage {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AdminUserUpdate = Partial<Pick<AdminUser,
  'firstName' | 'lastName' | 'email' | 'phoneNumber' | 'street' | 'city' | 'province' | 'postalCode'>>;

export interface AdminBookingPage {
  data: Booking[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  totalUsers: number;
  totalProviders: number;
  totalRequesters: number;
  totalBookings: number;
  pendingBookings: number;
  blockedUsers: number;
  totalServices: number;
}

export interface AuditLogEntry {
  audit_id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface FlaggedMessage {
  messageId: number;
  conversationId: number;
  sender: { id: number; firstName: string; lastName: string };
  content: string;
  ipAddress: string | null;
  flagReason: string | null;
  status: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly API = `${API_BASE}/admin`;

  constructor(private http: HttpClient) {}

  getUsers(role?: string, search?: string, page = 1, limit = 20): Observable<AdminUserPage> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));
    if (role) params = params.set('role', role);
    if (search) params = params.set('search', search);
    return this.http.get<AdminUserPage>(`${this.API}/users`, { params });
  }

  updateUser(userId: number, changes: AdminUserUpdate): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.API}/users/${userId}`, changes);
  }

  toggleBlock(userId: number, blocked: boolean): Observable<any> {
    return this.http.patch(`${this.API}/users/${userId}/block`, { blocked });
  }

  deleteUser(userId: number): Observable<any> {
    return this.http.delete(`${this.API}/users/${userId}`);
  }

  getBookings(status?: string, search?: string, page = 1, limit = 10): Observable<AdminBookingPage> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));
    if (status) params = params.set('status', status);
    if (search) params = params.set('search', search);
    return this.http.get<AdminBookingPage>(`${this.API}/bookings`, { params });
  }

  /** Admins can cancel any active booking at any time (no cutoff). Uses the shared status endpoint. */
  cancelBooking(bookingId: number, reason?: string): Observable<{ message: string; refunded: boolean }> {
    return this.http.patch<{ message: string; refunded: boolean }>(
      `${this.API.replace('/admin', '')}/bookings/${bookingId}/status`,
      { status: 'CANCELLED', reason: reason || undefined },
    );
  }

  getStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.API}/stats`);
  }

  getAuditLogs(limit = 100): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>(`${this.API}/audit-logs`, { params: { limit: String(limit) } });
  }

  getFlaggedMessages(): Observable<FlaggedMessage[]> {
    return this.http.get<FlaggedMessage[]>(`${this.API}/chat/flagged`);
  }

  reviewFlaggedMessage(messageId: number, approve: boolean): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.API}/chat/flagged/${messageId}`, { approve });
  }

  deletePost(postId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API}/posts/${postId}`);
  }

  getPayments(): Observable<AdminPaymentsOverview> {
    return this.http.get<AdminPaymentsOverview>(`${this.API}/payments`);
  }

  settlePayments(): Observable<unknown> {
    return this.http.post(`${this.API}/payments/settle`, {});
  }
}

export interface AdminPaymentEntry {
  paymentId: number;
  bookingId: number;
  service: string;
  method: string;
  status: string;
  currency: string;
  amount: number;
  platformFee: number;
  providerAmount: number;
  createdAt: string;
  payer: { id: number; name: string };
  provider: { id: number; name: string };
  refundError?: string | null;
}

export interface AdminPaymentsOverview {
  currency: string;
  totals: Record<string, { count: number; gross: number; fees: number }>;
  entries: AdminPaymentEntry[];
}
