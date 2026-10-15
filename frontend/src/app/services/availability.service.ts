import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly PROVIDERS_API = 'http://localhost:5000/api/auth/providers';
  private readonly MY_API = 'http://localhost:5000/api/auth/provider/my-availability';

  constructor(private http: HttpClient) {}

  // Public lookup — used by the booking calendar to restrict selectable dates/times
  getAvailability(providerId: number): Observable<AvailabilitySlot[]> {
    return this.http.get<AvailabilitySlot[]>(`${this.PROVIDERS_API}/${providerId}/availability`);
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
