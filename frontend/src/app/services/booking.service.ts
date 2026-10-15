import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'DECLINED' | 'COMPLETED' | 'EXPIRED';
export type BookingType = 'ONE_TIME' | 'RECURRING';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

export interface Booking {
  bookingId: number;
  status: BookingStatus;
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
  cancelDeadline: string | null;
  /** Cancellation log: set once a booking has been cancelled. */
  cancellation: { at: string; reason: string | null; by: string | null; byRole: string | null } | null;
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
  scheduledDate?: string;
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
}

export interface CreateBookingResponse {
  message: string;
  bookingId: number;
  bookingIds: number[];
  batchId: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  scheduledDates: string[];
  quote: Omit<BookingQuote, 'sessionOptions' | 'minLeadMinutes' | 'cancelCutoffHours' | 'pendingExpiryHours'>;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly API = 'http://localhost:5000/api/auth/bookings';

  constructor(private http: HttpClient) {}

  createBooking(payload: CreateBookingPayload): Observable<CreateBookingResponse> {
    return this.http.post<CreateBookingResponse>(this.API, payload);
  }

  /** Price breakdown and booking rules straight from the backend. */
  getQuote(serviceId: number, type: BookingType, sessions?: number): Observable<BookingQuote> {
    const params: Record<string, string> = { serviceId: String(serviceId), type };
    if (type === 'RECURRING' && sessions) params['sessions'] = String(sessions);
    return this.http.get<BookingQuote>(`${this.API}/quote`, { params });
  }

  getMyBookings(view?: 'requests'): Observable<Booking[]> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.get<Booking[]>(`${this.API}/my`, { params });
  }

  updateStatus(
    bookingId: number,
    status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED',
    reason?: string,
  ): Observable<{ message: string; refunded: boolean }> {
    return this.http.patch<{ message: string; refunded: boolean }>(`${this.API}/${bookingId}/status`, {
      status,
      reason,
    });
  }
}
