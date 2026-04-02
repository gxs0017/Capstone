import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatCard, MatCardContent, MatCardTitle, MatCardSubtitle, MatCardActions } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { CommonModule } from '@angular/common';

interface BookingProvider {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  province: string;
  services: string[];
}

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [
    CommonModule,
    MatCard,
    MatCardContent,
    MatCardTitle,
    MatCardSubtitle,
    MatCardActions,
    MatButton,
    MatIcon,
    MatDivider,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class BookingComponent implements OnInit {
  provider = signal<BookingProvider | null>(null);
  service  = signal<string>('');

  // Mock booking reference number
  bookingRef = 'NBK-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  constructor(private router: Router) {}

  ngOnInit(): void {
    // history.state is the reliable way to read Angular router state after navigation
    const state = history.state as { provider: BookingProvider; service: string } | undefined;

    if (state?.provider && state?.service) {
      this.provider.set(state.provider);
      this.service.set(state.service);
    } else {
      // Navigated directly with no state — go back to search
      this.router.navigate(['/search']);
    }
  }

  getInitials(p: BookingProvider): string {
    return (p.firstName[0] + p.lastName[0]).toUpperCase();
  }

  getServiceIcon(svc: string): string {
    switch (svc) {
      case 'Snow Shovelling': return 'ac_unit';
      case 'Babysitting':     return 'child_care';
      case 'Tutoring':        return 'school';
      case 'Lawn Mowing':     return 'yard';
      default:                return 'handyman';
    }
  }

  goBack(): void {
    this.router.navigate(['/search']);
  }

  confirmBooking(): void {
    // Placeholder — real booking logic will be implemented later
    alert(`Booking confirmed! Reference: ${this.bookingRef}`);
  }
}
