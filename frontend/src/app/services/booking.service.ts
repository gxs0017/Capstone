import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Booking {
  bookingId: number;
  status: string;
  scheduledDate: string | null;
  notes: string | null;
  bookingDate: string;
  service: string;
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
}

export interface CreateBookingPayload {
  providerId: number;
  serviceId: number;
  scheduledDate?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly API = 'http://localhost:5000/api/auth/bookings';

  constructor(private http: HttpClient) {}

  createBooking(payload: CreateBookingPayload): Observable<any> {
    return this.http.post(this.API, payload);
  }

  getMyBookings(view?: 'requests'): Observable<Booking[]> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.get<Booking[]>(`${this.API}/my`, { params });
  }

  updateStatus(bookingId: number, status: 'CONFIRMED' | 'CANCELLED'): Observable<any> {
    return this.http.patch(`${this.API}/${bookingId}/status`, { status });
  }
}
