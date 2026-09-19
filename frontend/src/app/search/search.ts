import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardTitle, MatCardSubtitle, MatCardActions } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { SearchService, Provider, ProviderPage, SortColumn, SortOrder } from '../services/search';

interface SortToggle {
  label:  string;
  column: SortColumn;
  icon:   string;
}

const PAGE_SIZE = 6;

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInput,
    MatSelect,
    MatOption,
    MatButton,
    MatIconButton,
    MatCard,
    MatCardContent,
    MatCardTitle,
    MatCardSubtitle,
    MatCardActions,
    MatIcon,
    MatProgressSpinner,
    MatTooltipModule,
  ],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class SearchComponent implements OnInit, OnDestroy {
  private searchService = inject(SearchService);
  private router        = inject(Router);
  private subs          = new Subscription();

  serviceFilter = new FormControl('');
  cityFilter    = new FormControl('');

  // Paginated result state
  providers   = signal<Provider[]>([]);
  total       = signal(0);
  totalPages  = signal(1);
  currentPage = signal(1);
  readonly pageSize = PAGE_SIZE;

  loading   = signal(false);
  usingMock = signal(false);

  // Sort state
  activeSort  = signal<SortColumn>('created_at');
  activeOrder = signal<SortOrder>('DESC');

  // Contact expansion state — track which provider card has contact open
  expandedContactId = signal<number | null>(null);

  readonly serviceOptions = ['Snow Shovelling', 'Babysitting', 'Tutoring', 'Lawn Mowing'];

  readonly sortToggles: SortToggle[] = [
    { label: 'Date',  column: 'created_at', icon: 'schedule' },
    { label: 'Name',  column: 'first_name', icon: 'sort_by_alpha' },
    { label: 'City',  column: 'city',       icon: 'location_city' },
  ];

  ngOnInit(): void {
    this.loadProviders();

    // Auto-filter when service type changes
    this.subs.add(
      this.serviceFilter.valueChanges.subscribe(() => this.loadProviders(1))
    );

    // Auto-filter when city changes (debounced for typing)
    this.subs.add(
      this.cityFilter.valueChanges.pipe(
        debounceTime(400),
        distinctUntilChanged()
      ).subscribe(() => this.loadProviders(1))
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  loadProviders(page = this.currentPage()): void {
    this.loading.set(true);
    this.usingMock.set(false);

    this.searchService
      .getProviders(
        this.serviceFilter.value || undefined,
        this.cityFilter.value   || undefined,
        this.activeSort(),
        this.activeOrder(),
        page,
        this.pageSize
      )
      .subscribe({
        next: (result: ProviderPage) => {
          this.providers.set(result.data);
          this.total.set(result.total);
          this.totalPages.set(result.totalPages);
          this.currentPage.set(result.page);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.usingMock.set(true);
        },
      });
  }

  // Pagination
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.loadProviders(page);
  }

  prevPage(): void { this.goToPage(this.currentPage() - 1); }
  nextPage(): void { this.goToPage(this.currentPage() + 1); }

  // Build an array of page numbers to show in the page button row
  // Shows at most 5 numbers centred around the current page
  get pageNumbers(): number[] {
    const total   = this.totalPages();
    const current = this.currentPage();
    const window  = 2; // pages on each side of current
    const start   = Math.max(1, current - window);
    const end     = Math.min(total, current + window);
    const nums: number[] = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }

  get pageLabel(): string {
    const from = (this.currentPage() - 1) * this.pageSize + 1;
    const to   = Math.min(this.currentPage() * this.pageSize, this.total());
    return `${from}–${to} of ${this.total()}`;
  }

  // Sort toggle — clicking the active column flips direction; clicking a new column defaults DESC
  toggleSort(toggle: SortToggle): void {
    if (this.activeSort() === toggle.column) {
      // Flip direction
      this.activeOrder.set(this.activeOrder() === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.activeSort.set(toggle.column);
      this.activeOrder.set('DESC');
    }
    this.loadProviders(1);
  }

  isSortActive(toggle: SortToggle): boolean {
    return this.activeSort() === toggle.column;
  }

  getSortArrow(toggle: SortToggle): string {
    if (this.activeSort() !== toggle.column) return '';
    return this.activeOrder() === 'ASC' ? 'arrow_upward' : 'arrow_downward';
  }

  toggleContact(providerId: number): void {
    this.expandedContactId.set(
      this.expandedContactId() === providerId ? null : providerId
    );
  }

  // Clear everything back to defaults
  clearFilters(): void {
    this.serviceFilter.reset();
    this.cityFilter.reset();
    this.activeSort.set('created_at');
    this.activeOrder.set('DESC');
    this.loadProviders(1);
  }

  getInitials(p: Provider): string {
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

  bookNow(provider: Provider, service: string): void {
    // Look up serviceId from the serviceOptions or pass 0 as fallback
    const serviceIndex = this.serviceOptions.indexOf(service);
    const serviceId = serviceIndex >= 0 ? serviceIndex + 1 : 0; // IDs are 1-indexed in DB
    this.router.navigate(['/booking'], { state: { provider, service, serviceId } });
  }
}
