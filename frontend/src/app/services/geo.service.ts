import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

/** One real address from the lookup, with city / province / postal code already consistent. */
export interface AddressSuggestion {
  label: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  suburb: string | null;
  lat: number;
  lng: number;
}

@Injectable({ providedIn: 'root' })
export class GeoService {
  constructor(private http: HttpClient) {}

  searchAddress(q: string): Observable<AddressSuggestion[]> {
    return this.http.get<AddressSuggestion[]>(`${API_BASE}/geo/search`, { params: new HttpParams().set('q', q) });
  }
}
