import { Component, OnInit, inject, signal, NgZone } from '@angular/core';
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
import { PaymentService } from '../services/payment.service';

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
  private paymentService = inject(PaymentService);
  private zone = inject(NgZone);

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

  // PayPal payment state
  bookingId    = signal<number | null>(null);
  showPayment  = signal(false);
  paid         = signal(false);
  paymentError = signal('');

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
        this.bookingId.set(res.bookingId);
        this.bookingRef.set('NBK-' + String(res.bookingId).padStart(6, '0'));
        if (this.paymentMethod.value === 'online') {
          this.showPayment.set(true);
          setTimeout(() => this.renderPaypal(res.bookingId), 0);
        } else {
          this.confirmed.set(true);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message || 'Failed to create booking. Please try again.');
      },
    });
  }

  async renderPaypal(bookingId: number): Promise<void> {
    try {
      const cfg = await this.paymentService.getConfig();
      if (!cfg.clientId) { this.paymentError.set('PayPal is not configured.'); return; }
      const paypal = await this.paymentService.loadSdk(cfg.clientId);
      paypal.Buttons({
        createOrder: async () => (await this.paymentService.createOrder(bookingId)).orderId,
        onApprove: async () => {
          try {
            await this.paymentService.capture(bookingId);
            this.zone.run(() => { this.paid.set(true); this.showPayment.set(false); this.confirmed.set(true); });
          } catch (e: any) {
            this.zone.run(() => this.paymentError.set(
              e?.error?.message || 'Payment could not be completed. You can try again below.'
            ));
          }
        },
        onCancel: () => this.zone.run(() => this.paymentError.set('Payment cancelled \u2014 you can try again.')),
        onError: () => this.zone.run(() => this.paymentError.set('Payment error. Please try again.')),
      }).render('#paypal-button-container');
    } catch (e) {
      this.zone.run(() => this.paymentError.set('Could not load PayPal.'));
    }
  }
}
