import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCard, MatCardContent, MatCardActions } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { BookingService } from '../services/booking.service';

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
    ReactiveFormsModule,
    RouterLink,
    MatCard, MatCardContent, MatCardActions,
    MatButton, MatIcon, MatDivider,
    MatFormFieldModule, MatInput,
    MatProgressSpinner,
    MatRadioModule,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class BookingComponent implements OnInit {
  private router = inject(Router);
  private bookingService = inject(BookingService);

  provider = signal<BookingProvider | null>(null);
  service  = signal<string>('');
  serviceId = signal<number>(0);

  scheduledDate = new FormControl('');
  notes         = new FormControl('');
  paymentMethod = new FormControl('pay_on_arrival');

  loading    = signal(false);
  confirmed  = signal(false);
  bookingRef = signal('');
  errorMsg   = signal('');

  // Contact details expansion
  showContact = signal(false);

  ngOnInit(): void {
    const state = history.state as { provider: BookingProvider; service: string; serviceId: number } | undefined;

    if (state?.provider && state?.service) {
      this.provider.set(state.provider);
      this.service.set(state.service);
      this.serviceId.set(state.serviceId || 0);
    } else {
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
    const prov = this.provider();
    if (!prov) return;

    this.loading.set(true);
    this.errorMsg.set('');

    this.bookingService.createBooking({
      providerId: prov.id,
      serviceId: this.serviceId(),
      scheduledDate: this.scheduledDate.value || undefined,
      notes: this.notes.value || undefined,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.confirmed.set(true);
        this.bookingRef.set('NBK-' + String(res.bookingId).padStart(6, '0'));
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message || 'Failed to create booking. Please try again.');
      },
    });
  }
}
