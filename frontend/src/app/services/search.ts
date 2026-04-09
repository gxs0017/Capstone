import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  city: string;
  province: string;
  services: string[];
}

// Paginated response envelope returned by GET /api/auth/providers
export interface ProviderPage {
  data:       Provider[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

// Sort types mirror the backend whitelist in models/User.js
export type SortColumn = 'first_name' | 'city' | 'created_at';
export type SortOrder  = 'ASC' | 'DESC';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly API = 'http://localhost:5000/api/auth';

  // Mock data — fallback when the backend is unreachable
  private readonly MOCK_PROVIDERS: Provider[] = [
    { id: 1,  firstName: 'Marcus',  lastName: 'Houston',  email: 'marcus@test.com',  phoneNumber: '4035552341',
      role: 'PROVIDER', city: 'Calgary',     province: 'AB', services: ['Snow Shovelling', 'Lawn Mowing'] },
    { id: 2,  firstName: 'Emily',   lastName: 'Brown',    email: 'emily@test.com',   phoneNumber: '6475552222',
      role: 'PROVIDER', city: 'Toronto',     province: 'ON', services: ['Babysitting', 'Tutoring'] },
    { id: 3,  firstName: 'Priya',   lastName: 'Nair',     email: 'priya@test.com',   phoneNumber: '6475553456',
      role: 'PROVIDER', city: 'Toronto',     province: 'ON', services: ['Tutoring'] },
    { id: 4,  firstName: 'Daniel',  lastName: 'Brooks',   email: 'daniel@test.com',  phoneNumber: '9055554321',
      role: 'PROVIDER', city: 'Mississauga', province: 'ON', services: ['Snow Shovelling', 'Lawn Mowing'] },
    { id: 5,  firstName: 'Aisha',   lastName: 'Malik',    email: 'aisha@test.com',   phoneNumber: '4165558888',
      role: 'PROVIDER', city: 'Toronto',     province: 'ON', services: ['Babysitting'] },
    { id: 6,  firstName: 'Jordan',  lastName: 'Lee',      email: 'jordan@test.com',  phoneNumber: '6135559090',
      role: 'PROVIDER', city: 'Ottawa',      province: 'ON', services: ['Snow Shovelling', 'Lawn Mowing'] },
    { id: 7,  firstName: 'Sophie',  lastName: 'Tremblay', email: 'sophie@test.com',  phoneNumber: '5145557777',
      role: 'PROVIDER', city: 'Montreal',    province: 'QC', services: ['Tutoring', 'Babysitting'] },
    { id: 8,  firstName: 'Liam',    lastName: "O'Brien",  email: 'liam@test.com',    phoneNumber: '4035556543',
      role: 'PROVIDER', city: 'Calgary',     province: 'AB', services: ['Snow Shovelling'] },
    { id: 9,  firstName: 'Nina',    lastName: 'Patel',    email: 'nina@test.com',    phoneNumber: '6047771234',
      role: 'PROVIDER', city: 'Vancouver',   province: 'BC', services: ['Lawn Mowing', 'Babysitting'] },
    { id: 10, firstName: 'Ethan',   lastName: 'Campbell', email: 'ethan@test.com',   phoneNumber: '2045559876',
      role: 'PROVIDER', city: 'Winnipeg',    province: 'MB', services: ['Tutoring', 'Snow Shovelling'] },
    { id: 11, firstName: 'Olivia',  lastName: 'Chen',     email: 'olivia@test.com',  phoneNumber: '9055551111',
      role: 'PROVIDER', city: 'Hamilton',    province: 'ON', services: ['Lawn Mowing', 'Tutoring'] },
    { id: 12, firstName: 'Hassan',  lastName: 'Ali',      email: 'hassan@test.com',  phoneNumber: '7805552468',
      role: 'PROVIDER', city: 'Edmonton',    province: 'AB', services: ['Snow Shovelling', 'Lawn Mowing', 'Babysitting'] },
  ];

  constructor(private http: HttpClient) {}

  getProviders(
    service?: string,
    city?:    string,
    sort:     SortColumn = 'created_at',
    order:    SortOrder  = 'DESC',
    page:     number     = 1,
    limit:    number     = 6
  ): Observable<ProviderPage> {
    let params = new HttpParams()
      .set('sort',  sort)
      .set('order', order)
      .set('page',  String(page))
      .set('limit', String(limit));

    if (service) params = params.set('service', service);
    if (city)    params = params.set('city',    city);

    return this.http
      .get<ProviderPage>(`${this.API}/providers`, { params })
      .pipe(
        catchError(() => of(this.mockPage(service, city, sort, order, page, limit)))
      );
  }

  // Build a ProviderPage from mock data so the pagination UI works offline
  private mockPage(
    service?: string,
    city?:    string,
    sort:     SortColumn = 'created_at',
    order:    SortOrder  = 'DESC',
    page:     number     = 1,
    limit:    number     = 6
  ): ProviderPage {
    let results = this.MOCK_PROVIDERS.filter(p => {
      if (service && !p.services.includes(service)) return false;
      if (city    && !p.city.toLowerCase().includes(city.toLowerCase())) return false;
      return true;
    });

    // Sort
    results = [...results].sort((a, b) => {
      const valA = sort === 'first_name' ? a.firstName : sort === 'city' ? a.city : String(a.id);
      const valB = sort === 'first_name' ? b.firstName : sort === 'city' ? b.city : String(b.id);
      return valA.localeCompare(valB);
    });
    if (order === 'DESC') results.reverse();

    const total      = results.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage   = Math.min(page, totalPages);
    const offset     = (safePage - 1) * limit;

    return {
      data:  results.slice(offset, offset + limit),
      total,
      page:  safePage,
      limit,
      totalPages,
    };
  }
}
