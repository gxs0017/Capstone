// Created by Broinson Jeyarajah
// Student Number: 991568803

//-------REFERENCES USED---------
// https://angular.dev/guide/di
// https://angular.dev/guide/di/creating-injectable-service
// https://rxjs.dev/guide/observable
// Previous course/lecture material – Angular Mobile Web-based Applications/Hybrid Mobile Web

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';


export interface ConfirmPaymentResponse {
  message: string;
  paymentStatus: string;
}   

// Interfaces for payment responses
export interface PaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

@Injectable({ providedIn: 'root' })

export class PaymentService {
  private readonly API = `${API_BASE}/payments`;

  constructor(private http: HttpClient) { }


// Request payment details from the backend for requested booking
  createPaymentIntent(bookingId: number): Observable<PaymentIntentResponse> {
    return this.http.post<PaymentIntentResponse>(
    
      `${this.API}/create-intent`,
        {   bookingId  }
     );
  }

  // Confirm a payment with the backend
  confirmPayment(
       bookingId: number,  paymentIntentId: string
):

 Observable<ConfirmPaymentResponse> {
  return this.http.post<ConfirmPaymentResponse>(`${this.API}/confirm`, { bookingId, paymentIntentId }
  );
}
}

