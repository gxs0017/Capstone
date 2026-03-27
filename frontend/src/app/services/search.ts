import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface Provider {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  services: string[];
  address: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly API = 'http://localhost:5000/api/auth';

  constructor(private http: HttpClient) {}

  getProviders(service?: string, city?: string): Observable<Provider[]> {
    return this.http.get<Provider[]>(`${this.API}/all-users`).pipe(
      map(users =>
        users.filter(u => {
          if (u.role !== 'PROVIDER') return false;
          if (service && !u.services.includes(service)) return false;
          if (city && !u.address?.city?.toLowerCase().includes(city.toLowerCase())) return false;
          return true;
        })
      )
    );
  }
}
