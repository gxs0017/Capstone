import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface UserProfile {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  services?: string[];
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
    return this.http.post(`${this.API}/register`, payload).pipe(
      tap(() => {}),
      // 👇 fallback if backend fails
      catchError(() => {
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');

        const exists = users.find((u: any) => u.email === payload.email);
        if (exists) throw new Error('User exists');

        users.push(payload);
        localStorage.setItem('mock_users', JSON.stringify(users));

        return new Observable((observer) => {
          observer.next({ message: 'Registered (mock)' });
          observer.complete();
        });
      })
    );
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.API}/login`, { email, password }).pipe(
      tap((res: any) => {
        if (res?.token) localStorage.setItem(this.TOKEN_KEY, res.token);
        if (res?.user) {
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
          this.currentUser.set(res.user);
        }
        this.isLoggedIn.set(true);
      }),
      // 👇 fallback if backend fails
      catchError(() => {
        console.log("Login worked");
        const users = JSON.parse(localStorage.getItem('mock_users') || '[]');

        const user = users.find(
          (u: any) => u.email === email && u.password === password
        );

        return new Observable((observer) => {
          if (!user) {
            observer.error({ message: 'Invalid credentials' });
            return;
          }

          const res = { token: 'dummy-token', user };

          localStorage.setItem(this.TOKEN_KEY, res.token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));

          this.currentUser.set(user);
          this.isLoggedIn.set(true);

          observer.next(res);
          observer.complete();
        });
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

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }

  private loadUser(): UserProfile | null {
    const stored = localStorage.getItem(this.USER_KEY);
    return stored ? JSON.parse(stored) : null;
  }
}
