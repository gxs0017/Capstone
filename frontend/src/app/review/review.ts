import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCard, MatCardContent, MatCardActions } from '@angular/material/card';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { ReviewService } from '../services/review.service';

interface ReviewedBooking {
  bookingId: number;
  service: string;
  provider: { firstName: string; lastName: string };
}

@Component({
  selector: 'app-review',
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
  ],
  templateUrl: './review.html',
  styleUrl: './review.css',
})
export class ReviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private reviewService = inject(ReviewService);

  bookingId = signal<number>(0);
  booking = signal<ReviewedBooking | null>(null);

  rating = signal(0);
  note = new FormControl('');

  loading = signal(false);
  submitted = signal(false);
  errorMsg = signal('');

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.bookingId.set(id);

    const state = history.state as { booking?: ReviewedBooking } | undefined;
    if (state?.booking) {
      this.booking.set(state.booking);
    }
  }

  setRating(star: number): void {
    this.rating.set(star);
  }

  getInitials(p: { firstName: string; lastName: string }): string {
    return (p.firstName[0] + p.lastName[0]).toUpperCase();
  }

  submit(): void {
    if (this.rating() === 0) return;

    this.loading.set(true);
    this.errorMsg.set('');

    this.reviewService
      .submitReview({
        bookingId: this.bookingId(),
        rating: this.rating(),
        comment: this.note.value || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.submitted.set(true);
        },
        error: (err) => {
          this.loading.set(false);
          this.errorMsg.set(err?.error?.message || 'Failed to submit review. Please try again.');
        },
      });
  }

  goToBookings(): void {
    this.router.navigate(['/my-bookings']);
  }
}
