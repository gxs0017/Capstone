import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ServiceItem {
  service_id: number;
  service_name: string;
}

@Injectable({ providedIn: 'root' })
export class ProviderService {
  private readonly API = 'http://localhost:5000/api/auth/provider';

  constructor(private http: HttpClient) {}

  getMyServices(): Observable<ServiceItem[]> {
    return this.http.get<ServiceItem[]>(`${this.API}/my-services`);
  }

  addService(serviceName: string): Observable<any> {
    return this.http.post(`${this.API}/my-services`, { serviceName });
  }

  removeService(serviceId: number): Observable<any> {
    return this.http.delete(`${this.API}/my-services/${serviceId}`);
  }

  getAvailableServices(): Observable<ServiceItem[]> {
    return this.http.get<ServiceItem[]>(`${this.API}/available-services`);
  }
}
