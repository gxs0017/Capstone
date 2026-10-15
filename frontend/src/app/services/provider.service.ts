import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

export interface ServiceItem {
  service_id: number;
  service_name: string;
  price: number | null;
}

@Injectable({ providedIn: 'root' })
export class ProviderService {
  private readonly API = `${API_BASE}/provider`;

  constructor(private http: HttpClient) {}

  getMyServices(): Observable<ServiceItem[]> {
    return this.http.get<ServiceItem[]>(`${this.API}/my-services`);
  }

  addService(serviceName: string, price?: number | null): Observable<any> {
    return this.http.post(`${this.API}/my-services`, { serviceName, price });
  }

  removeService(serviceId: number): Observable<any> {
    return this.http.delete(`${this.API}/my-services/${serviceId}`);
  }

  updatePrice(serviceId: number, price: number): Observable<any> {
    return this.http.patch(`${this.API}/my-services/${serviceId}/price`, { price });
  }

  getAvailableServices(): Observable<ServiceItem[]> {
    return this.http.get<ServiceItem[]>(`${this.API}/available-services`);
  }
}
