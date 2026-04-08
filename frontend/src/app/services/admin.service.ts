import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  city: string;
  province: string;
  postalCode: string;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserPage {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  totalUsers: number;
  totalProviders: number;
  totalRequesters: number;
  totalBookings: number;
  pendingBookings: number;
  blockedUsers: number;
  totalServices: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly API = 'http://localhost:5000/api/auth/admin';

  constructor(private http: HttpClient) {}

  getUsers(role?: string, search?: string, page = 1, limit = 20): Observable<AdminUserPage> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));
    if (role) params = params.set('role', role);
    if (search) params = params.set('search', search);
    return this.http.get<AdminUserPage>(`${this.API}/users`, { params });
  }

  toggleBlock(userId: number, blocked: boolean): Observable<any> {
    return this.http.patch(`${this.API}/users/${userId}/block`, { blocked });
  }

  deleteUser(userId: number): Observable<any> {
    return this.http.delete(`${this.API}/users/${userId}`);
  }

  getStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.API}/stats`);
  }
}
