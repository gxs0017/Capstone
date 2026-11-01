import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

export type LedgerStatus = 'HELD' | 'RELEASED' | 'REFUNDED' | 'REFUND_FAILED';

/** What paying for one booking (or a whole weekly pack) will cost and cover. */
export interface PaymentSummary {
  bookingIds: number[];
  sessions: number;
  recurring: boolean;
  total: number;
  currency: string;
  service: string;
  provider: { id: number; name: string };
  scheduledDates: string[];
  methods: { paypal: boolean; stripe: boolean };
}

export interface PaymentEntry {
  paymentId: number;
  bookingId: number;
  service: string;
  scheduledDate: string | null;
  bookingStatus: string;
  method: string;
  status: LedgerStatus;
  currency: string;
  amount: number;
  platformFee: number;
  providerAmount: number;
  createdAt: string;
  releasedAt: string | null;
  refundedAt: string | null;
  payer: { id: number; name: string };
  provider: { id: number; name: string };
  refundError?: string | null;
}

export type LedgerTotals = Record<LedgerStatus, number>;

export interface MyPayments {
  currency: string;
  paid:   { totals: LedgerTotals; entries: PaymentEntry[] };
  earned: { totals: LedgerTotals; entries: PaymentEntry[] };
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly API = `${API_BASE}/payments`;
  private readonly PAYPAL = `${API_BASE}/payments/paypal`;
  private sdkPromise: Promise<any> | null = null;

  constructor(private http: HttpClient) {}

  /** Which online payment methods are switched on (so the UI never offers a dead option). */
  getMethods(): Observable<{ paypal: boolean; stripe: boolean; currency: string }> {
    return this.http.get<{ paypal: boolean; stripe: boolean; currency: string }>(`${this.API}/methods`);
  }

  getSummary(bookingId: number): Observable<PaymentSummary> {
    return this.http.get<PaymentSummary>(`${this.API}/summary/${bookingId}`);
  }

  getMine(): Observable<MyPayments> {
    return this.http.get<MyPayments>(`${this.API}/mine`);
  }

  getConfig() {
    return firstValueFrom(this.http.get<{ clientId: string; mode: string; currency: string }>(`${this.PAYPAL}/config`));
  }

  createOrder(bookingId: number) {
    return firstValueFrom(
      this.http.post<{ orderId: string; amount: number; sessions: number }>(`${this.PAYPAL}/create-order`, { bookingId })
    );
  }

  capture(bookingId: number) {
    return firstValueFrom(
      this.http.post<{ message: string; status: string }>(`${this.PAYPAL}/capture`, { bookingId })
    );
  }

  /** Load the PayPal JS SDK once; resolves with window.paypal. */
  loadSdk(clientId: string, currency = 'CAD'): Promise<any> {
    const w = window as any;
    if (w.paypal) return Promise.resolve(w.paypal);
    if (this.sdkPromise) return this.sdkPromise;
    this.sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}`;
      s.onload = () => resolve((window as any).paypal);
      s.onerror = () => { this.sdkPromise = null; reject(new Error('Failed to load PayPal SDK')); };
      document.body.appendChild(s);
    });
    return this.sdkPromise;
  }
}
