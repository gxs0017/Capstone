import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { AvailabilityService, AvailabilitySlot } from '../services/availability.service';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-availability',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCard, MatCardContent,
    MatButton, MatIconButton,
    MatIcon,
    MatDivider,
    MatSelect, MatOption,
    MatFormFieldModule,
    MatInput,
    MatProgressSpinner,
    MatTooltipModule,
    MatTimepickerModule,
  ],
  templateUrl: './availability.html',
  styleUrl: './availability.css',
})
export class AvailabilityComponent implements OnInit {
  private availabilityService = inject(AvailabilityService);

  slots   = signal<AvailabilitySlot[]>([]);
  loading = signal(false);
  message = signal('');
  errorMsg = signal('');

  dayControl   = new FormControl<number | null>(null);
  startControl = new FormControl<Date | null>(null);
  endControl   = new FormControl<Date | null>(null);

  readonly dayOptions = DAY_NAMES.map((name, index) => ({ name, index }));

  ngOnInit(): void {
    this.loadSlots();
  }

  loadSlots(): void {
    this.loading.set(true);
    this.availabilityService.getMyAvailability().subscribe({
      next: (slots) => {
        this.slots.set([...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  dayName(dayOfWeek: number): string {
    return DAY_NAMES[dayOfWeek] ?? '';
  }

  formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  private toHHMM(date: Date | null): string | null {
    if (!date) return null;
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  addSlot(): void {
    const dayOfWeek = this.dayControl.value;
    const startTime = this.toHHMM(this.startControl.value);
    const endTime   = this.toHHMM(this.endControl.value);

    if (dayOfWeek === null || !startTime || !endTime) {
      this.errorMsg.set('Please pick a day, start time, and end time.');
      return;
    }
    if (startTime >= endTime) {
      this.errorMsg.set('Start time must be earlier than end time.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set('');
    this.message.set('');

    this.availabilityService.addAvailability({ dayOfWeek, startTime, endTime }).subscribe({
      next: () => {
        this.loading.set(false);
        this.message.set('Availability added!');
        this.dayControl.reset();
        this.startControl.reset();
        this.endControl.reset();
        this.loadSlots();
        setTimeout(() => this.message.set(''), 3000);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message || 'Failed to add availability.');
      },
    });
  }

  removeSlot(slot: AvailabilitySlot): void {
    if (!slot.id) return;
    if (!confirm(`Remove ${this.dayName(slot.dayOfWeek)} ${this.formatTime(slot.startTime)}–${this.formatTime(slot.endTime)}?`)) return;

    this.loading.set(true);
    this.availabilityService.removeAvailability(slot.id).subscribe({
      next: () => {
        this.loading.set(false);
        this.message.set('Availability removed.');
        this.loadSlots();
        setTimeout(() => this.message.set(''), 3000);
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Failed to remove availability.');
      },
    });
  }
}
