import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SubmitReviewPayload {
  bookingId: number;
  rating: number;
  comment?: string;
}

export interface Review {
  reviewId: number;
  bookingId: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  requester: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

export interface ProviderReviews {
  providerId: number;
  avgRating: number | null;
  reviewCount: number;
  reviews: Review[];
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly API = 'http://localhost:5000/api/auth/reviews';

  constructor(private http: HttpClient) {}

  submitReview(payload: SubmitReviewPayload): Observable<any> {
    return this.http.post(this.API, payload);
  }

  getReviewsForProvider(providerId: number): Observable<ProviderReviews> {
    return this.http.get<ProviderReviews>(`${this.API}/provider/${providerId}`);
  }
}
