import { Component, OnInit, inject, signal, computed, NgZone } from '@angular/core';
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
import { BookingService, BookingQuote, BookingType, CreateBookingResponse } from '../services/booking.service';
import { PaymentService } from '../services/payment.service';
import { AvailabilityService, AvailabilitySlot } from '../services/availability.service';
import { MatDatepicker, MatDatepickerInput, MatDatepickerToggle } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatSelectModule } from '@angular/material/select';

interface BookingProvider {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  province: string;
  services: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCard,
    MatCardContent,
    MatCardActions,
    MatButton,
    MatIcon,
    MatDivider,
    MatFormFieldModule,
    MatInput,
    MatProgressSpinner,
    MatRadioModule,
    MatDatepickerToggle,
    MatDatepickerInput,
    MatDatepicker,
    MatTimepickerModule,
    MatSelectModule,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class BookingComponent implements OnInit {

  private router = inject(Router);
  private bookingService = inject(BookingService);
  private paymentService = inject(PaymentService);
  private zone = inject(NgZone);
  private availabilityService = inject(AvailabilityService);

  provider = signal<BookingProvider | null>(null);
  service = signal<string>('');
  serviceId = signal<number>(0);

  scheduledDate = new FormControl<Date | null>(null);
  scheduledTime = new FormControl<Date | null>({ value: null, disabled: true });
  notes = new FormControl('');
  paymentMethod = new FormControl('pay_on_arrival');

  // One-time vs. prepaid weekly pack (cheaper per session). Prices come from the backend quote.
  bookingType = new FormControl<BookingType>('ONE_TIME', { nonNullable: true });
  sessions = new FormControl<number>(4, { nonNullable: true });
  quote = signal<BookingQuote | null>(null);
  oneTimeQuote = signal<BookingQuote | null>(null);
  recurringDates = signal<Date[]>([]);

  // Provider's recurring weekly availability, used to drive the booking calendar
  availability = signal<AvailabilitySlot[]>([]);
  availableDays = computed(() => new Set(this.availability().map((s) => s.dayOfWeek)));

  // Time bounds for the currently selected date, derived from availability
  timeMin = signal<Date | null>(null);
  timeMax = signal<Date | null>(null);

  readonly today = new Date();
  readonly minDate = new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());

  loading = signal(false);
  confirmed = signal(false);
  bookingRef = signal('');
  errorMsg = signal('');
  scheduledDateTime = signal<Date | null>(null);
  confirmedQuote = signal<CreateBookingResponse['quote'] | null>(null);
  confirmedType = signal<BookingType>('ONE_TIME');

  // PayPal payment state
  bookingId    = signal<number | null>(null);
  showPayment  = signal(false);
  paid         = signal(false);
  paymentError = signal('');

  showContact = signal(false);

  ngOnInit(): void {
    const state = history.state as
      | { provider: BookingProvider; service: string; serviceId: number }
      | undefined;

    if (state?.provider && state?.service) {

      this.provider.set(state.provider);
      this.service.set(state.service);
      this.serviceId.set(state.serviceId || 0);
      this.loadAvailability(state.provider.id);
      this.loadQuotes();
    } else {

      this.router.navigate(['/search']);
      return;
    }

    this.scheduledDate.valueChanges.subscribe((date) => {
      this.onDateChange(date);
      this.updateRecurringDates();
    });
    this.scheduledTime.valueChanges.subscribe(() => this.updateRecurringDates());
    this.bookingType.valueChanges.subscribe(() => {
      this.loadQuotes();
      this.updateRecurringDates();
    });
    this.sessions.valueChanges.subscribe(() => {
      this.loadQuotes();
      this.updateRecurringDates();
    });
  }

  isRecurring(): boolean {
    return this.bookingType.value === 'RECURRING';
  }

  /** Always load the one-time quote (for the comparison) plus the selected option's quote. */
  private loadQuotes(): void {
    const id = this.serviceId();
    if (!id) return;
    this.bookingService.getQuote(id, 'ONE_TIME', undefined, this.provider()?.id).subscribe({
      next: (q) => {
        this.oneTimeQuote.set(q);
        if (!this.isRecurring()) this.quote.set(q);
      },
    });
    this.bookingService.getQuote(id, 'RECURRING', this.sessions.value, this.provider()?.id).subscribe({
      next: (q) => {
        this.recurringQuote.set(q);
        if (this.isRecurring()) this.quote.set(q);
      },
    });
  }

  recurringQuote = signal<BookingQuote | null>(null);

  /** Weekly repeat dates shown as a preview once a start date/time is picked. */
  private updateRecurringDates(): void {
    const start = this.combinedStart();
    if (!this.isRecurring() || !start) {
      this.recurringDates.set([]);
      return;
    }
    this.recurringDates.set(
      Array.from({ length: this.sessions.value }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        return d;
      }),
    );
  }

  private combinedStart(): Date | null {
    const date = this.scheduledDate.value;
    if (!date) return null;
    const d = new Date(date);
    const t = this.scheduledTime.value;
    d.setHours(t ? t.getHours() : 0, t ? t.getMinutes() : 0, 0, 0);
    return d;
  }

  /** Minimum minutes between now and the start time (from the backend rules; 60 until loaded). */
  private leadMinutes(): number {
    return this.oneTimeQuote()?.minLeadMinutes ?? 60;
  }

  private loadAvailability(providerId: number): void {
    this.availabilityService.getAvailability(providerId).subscribe({
      next: (slots) => this.availability.set(slots),
      error: () => this.availability.set([]),
    });
  }

  // Only days the provider has an availability window on are selectable, and never a past date
  dateFilter = (date: Date | null): boolean => {
    if (!date) return false;
    if (date < this.minDate) return false;
    return this.availableDays().has(date.getDay());
  };

  // Recompute the selectable time-of-day range whenever the date changes,
  // from whichever availability window(s) apply to that day of week.
  private onDateChange(date: Date | null): void {
    this.scheduledTime.reset();

    const slotsForDay = date ? this.availability().filter((s) => s.dayOfWeek === date.getDay()) : [];

    if (!date || slotsForDay.length === 0) {
      this.timeMin.set(null);
      this.timeMax.set(null);
      this.scheduledTime.disable();
      return;
    }

    const earliestStart = slotsForDay.reduce((min, s) => (s.startTime < min ? s.startTime : min), slotsForDay[0].startTime);
    const latestEnd = slotsForDay.reduce((max, s) => (s.endTime > max ? s.endTime : max), slotsForDay[0].endTime);

    let min = this.timeStringToDate(earliestStart);
    const max = this.timeStringToDate(latestEnd);

    // Same-day bookings must start at least the minimum lead time from now
    const earliestToday = new Date(Date.now() + this.leadMinutes() * 60000);
    const isToday = date.toDateString() === new Date().toDateString();
    if (isToday && earliestToday > min) {
      min = new Date(earliestToday);
      min.setMinutes(Math.ceil(min.getMinutes() / 30) * 30, 0, 0); // next half-hour slot
    }

    this.timeMin.set(min);
    this.timeMax.set(max);
    this.scheduledTime.enable();
  }

  // Converts a 'HH:mm:ss' TIME string into a Date carrying that time-of-day
  // (the calendar date part is irrelevant — MatTimepicker only compares time-of-day).
  private timeStringToDate(time: string): Date {
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(hours, minutes, seconds || 0, 0);
    return d;
  }

  getAvailabilityLabel(): string {
    if (this.availability().length === 0) return 'No availability on file for this provider yet.';
    const byDay = new Map<number, AvailabilitySlot[]>();
    for (const slot of this.availability()) {
      const list = byDay.get(slot.dayOfWeek) || [];
      list.push(slot);
      byDay.set(slot.dayOfWeek, list);
    }
    return [...byDay.keys()]
      .sort((a, b) => a - b)
      .map((day) => {
        const windows = byDay
          .get(day)!
          .map((s) => `${this.formatTimeLabel(s.startTime)}–${this.formatTimeLabel(s.endTime)}`)
          .join(', ');
        return `${DAY_NAMES[day]}: ${windows}`;
      })
      .join('  •  ');
  }

  private formatTimeLabel(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  getInitials(p: BookingProvider): string {
    return (p.firstName[0] + p.lastName[0]).toUpperCase();
  }

  getServiceIcon(svc: string): string {

    switch (svc) {
      case 'Snow Shovelling':
        return 'ac_unit';
      case 'Babysitting':
        return 'child_care';
      case 'Tutoring':
        return 'school';
      case 'Lawn Mowing':
        return 'yard';
      default:
        return 'handyman';
    }
  }

  goBack(): void {
    this.router.navigate(['/search']);
  }

  // Combines the picked date + time-of-day into a single MySQL DATETIME string
  // ("YYYY-MM-DD HH:mm:ss") using local date/time parts — never toISOString(),
  // which converts to UTC and can roll the day/hour over across timezones.
  private formatDateTime(date: Date | null, time: Date | null): string | undefined {
    if (!date) return undefined;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(time ? time.getHours() : 0).padStart(2, '0');
    const minutes = String(time ? time.getMinutes() : 0).padStart(2, '0');
    const seconds = String(time ? time.getSeconds() : 0).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  confirmBooking(): void {

    const prov = this.provider();

    if (!prov) {
      return;
    }

    if (this.availability().length > 0 && (!this.scheduledDate.value || !this.scheduledTime.value)) {
      this.errorMsg.set('Please pick an available date and time before confirming.');
      return;
    }

    const start = this.combinedStart();
    if (start && start.getTime() - Date.now() < this.leadMinutes() * 60000) {
      this.errorMsg.set(`Bookings must be made at least ${this.leadMinutes() / 60} hour before the start time.`);
      return;
    }
    if (this.isRecurring() && !start) {
      this.errorMsg.set('Pick a start date and time for your recurring bookings.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set('');

    const scheduledDate = this.formatDateTime(this.scheduledDate.value, this.scheduledTime.value);

    this.bookingService
      .createBooking({
        providerId: prov.id,
        serviceId: this.serviceId(),
        scheduledDate,
        notes: this.notes.value || undefined,
        bookingType: this.bookingType.value,
        sessions: this.isRecurring() ? this.sessions.value : undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.bookingId.set(res.bookingId);
          this.bookingRef.set('NBK-' + String(res.bookingId).padStart(6, '0'));
          this.confirmedQuote.set(res.quote);
          this.confirmedType.set(this.bookingType.value);
          if (this.scheduledDate.value) {
            const combined = new Date(this.scheduledDate.value);
            if (this.scheduledTime.value) {
              combined.setHours(
                this.scheduledTime.value.getHours(),
                this.scheduledTime.value.getMinutes(),
                this.scheduledTime.value.getSeconds()
              );
            }
            this.scheduledDateTime.set(combined);
          }
          // PayPal is for single bookings; recurring packs are prepaid as a mock payment.
          if (this.paymentMethod.value === 'paypal' && !this.isRecurring()) {
            this.showPayment.set(true);
            setTimeout(() => this.renderPaypal(res.bookingId), 0);
          } else if (this.paymentMethod.value === 'stripe' && !this.isRecurring()) {
            // Card payments happen on the dedicated Stripe payment page
            this.router.navigate(['/payment', res.bookingId]);
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