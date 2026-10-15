// Created by Broinson Jeyarajah
// Student Number: 91568803

//-------REFERENCES USED---------
// https://docs.stripe.com/payments/payment-element/migration
//https://ngx-stripe.dev/docs/payment-element
//https://docs.stripe.com/keys
//https://docs.stripe.com/elements/appearance-api
//https://docs.stripe.com/api/payment_intents
  //https://angular.dev/guide/http/making-requests
//Previous course/lecture material – Angula  Mobile Web-based Applications/Hyprid Mobile Web

//IMPORTS FROM ANGULAR
import { CommonModule } from '@angular/common';
import {  Component, OnInit, ViewChild, inject, signal,} 
from '@angular/core';

import { STRIPE_PUBLISHABLE_KEY } from '../core/stripe.config';
import { StripePaymentService } from '../services/stripe-payment.service';

import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';



//IMPORTS FROM STRIPE
import {StripeElementsDirective, StripePaymentElementComponent, injectStripe,}  from 'ngx-stripe';
import { StripeElementsOptions } from '@stripe/stripe-js';


@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButton,
    MatCard,
    MatCardContent,
    MatIcon,
    MatProgressSpinner,
    StripeElementsDirective,
    StripePaymentElementComponent,
  ],
  templateUrl: './payment.html',
  styleUrl: './payment.css',
})


//-----------------PAYMENT COMPONENT----------------
export class PaymentComponent implements OnInit {

  @ViewChild(StripePaymentElementComponent)
  paymentElement!: StripePaymentElementComponent;

  //Declare private varaaibles for routes for payement service 
  private route = inject(ActivatedRoute);
  private paymentService = inject(StripePaymentService);
  private bookingId!: number;

  //Inject Stripe service using the publishable key
  stripe = injectStripe(STRIPE_PUBLISHABLE_KEY);

  //Declare signals for all operations
  loading = signal(true);
  PaymentPROCESSING = signal(false);
  error = signal('');
  success = signal(false);
  amount = signal(0);

  // Set the Stripe Elements options
  elementsOptions: StripeElementsOptions = {};


  ngOnInit(): void {
    this.bookingId = Number(this.route.snapshot.paramMap.get('bookingId') 
  );

  //if not number, invalid booking, set error and stop loading
      if (!Number.isInteger(this.bookingId)) { 
          this.error.set('Invalid booking.');
          this.loading.set(false);
          return;
      } 
      else if(this.bookingId < 1) {
        this.error.set('Invalid booking.');
          

      // Payment form is ready
        this.loading.set(false);
          return;
    }

// Call payment service to create payment intent for the booking
    this.paymentService.createPaymentIntent(this.bookingId)
     
    .subscribe({ next: (paymentIntent) => {
            this.amount.set(paymentIntent.amount);
    
           // Set the client secret for the Stripe Elements options        
          this.elementsOptions = {clientSecret: paymentIntent.clientSecret};

         // Set loading to false since we cannot proceed with payment
          this.loading.set(false);
        },

        error: () => { // Handle error when creating payment intent
          this.error.set('Unable to start the payment. Please try again!');
           this.loading.set(false);
         },
      });
  }


//Pay function to handle the payment process
  pay(): void {
    // Prevent duplicate payments

    if (this.PaymentPROCESSING())
   { 
       return;
   }

  // Start payment processing and clear old errors - Signals
    this.PaymentPROCESSING.set(true);
    this.error.set('');


    this.stripe.confirmPayment({
        elements: this.paymentElement.elements,
        redirect: 'if_required',
      })
    
      //failed payment
      .subscribe({next: (result) => {
      
          if (result.error) {
              this.PaymentPROCESSING.set(false);
              return;
          }

      
          if ( result.paymentIntent.status === 'succeeded')  
          {
            this.paymentService.confirmPayment(this.bookingId, result.paymentIntent.id)
              
            // Handle the response from the confirmPayment call
            .subscribe({
                next: () => {
                  this.PaymentPROCESSING.set(false);
                  this.success.set(true);
                },
                 error: () => {
                 this.PaymentPROCESSING.set(false);
                 this.error.set('Payment succeeded but was not saved!');
                 },
              });
            }
      
            else { 
                 this.PaymentPROCESSING.set(false);
                this.error.set('Payment was not completed. Please re-try again.');
          }
        },

        //error has issue in the payment processing
        error: () => {
          this.PaymentPROCESSING.set(false);
          this.error.set('Payment could not be completed. Please re-try again.');

        },
      });
  }
}
