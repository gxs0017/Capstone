import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'DECLINED' | 'COMPLETED' | 'EXPIRED';
export type BookingType = 'ONE_TIME' | 'RECURRING';
export type ProblemReason = 'NO_SHOW' | 'NOT_DONE' | 'NOT_AS_AGREED' | 'UNREACHABLE' | 'PLANS_CHANGED' | 'OTHER';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED' | 'FAILED';

export interface Booking {
  bookingId: number;
  status: BookingStatus;
  paymentMethod: string | null;
  amount: number | null;
  paymentIntentId: string | null;
  scheduledDate: string | null;
  notes: string | null;
  bookingDate: string;
  service: string;
  bookingType: BookingType;
  batchId: string | null;
  sessionNumber: number;
  sessionsInBatch: number;
  price: number | null;
  discountPercent: number;
  paymentStatus: PaymentStatus;
  declineReason: string | null;
  /** Server-computed: false once inside the cancellation cutoff (requesters). */
  canCancel: boolean;
  /** Server-computed: the requester can leave a review now (job finished, not yet reviewed). */
  canReview?: boolean;
  cancelDeadline: string | null;
  /** Cancellation log: set once a booking has been cancelled. */
  cancellation: { at: string; reason: string | null; by: string | null; byRole: string | null } | null;
  /** An open problem the requester reported — the payment is on hold while it is reviewed. */
  issue?: { reportedAt: string; note: string | null } | null;
  completedAt?: string | null;
  autoCompleted?: boolean;
  provider: {
    id: number;
    firstName: string;
    lastName: string;
    city: string;
    province: string;
  };
  requester: {
    id: number;
    firstName: string;
    lastName: string;
  };
  review: {
    reviewId: number;
    rating: number;
    comment: string | null;
  } | null;
}

export interface CreateBookingPayload {
  providerId: number;
  serviceId: number;
  scheduledDate: string;
  notes?: string;
  bookingType?: BookingType;
  sessions?: number;
}

export interface BookingQuote {
  bookingType: BookingType;
  sessions: number;
  basePrice: number;
  discountPercent: number;
  perSessionPrice: number;
  total: number;
  fullPriceTotal: number;
  savings: number;
  sessionOptions: number[];
  minLeadMinutes: number;
  cancelCutoffHours: number;
  pendingExpiryHours: number;
  sessionMinutes: number;
  horizonDays: number;
}

export interface CreateBookingResponse {
  message: string;
  bookingId: number;
  bookingIds: number[];
  batchId: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  scheduledDates: string[];
  quote: Omit<BookingQuote, 'sessionOptions' | 'minLeadMinutes' | 'cancelCutoffHours' | 'pendingExpiryHours' | 'sessionMinutes' | 'horizonDays'>;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly API = `${API_BASE}/bookings`;

  constructor(private http: HttpClient) {}

  createBooking(payload: CreateBookingPayload): Observable<CreateBookingResponse> {
    return this.http.post<CreateBookingResponse>(this.API, payload);
  }

  /** Price breakdown and booking rules straight from the backend. */
  getQuote(serviceId: number, type: BookingType, sessions?: number, providerId?: number): Observable<BookingQuote> {
    const params: Record<string, string> = { serviceId: String(serviceId), type };
    if (type === 'RECURRING' && sessions) params['sessions'] = String(sessions);
    if (providerId) params['providerId'] = String(providerId);
    return this.http.get<BookingQuote>(`${this.API}/quote`, { params });
  }

  getMyBookings(view?: 'requests'): Observable<Booking[]> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.get<Booking[]>(`${this.API}/my`, { params });
  }

  /** Single booking detail — used by the chat "pinned booking" context panel. */
  getBookingById(bookingId: number): Observable<Booking> {
    return this.http.get<Booking>(`${this.API}/${bookingId}`);
  }

  /** The requester reports a problem: the payment stays on hold until an admin reviews it. */
  reportIssue(bookingId: number, note: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.API}/${bookingId}/issue`, { note });
  }

  /** The requester reports what went wrong: the booking is cancelled and any payment is refunded. */
  reportProblem(bookingId: number, reason: ProblemReason, details?: string): Observable<{ message: string; refunded: boolean; refundStatus: string | null }> {
    return this.http.post<{ message: string; refunded: boolean; refundStatus: string | null }>(
      `${this.API}/${bookingId}/report-problem`, { reason, details });
  }

  updateStatus(
    bookingId: number,
    status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED',
    reason?: string,
  ): Observable<{ message: string; refunded: boolean; refundStatus?: string | null }> {
    return this.http.patch<{ message: string; refunded: boolean; refundStatus?: string | null }>(`${this.API}/${bookingId}/status`, {
      status,
      reason,
    });
  }
}
