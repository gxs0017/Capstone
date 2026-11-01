import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

// day: 0=Sunday .. 6=Saturday (matches Date.prototype.getDay())
export interface AvailabilitySlot {
  id?: number;
  dayOfWeek: number;
  startTime: string; // 'HH:mm:ss'
  endTime: string;   // 'HH:mm:ss'
}

export interface AddAvailabilityPayload {
  dayOfWeek: number;
  startTime: string; // 'HH:mm'
  endTime: string;   // 'HH:mm'
}

export interface BookableSlot {
  time: string;          // 'HH:mm'
  available: boolean;
  reason?: 'TOO_SOON' | 'BOOKED';
}

export interface DaySlots {
  date: string;          // 'YYYY-MM-DD'
  sessionMinutes: number;
  /** false = the provider hasn't set weekly hours; the default 8 AM–8 PM window applies. */
  publishedHours: boolean;
  beyondHorizon: boolean;
  slots: BookableSlot[];
}

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly PROVIDERS_API = `${API_BASE}/providers`;
  private readonly MY_API = `${API_BASE}/provider/my-availability`;

  constructor(private http: HttpClient) {}

  // Public lookup — used by the booking calendar to restrict selectable dates/times
  getAvailability(providerId: number): Observable<AvailabilitySlot[]> {
    return this.http.get<AvailabilitySlot[]>(`${this.PROVIDERS_API}/${providerId}/availability`);
  }

  /** Every start time on a date and whether it can be booked — the same rules the server enforces. */
  getSlots(providerId: number, date: string): Observable<DaySlots> {
    return this.http.get<DaySlots>(`${this.PROVIDERS_API}/${providerId}/slots`, { params: { date } });
  }

  // Provider self-service management
  getMyAvailability(): Observable<AvailabilitySlot[]> {
    return this.http.get<AvailabilitySlot[]>(this.MY_API);
  }

  addAvailability(payload: AddAvailabilityPayload): Observable<any> {
    return this.http.post(this.MY_API, payload);
  }

  removeAvailability(id: number): Observable<any> {
    return this.http.delete(`${this.MY_API}/${id}`);
  }
}
