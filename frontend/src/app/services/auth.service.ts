import { Injectable } from '@angular/core';
import {HttpClient} from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(private http: HttpClient) { }

  private users: any[] = [];

  register(user: any) {
    return this.http.post('http://localhost:5000/api/auth/register', user)

  }

  login(email: string, password: string) {
    const stored = localStorage.getItem('mockUsers');
    this.users = stored ? JSON.parse(stored) : [];
    console.log('Attempting login against:', this.users); // verify
    return this.users.find(
      (u) => u.email.trim().toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
  }
}
