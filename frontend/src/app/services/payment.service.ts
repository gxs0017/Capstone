import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api.config';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly API = `${API_BASE}/payments/paypal`;
  private sdkPromise: Promise<any> | null = null;

  constructor(private http: HttpClient) {}

  getConfig() {
    return firstValueFrom(this.http.get<{ clientId: string; mode: string }>(`${this.API}/config`));
  }

  createOrder(bookingId: number) {
    return firstValueFrom(
      this.http.post<{ orderId: string; amount: number }>(`${this.API}/create-order`, { bookingId })
    );
  }

  capture(bookingId: number) {
    return firstValueFrom(
      this.http.post<{ message: string; status: string }>(`${this.API}/capture`, { bookingId })
    );
  }

  /** Load the PayPal JS SDK once; resolves with window.paypal. */
  loadSdk(clientId: string): Promise<any> {
    const w = window as any;
    if (w.paypal) return Promise.resolve(w.paypal);
    if (this.sdkPromise) return this.sdkPromise;
    this.sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
      s.onload = () => resolve((window as any).paypal);
      s.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.body.appendChild(s);
    });
    return this.sdkPromise;
  }
}
