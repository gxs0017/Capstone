import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DirectoryService, DirectoryEntry, Proximity, DirectorySort } from '../services/directory.service';
import { SearchService } from '../services/search';
import { ChatService } from '../services/chat.service';
import { ChatSocketService } from '../services/chat-socket.service';
import { ReviewService, Review } from '../services/review.service';
import { AuthService } from '../services/auth.service';

const SORT_LABELS: { value: DirectorySort; label: string }[] = [
  { value: 'nearest', label: 'Nearest to me' },
  { value: 'rating',  label: 'Best rated' },
  { value: 'jobs',    label: 'Most jobs done' },
  { value: 'price',   label: 'Lowest price' },
  { value: 'newest',  label: 'Newest members' },
  { value: 'name',    label: 'Name (A–Z)' },
];

/**
 * The Directory: every service provider around you in one place — the old
 * "Services" list and the "Directory" combined. A plain search box does most jobs;
 * "Advanced filters" narrows by service, area, rating and price. Each card has the
 * storefront, reviews, message, contact (only if the provider shows it) and
 * booking by service. It updates live when providers change their listings.
 */
@Component({
  selector: 'app-directory',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButton, MatIconButton, MatIcon,
    MatFormFieldModule, MatInput, MatSelect, MatOption,
    MatProgressSpinner,
  ],
  templateUrl: './directory.html',
  styleUrl: './directory.css',
})
export class DirectoryComponent implements OnInit, OnDestroy {
  private directoryService = inject(DirectoryService);
  private searchService = inject(SearchService);
  private chatService = inject(ChatService);
  private chatSocket = inject(ChatSocketService);
  private reviewService = inject(ReviewService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private subs = new Subscription();
  authService = inject(AuthService);

  entries = signal<DirectoryEntry[]>([]);
  loading = signal(false);
  total = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  viewerArea = signal<{ city: string; province: string; neighbourhood: string | null } | null>(null);
  serviceOptions = signal<string[]>([]);
  messagingId = signal<number | null>(null);
  readonly pageSize = 12;

  // Regular search + advanced filters
  searchFilter = new FormControl('');
  serviceFilter = new FormControl('');
  cityFilter = new FormControl('');
  areaFilter = new FormControl('');
  minRating = new FormControl(0);
  maxPrice = new FormControl<number | null>(null);
  sortBy = new FormControl<DirectorySort>('nearest', { nonNullable: true });
  showAdvanced = signal(false);
  readonly sorts = SORT_LABELS;
  readonly ratingChoices = [
    { value: 0, label: 'Any rating' }, { value: 3, label: '3★ & up' },
    { value: 4, label: '4★ & up' }, { value: 4.5, label: '4.5★ & up' },
  ];

  /** How many advanced filters are switched on (shown on the toggle). */
  activeAdvanced = signal(0);
  filtersActive = computed(() => this.activeAdvanced() > 0);

  // Per-card panels
  expandedContactId = signal<number | null>(null);
  expandedReviewsId = signal<number | null>(null);
  loadingReviews = signal(false);
  providerReviews = signal<Map<number, Review[]>>(new Map());

  private liveTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.refreshServiceOptions();
    this.load(1);

    this.subs.add(this.searchFilter.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load(1)));
    this.subs.add(this.serviceFilter.valueChanges.subscribe(() => this.load(1)));
    this.subs.add(this.cityFilter.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.load(1)));
    this.subs.add(this.areaFilter.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.load(1)));
    this.subs.add(this.maxPrice.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.load(1)));
    this.subs.add(this.minRating.valueChanges.subscribe(() => this.load(1)));
    this.subs.add(this.sortBy.valueChanges.subscribe(() => this.load(1)));

    // Live: a provider added a service, changed a price or bio, a review landed... refresh quietly
    this.chatSocket.connect();
    this.subs.add(this.chatSocket.on('directory:changed').subscribe(() => this.refreshLive()));
    this.subs.add(this.chatSocket.on('socket:reconnected').subscribe(() => this.refreshLive()));
  }

  ngOnDestroy(): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.subs.unsubscribe();
  }

  /** Reload the current page without a spinner, batching a burst of changes into one fetch. */
  private refreshLive(): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.load(this.currentPage(), true);
      this.refreshServiceOptions();
      this.providerReviews.set(new Map()); // cached reviews may be out of date now
    }, 400);
  }

  private refreshServiceOptions(): void {
    this.searchService.getServices().subscribe((s) =>
      this.serviceOptions.set(s.filter((x) => x.providerCount > 0).map((x) => x.serviceName)));
  }

  load(page = 1, silent = false): void {
    if (!silent) this.loading.set(true);
    this.activeAdvanced.set(this.countAdvanced());
    this.directoryService.getDirectory(
      {
        search: this.searchFilter.value || undefined,
        service: this.serviceFilter.value || undefined,
        cityFilter: this.cityFilter.value || undefined,
        neighbourhood: this.areaFilter.value || undefined,
        minRating: this.minRating.value || undefined,
        maxPrice: this.maxPrice.value || undefined,
        sort: this.sortBy.value,
      },
      page,
      this.pageSize,
    ).subscribe({
      next: (res) => {
        this.entries.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.currentPage.set(res.page);
        this.viewerArea.set(res.viewerArea);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private countAdvanced(): number {
    return [
      this.serviceFilter.value, this.cityFilter.value, this.areaFilter.value,
      this.minRating.value, this.maxPrice.value,
      this.sortBy.value !== 'nearest' ? this.sortBy.value : '',
    ].filter((v) => !!v).length;
  }

  clearFilters(): void {
    const quiet = { emitEvent: false };
    this.searchFilter.setValue('', quiet);
    this.serviceFilter.setValue('', quiet);
    this.cityFilter.setValue('', quiet);
    this.areaFilter.setValue('', quiet);
    this.minRating.setValue(0, quiet);
    this.maxPrice.setValue(null, quiet);
    this.sortBy.setValue('nearest', quiet);
    this.load(1);
  }

  message(entry: DirectoryEntry): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.messagingId.set(entry.id);
    this.chatService.startConversation(entry.id).subscribe({
      next: (conversation) => {
        this.messagingId.set(null);
        this.router.navigate(['/messages'], { queryParams: { conversation: conversation.conversationId } });
      },
      error: () => {
        this.messagingId.set(null);
        this.snackBar.open('Could not start the conversation. Please try again.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  bookNow(entry: DirectoryEntry, svc: { id: number; name: string }): void {
    const provider = {
      id: entry.id, firstName: entry.firstName, lastName: entry.lastName,
      email: entry.email ?? '', city: entry.city, province: entry.province,
      services: entry.services.map((s) => s.name),
    };
    this.router.navigate(['/booking'], { state: { provider, service: svc.name, serviceId: svc.id } });
  }

  toggleContact(id: number): void {
    this.expandedContactId.set(this.expandedContactId() === id ? null : id);
  }

  toggleReviews(id: number): void {
    if (this.expandedReviewsId() === id) { this.expandedReviewsId.set(null); return; }
    this.expandedReviewsId.set(id);
    if (this.providerReviews().has(id)) return;
    this.loadingReviews.set(true);
    const store = (list: Review[]) => {
      const next = new Map(this.providerReviews());
      next.set(id, list);
      this.providerReviews.set(next);
      this.loadingReviews.set(false);
    };
    this.reviewService.getReviewsForProvider(id).subscribe({ next: (r) => store(r.reviews), error: () => store([]) });
  }

  reviewsFor(id: number): Review[] {
    return this.providerReviews().get(id) || [];
  }

  proximityLabel(p: Proximity): string | null {
    switch (p) {
      case 'SAME_NEIGHBOURHOOD': return 'Your neighborhood';
      case 'SAME_CITY':     return 'Your city';
      case 'SAME_PROVINCE': return 'Nearby';
      default:              return null;
    }
  }

  hasContact(e: DirectoryEntry): boolean {
    return !!(e.email || e.phoneNumber);
  }

  initials(e: DirectoryEntry): string {
    return `${e.firstName?.[0] ?? ''}${e.lastName?.[0] ?? ''}`.toUpperCase();
  }

  starIcon(rating: number, position: number): string {
    if (position <= Math.floor(rating)) return 'star';
    if (position === Math.ceil(rating) && rating % 1 >= 0.5) return 'star_half';
    return 'star_border';
  }

  serviceIcon(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('snow')) return 'ac_unit';
    if (n.includes('babysit') || n.includes('child')) return 'child_care';
    if (n.includes('tutor')) return 'school';
    if (n.includes('lawn') || n.includes('garden') || n.includes('yard')) return 'yard';
    if (n.includes('clean')) return 'cleaning_services';
    if (n.includes('plumb')) return 'plumbing';
    if (n.includes('electric')) return 'electrical_services';
    if (n.includes('pet') || n.includes('dog')) return 'pets';
    return 'handyman';
  }

  isMe(e: DirectoryEntry): boolean {
    return this.authService.currentUser()?.id === e.id;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }

  trackByEntry(_i: number, e: DirectoryEntry): number {
    return e.id;
  }
}
