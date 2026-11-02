import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, NgZone } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { PaymentService, PaymentSummary } from '../services/payment.service';
import { CardPaymentComponent } from './card-payment';

type Method = 'paypal' | 'card' | 'demo';

/** One page to pay for a booking — or a whole weekly pack — by PayPal or card.
 *  The total shown here is computed by the server from the stored booking
 *  price(s); the page never sends an amount. */
@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButton, MatCard, MatCardContent, MatIcon, MatProgressSpinner, CardPaymentComponent],
  templateUrl: './payment.html',
  styleUrl: './payment.css',
})
export class PaymentComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private paymentService = inject(PaymentService);
  private zone = inject(NgZone);

  bookingId = 0;
  summary = signal<PaymentSummary | null>(null);
  loading = signal(true);
  error = signal('');
  success = signal(false);

  method = signal<Method | null>(null);
  paypalError = signal('');
  paypalLoading = signal(false);
  private paypalRendered = false;

  ngOnInit(): void {
    this.bookingId = Number(this.route.snapshot.paramMap.get('bookingId'));
    if (!Number.isInteger(this.bookingId) || this.bookingId < 1) {
      this.error.set('Invalid booking.');
      this.loading.set(false);
      return;
    }

    this.paymentService.getSummary(this.bookingId).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
        if (summary.methods.paypal) this.choose('paypal');
        else if (summary.methods.stripe) this.choose('card');
        else if (summary.methods.demo) this.choose('demo');
        else this.error.set('Online payments are not available right now. You can pay on arrival instead.');
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Unable to load this payment.');
        this.loading.set(false);
      },
    });
  }

  choose(method: Method): void {
    this.method.set(method);
    if (method === 'paypal' && !this.paypalRendered) {
      this.paypalRendered = true;
      // Wait a tick for the PayPal container to exist in the DOM
      setTimeout(() => this.renderPaypal(), 0);
    }
  }

  demoPaying = signal(false);

  payDemo(): void {
    if (this.demoPaying()) return;
    this.demoPaying.set(true);
    this.paypalError.set('');
    this.paymentService.payDemo(this.bookingId).subscribe({
      next: () => { this.demoPaying.set(false); this.success.set(true); },
      error: (err) => { this.demoPaying.set(false); this.paypalError.set(err?.error?.message || 'Could not record the payment.'); },
    });
  }

  onCardPaid(): void {
    this.success.set(true);
  }

  private async renderPaypal(): Promise<void> {
    this.paypalLoading.set(true);
    try {
      const cfg = await this.paymentService.getConfig();
      if (!cfg.clientId) {
        this.zone.run(() => this.paypalError.set('PayPal is not configured.'));
        return;
      }
      const paypal = await this.paymentService.loadSdk(cfg.clientId, cfg.currency);
      this.zone.run(() => this.paypalLoading.set(false));
      paypal.Buttons({
        createOrder: async () => (await this.paymentService.createOrder(this.bookingId)).orderId,
        onApprove: async () => {
          try {
            await this.paymentService.capture(this.bookingId);
            this.zone.run(() => this.success.set(true));
          } catch (e: any) {
            this.zone.run(() => this.paypalError.set(
              e?.error?.message || 'Payment could not be completed. You can try again below.'
            ));
          }
        },
        onCancel: () => this.zone.run(() => this.paypalError.set('Payment cancelled — you can try again.')),
        onError: () => this.zone.run(() => this.paypalError.set('PayPal ran into a problem. Please try again.')),
      }).render('#paypal-button-container');
    } catch {
      this.zone.run(() => this.paypalError.set('Could not load PayPal. Please try again.'));
    } finally {
      this.zone.run(() => this.paypalLoading.set(false));
    }
  }
}
