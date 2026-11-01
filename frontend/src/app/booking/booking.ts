import { Component, OnInit, inject, signal, computed } from '@angular/core';
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
import { AvailabilityService, AvailabilitySlot, DaySlots } from '../services/availability.service';
import { MatDatepicker, MatDatepickerInput, MatDatepickerToggle } from '@angular/material/datepicker';
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

type PayChoice = 'arrival' | 'online';

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
    MatSelectModule,
  ],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class BookingComponent implements OnInit {

  private router = inject(Router);
  private bookingService = inject(BookingService);
  private paymentService = inject(PaymentService);
  private availabilityService = inject(AvailabilityService);

  provider = signal<BookingProvider | null>(null);
  service = signal<string>('');
  serviceId = signal<number>(0);

  scheduledDate = new FormControl<Date | null>(null);
  notes = new FormControl('');
  payChoice = new FormControl<PayChoice>('arrival', { nonNullable: true });

  // One-time vs. weekly pack (cheaper per session). Prices come from the backend quote.
  bookingType = new FormControl<BookingType>('ONE_TIME', { nonNullable: true });
  sessions = new FormControl<number>(4, { nonNullable: true });
  quote = signal<BookingQuote | null>(null);
  oneTimeQuote = signal<BookingQuote | null>(null);
  recurringQuote = signal<BookingQuote | null>(null);
  recurringDates = signal<Date[]>([]);

  // Provider's recurring weekly hours (drives which weekdays are selectable)
  availability = signal<AvailabilitySlot[]>([]);
  availableDays = computed(() => new Set(this.availability().map((s) => s.dayOfWeek)));

  // The bookable start times on the chosen date, straight from the server's rules
  daySlots = signal<DaySlots | null>(null);
  slotsLoading = signal(false);
  selectedTime = signal<string | null>(null); // 'HH:mm'

  /** Online payment switched on for at least one gateway (PayPal / card)? */
  onlinePaymentAvailable = signal(true);

  readonly today = new Date();
  readonly minDate = new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
  maxDate = new Date(this.minDate.getTime() + 90 * 86400000);

  loading = signal(false);
  confirmed = signal(false);
  bookingRef = signal('');
  errorMsg = signal('');
  scheduledDateTime = signal<Date | null>(null);
  confirmedQuote = signal<CreateBookingResponse['quote'] | null>(null);
  confirmedType = signal<BookingType>('ONE_TIME');

  /** The chosen start, e.g. "Thursday, Nov 5 · 10:00 AM – 11:00 AM". Null until both date and time are picked. */
  selectionLabel = computed(() => {
    const start = this.combinedStart();
    if (!start) return null;
    const end = new Date(start.getTime() + (this.oneTimeQuote()?.sessionMinutes ?? 60) * 60000);
    const day = start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${time(start)} – ${time(end)}`;
  });

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
      this.paymentService.getMethods().subscribe({
        next: (m) => this.onlinePaymentAvailable.set(m.paypal || m.stripe),
        error: () => {},
      });
    } else {
      this.router.navigate(['/search']);
      return;
    }

    this.scheduledDate.valueChanges.subscribe((date) => {
      this.selectedTime.set(null);
      this.loadSlots(date);
      this.updateRecurringDates();
    });
    this.bookingType.valueChanges.subscribe(() => {
      this.loadQuotes();
      this.updateRecurringDates();
      // A weekly pack is always paid online up front
      if (this.isRecurring()) this.payChoice.setValue('online');
    });
    this.sessions.valueChanges.subscribe(() => {
      this.loadQuotes();
      this.updateRecurringDates();
    });
  }

  isRecurring(): boolean {
    return this.bookingType.value === 'RECURRING';
  }

  isOnline(): boolean {
    return this.isRecurring() || this.payChoice.value === 'online';
  }

  /** Always load the one-time quote (for the comparison) plus the selected option's quote. */
  private loadQuotes(): void {
    const id = this.serviceId();
    if (!id) return;
    this.bookingService.getQuote(id, 'ONE_TIME', undefined, this.provider()?.id).subscribe({
      next: (q) => {
        this.oneTimeQuote.set(q);
        this.maxDate = new Date(this.minDate.getTime() + q.horizonDays * 86400000);
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

  /** The picked date + time-slot as one Date, or null until both are chosen. */
  private combinedStart(): Date | null {
    const date = this.scheduledDate.value;
    const time = this.selectedTime();
    if (!date || !time) return null;
    const [h, m] = time.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
  }

  private loadAvailability(providerId: number): void {
    this.availabilityService.getAvailability(providerId).subscribe({
      next: (slots) => this.availability.set(slots),
      error: () => this.availability.set([]),
    });
  }

  private dateKey(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private loadSlots(date: Date | null): void {
    this.daySlots.set(null);
    if (!date || !this.provider()) return;
    this.slotsLoading.set(true);
    this.availabilityService.getSlots(this.provider()!.id, this.dateKey(date)).subscribe({
      next: (res) => {
        this.daySlots.set(res);
        this.slotsLoading.set(false);
      },
      error: () => {
        this.slotsLoading.set(false);
        this.errorMsg.set('Could not load the available times. Please try again.');
      },
    });
  }

  /** Picking a time-slot; unavailable slots are disabled in the template. */
  selectTime(time: string): void {
    this.selectedTime.set(time);
    this.errorMsg.set('');
    this.updateRecurringDates();
  }

  // With published weekly hours only those weekdays are selectable; with none,
  // any day up to the booking horizon is (the provider confirms the request).
  dateFilter = (date: Date | null): boolean => {
    if (!date) return false;
    if (date < this.minDate || date > this.maxDate) return false;
    if (this.availability().length === 0) return true;
    return this.availableDays().has(date.getDay());
  };

  getAvailabilityLabel(): string {
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

  /** 'HH:mm' or 'HH:mm:ss' -> '9:30 AM' */
  formatTimeLabel(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  slotTooltip(reason?: string): string {
    return reason === 'BOOKED' ? 'Already booked' : reason === 'TOO_SOON' ? 'Too soon to book' : '';
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

  // Combines the picked date + time-slot into a MySQL DATETIME string
  // ("YYYY-MM-DD HH:mm:ss") using local parts — never toISOString(), which
  // converts to UTC and can roll the day/hour over across timezones.
  private formatDateTime(start: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())} ` +
           `${p(start.getHours())}:${p(start.getMinutes())}:00`;
  }

  confirmBooking(): void {
    const prov = this.provider();
    if (!prov) return;

    // A booking always has a time — nothing goes through without a date AND a time slot.
    const start = this.combinedStart();
    if (!this.scheduledDate.value) {
      this.errorMsg.set('Pick a date for the booking.');
      return;
    }
    if (!start) {
      this.errorMsg.set('Pick a time from the available slots.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set('');

    this.bookingService
      .createBooking({
        providerId: prov.id,
        serviceId: this.serviceId(),
        scheduledDate: this.formatDateTime(start),
        notes: this.notes.value || undefined,
        bookingType: this.bookingType.value,
        sessions: this.isRecurring() ? this.sessions.value : undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.bookingRef.set('NBK-' + String(res.bookingId).padStart(6, '0'));
          this.confirmedQuote.set(res.quote);
          this.confirmedType.set(this.bookingType.value);
          this.scheduledDateTime.set(start);

          if (this.isOnline()) {
            // Paying online: one payment page covers the booking (or the whole pack)
            this.router.navigate(['/payment', res.bookingId]);
          } else {
            this.confirmed.set(true);
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.errorMsg.set(err?.error?.message || 'Failed to create booking. Please try again.');
          // The slot may have just been taken — refresh what's still open
          this.selectedTime.set(null);
          this.loadSlots(this.scheduledDate.value);
        },
      });
  }
}
