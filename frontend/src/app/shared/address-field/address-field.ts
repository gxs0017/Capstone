import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { AddressSuggestion, GeoService } from '../../services/geo.service';

export const PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' }, { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' }, { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' }, { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

// The first letter of a postal code fixes the province — used to catch mismatches in manual entry.
const POSTAL_PROVINCES: Record<string, string[]> = {
  A: ['NL'], B: ['NS'], C: ['PE'], E: ['NB'], G: ['QC'], H: ['QC'], J: ['QC'], K: ['ON'], L: ['ON'], M: ['ON'],
  N: ['ON'], P: ['ON'], R: ['MB'], S: ['SK'], T: ['AB'], V: ['BC'], X: ['NT', 'NU'], Y: ['YT'],
};

/** Form group the address box edits; the parent form embeds it as `addressForm`. */
export const createAddressGroup = () =>
  new FormGroup({
    street: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    province: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', { nonNullable: true }),
    lat: new FormControl<number | null>(null),
    lng: new FormControl<number | null>(null),
  });

/**
 * Address box: type the street address, pick the real match, and the city,
 * province and postal code are filled in together so they can never disagree.
 * "Enter it manually" is the fallback; the postal code is then checked against
 * the province here and again on the server.
 */
@Component({
  selector: 'app-address-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelect, MatOption, MatIcon, MatButton],
  templateUrl: './address-field.html',
  styleUrl: './address-field.css',
})
export class AddressFieldComponent {
  group = input.required<FormGroup>();

  private geo = inject(GeoService);
  private destroyRef = inject(DestroyRef);
  private typed$ = new Subject<string>();

  readonly provinces = PROVINCES;
  query = new FormControl('', { nonNullable: true });
  results = signal<AddressSuggestion[]>([]);
  searching = signal(false);
  unavailable = signal(false);
  searched = signal(false);
  chosen = signal<AddressSuggestion | null>(null);
  manual = signal(false);

  constructor() {
    this.typed$
      .pipe(
        debounceTime(700),
        distinctUntilChanged(),
        tap((q) => {
          this.searching.set(q.trim().length >= 4);
          this.unavailable.set(false);
        }),
        switchMap((q) =>
          q.trim().length < 4
            ? of([] as AddressSuggestion[])
            : this.geo.searchAddress(q.trim()).pipe(
                catchError(() => {
                  this.unavailable.set(true);
                  return of([] as AddressSuggestion[]);
                })
              )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((list) => {
        this.results.set(list);
        this.searching.set(false);
        this.searched.set(this.query.value.trim().length >= 4);
      });
  }

  onType(): void {
    this.chosen.set(null);
    this.searched.set(false);
    this.typed$.next(this.query.value);
  }

  pick(s: AddressSuggestion): void {
    this.group().patchValue({
      street: s.street, city: s.city, province: s.province, postalCode: s.postalCode, lat: s.lat, lng: s.lng,
    });
    this.chosen.set(s);
    this.results.set([]);
    this.searched.set(false);
    this.query.setValue(s.label, { emitEvent: false });
    this.manual.set(false);
  }

  startManual(): void {
    this.manual.set(true);
    this.results.set([]);
    this.group().patchValue({ lat: null, lng: null });
  }

  /** Postal code vs province (manual entry only) — the same rule the server enforces. */
  postalMismatch(): string | null {
    const v = this.group().getRawValue();
    const letter = String(v.postalCode || '').trim().charAt(0).toUpperCase();
    if (!letter || !v.province) return null;
    const allowed = POSTAL_PROVINCES[letter];
    return allowed && !allowed.includes(v.province) ? `That postal code belongs to ${allowed.join('/')}, not ${v.province}.` : null;
  }
}
