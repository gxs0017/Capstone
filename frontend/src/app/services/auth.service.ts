import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private users: any[] = [];

  register(user: any) {
    this.users.push(user);
    localStorage.setItem('mockUsers', JSON.stringify(this.users));
    console.log('Registered users:', this.users); // verify shape
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
