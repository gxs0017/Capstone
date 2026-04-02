import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  city: string;
  province: string;
  services: string[];
}

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly API = 'http://localhost:5000/api/auth';

  // Mock data used as fallback when backend is unreachable
  private readonly MOCK_PROVIDERS: Provider[] = [
    { id: 1, firstName: 'Marcus', lastName: 'Houston', email: 'marcus@test.com',
      role: 'PROVIDER', city: 'Calgary', province: 'AB',
      services: ['Snow Shovelling', 'Lawn Mowing'] },
    { id: 2, firstName: 'Emily', lastName: 'Brown', email: 'emily@test.com',
      role: 'PROVIDER', city: 'Toronto', province: 'ON',
      services: ['Babysitting', 'Tutoring'] },
    { id: 3, firstName: 'Priya', lastName: 'Nair', email: 'priya@test.com',
      role: 'PROVIDER', city: 'Brampton', province: 'ON',
      services: ['Tutoring'] },
    { id: 4, firstName: 'Daniel', lastName: 'Brooks', email: 'daniel@test.com',
      role: 'PROVIDER', city: 'Mississauga', province: 'ON',
      services: ['Lawn Mowing', 'Snow Shovelling'] },
  ];

  constructor(private http: HttpClient) {}

  getProviders(service?: string, city?: string): Observable<Provider[]> {
    let params = new HttpParams();
    if (service) params = params.set('service', service);
    if (city)    params = params.set('city', city);

    return this.http
      .get<Provider[]>(`${this.API}/providers`, { params })
      .pipe(
        catchError(() => of(this.filterMock(service, city)))
      );
  }

  private filterMock(service?: string, city?: string): Provider[] {
    return this.MOCK_PROVIDERS.filter(p => {
      if (service && !p.services.includes(service)) return false;
      if (city && !p.city.toLowerCase().includes(city.toLowerCase())) return false;
      return true;
    });
  }
}
