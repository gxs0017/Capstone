import { Component, inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { RouterLink } from '@angular/router';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatDivider } from '@angular/material/divider';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCard,
    MatCardContent,
    MatCardTitle,
    MatButton,
    MatIcon,
    MatChip,
    MatChipSet,
    MatDivider,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent {
  authService = inject(AuthService);

  get user() {
    return this.authService.currentUser();
  }

  get initials(): string {
    const u = this.user;
    if (!u) return '?';
    return (u.firstName[0] + u.lastName[0]).toUpperCase();
  }

  logout(): void {
    this.authService.logout();
  }
}
