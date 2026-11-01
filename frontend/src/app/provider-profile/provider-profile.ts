import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { SearchService, ProviderProfile } from '../services/search';
import { ReviewService, Review } from '../services/review.service';
import { ChatService } from '../services/chat.service';
import { AuthService } from '../services/auth.service';

/** Public storefront page for a provider — all their services/prices + reviews,
 *  shareable and viewable without logging in. Linked from the search page,
 *  the Community Board, and admin's chat moderation context. */
@Component({
  selector: 'app-provider-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButton, MatIcon, MatProgressSpinner],
  templateUrl: './provider-profile.html',
  styleUrl: './provider-profile.css',
})
export class ProviderProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private searchService = inject(SearchService);
  private reviewService = inject(ReviewService);
  private chatService = inject(ChatService);
  private snackBar = inject(MatSnackBar);
  authService = inject(AuthService);

  profile = signal<ProviderProfile | null>(null);
  reviews = signal<Review[]>([]);
  loading = signal(true);
  notFound = signal(false);
  messageLoading = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.searchService.getProviderProfile(id).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });

    this.reviewService.getReviewsForProvider(id).subscribe({
      next: (res) => this.reviews.set(res.reviews),
      error: () => {},
    });
  }

  message(): void {
    const profile = this.profile();
    if (!profile) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.messageLoading.set(true);
    this.chatService.startConversation(profile.id).subscribe({
      next: (conversation) => {
        this.messageLoading.set(false);
        this.router.navigate(['/messages'], { queryParams: { conversation: conversation.conversationId } });
      },
      error: () => {
        this.messageLoading.set(false);
        this.snackBar.open('Could not start the conversation. Please try again.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  book(serviceName: string, serviceId: number): void {
    const profile = this.profile();
    if (!profile) return;
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    const provider = {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: '',
      city: profile.city,
      province: profile.province,
      services: profile.services.map((s) => s.serviceName),
    };
    this.router.navigate(['/booking'], { state: { provider, service: serviceName, serviceId } });
  }

  getInitials(): string {
    const p = this.profile();
    return p ? `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase() : '?';
  }

  isMine(): boolean {
    return this.authService.currentUser()?.id === this.profile()?.id;
  }

  starIcon(rating: number, position: number): string {
    if (position <= Math.floor(rating)) return 'star';
    if (position === Math.ceil(rating) && rating % 1 >= 0.5) return 'star_half';
    return 'star_border';
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

  trackByService(_i: number, s: { serviceId: number }): number {
    return s.serviceId;
  }

  trackByReview(_i: number, r: Review): number {
    return r.reviewId;
  }
}
