// Originally created by Broinson Jeyarajah (Student Number: 91568803) as the Stripe payment page;
// extracted into this component so the card form (and Stripe.js) only loads when a card is chosen.
// References: https://ngx-stripe.dev/docs/payment-element , https://docs.stripe.com/payments/payment-element

import { Component, OnInit, ViewChild, inject, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { StripeElementsDirective, StripePaymentElementComponent, injectStripe } from 'ngx-stripe';
import { StripeElementsOptions } from '@stripe/stripe-js';

import { STRIPE_PUBLISHABLE_KEY } from '../core/stripe.config';
import { StripePaymentService } from '../services/stripe-payment.service';

@Component({
  selector: 'app-card-payment',
  standalone: true,
  imports: [CommonModule, MatButton, MatProgressSpinner, StripeElementsDirective, StripePaymentElementComponent],
  templateUrl: './card-payment.html',
  styleUrl: './payment.css',
})
export class CardPaymentComponent implements OnInit {
  @ViewChild(StripePaymentElementComponent)
  paymentElement!: StripePaymentElementComponent;

  private paymentService = inject(StripePaymentService);

  /** The booking being paid (a weekly pack is paid through its first session). */
  bookingId = input.required<number>();
  /** Fires once the payment succeeded AND the server recorded it. */
  paid = output<void>();

  stripe = injectStripe(STRIPE_PUBLISHABLE_KEY);

  loading = signal(true);
  processing = signal(false);
  error = signal('');
  elementsOptions: StripeElementsOptions = {};

  ngOnInit(): void {
    // The server works out the amount from the stored booking price — we only send the booking id.
    this.paymentService.createPaymentIntent(this.bookingId()).subscribe({
      next: (intent) => {
        this.elementsOptions = { clientSecret: intent.clientSecret };
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Unable to start the card payment. Please try again.');
        this.loading.set(false);
      },
    });
  }

  pay(): void {
    if (this.processing()) return; // prevent duplicate payments
    this.processing.set(true);
    this.error.set('');

    this.stripe.confirmPayment({ elements: this.paymentElement.elements, redirect: 'if_required' }).subscribe({
      next: (result) => {
        if (result.error) {
          this.processing.set(false);
          this.error.set(result.error.message || 'Your card was declined. Please try another card.');
          return;
        }
        if (result.paymentIntent.status !== 'succeeded') {
          this.processing.set(false);
          this.error.set('Payment was not completed. Please try again.');
          return;
        }
        this.paymentService.confirmPayment(this.bookingId(), result.paymentIntent.id).subscribe({
          next: () => {
            this.processing.set(false);
            this.paid.emit();
          },
          error: (err) => {
            this.processing.set(false);
            this.error.set(err?.error?.message || 'Your card was charged but we could not record it. Please contact support.');
          },
        });
      },
      error: () => {
        this.processing.set(false);
        this.error.set('Payment could not be completed. Please try again.');
      },
    });
  }
}
