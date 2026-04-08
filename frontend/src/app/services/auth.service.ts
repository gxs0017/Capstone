import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface UserProfile {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  city?: string;
  province?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  street?: string;
  postalCode?: string;
  isBlocked?: boolean;
  services?: string[];
  createdAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly API = 'http://localhost:5000/api/auth';
  private readonly TOKEN_KEY = 'nb_token';
  private readonly USER_KEY = 'nb_user';

  // Reactive auth state using signals
  isLoggedIn = signal<boolean>(this.hasToken());
  currentUser = signal<UserProfile | null>(this.loadUser());

  constructor(private http: HttpClient, private router: Router) {}

  register(payload: any): Observable<any> {
    return this.http.post(`${this.API}/register`, payload);
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.API}/login`, { email, password }).pipe(
      tap((res: any) => {
        if (res?.token) {
          localStorage.setItem(this.TOKEN_KEY, res.token);
        }
        if (res?.user) {
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
          this.currentUser.set(res.user);
        }
        this.isLoggedIn.set(true);
      })
    );
  }

  /** Fetch fresh profile from backend and update local state */
  refreshProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.API}/profile`).pipe(
      tap((user) => {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.isLoggedIn.set(false);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /** Role helpers for templates and guards */
  get role(): string {
    return this.currentUser()?.role ?? '';
  }

  isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  isProvider(): boolean {
    return this.role === 'PROVIDER';
  }

  isRequester(): boolean {
    return this.role === 'REQUESTER';
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  private loadUser(): UserProfile | null {
    const stored = localStorage.getItem(this.USER_KEY);
    return stored ? JSON.parse(stored) : null;
  }
}
