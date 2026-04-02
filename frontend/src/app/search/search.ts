import { Component, inject, signal, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardTitle, MatCardSubtitle, MatCardActions } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { SearchService, Provider } from '../services/search';

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
    MatCard,
    MatCardContent,
    MatCardTitle,
    MatCardSubtitle,
    MatCardActions,
    MatIcon,
    MatChip,
    MatChipSet,
    MatProgressSpinner,
  ],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class SearchComponent implements OnInit {
  private searchService = inject(SearchService);
  private router = inject(Router);

  serviceFilter = new FormControl('');
  cityFilter    = new FormControl('');

  providers  = signal<Provider[]>([]);
  loading    = signal(false);
  usingMock  = signal(false);

  serviceOptions = ['Snow Shovelling', 'Babysitting', 'Tutoring', 'Lawn Mowing'];

  ngOnInit(): void {
    this.loadProviders();
  }

  loadProviders(): void {
    this.loading.set(true);
    this.usingMock.set(false);

    this.searchService
      .getProviders(
        this.serviceFilter.value || undefined,
        this.cityFilter.value   || undefined
      )
      .subscribe({
        next: (data: Provider[]) => {
          this.providers.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.usingMock.set(true);
        },
      });
  }

  clearFilters(): void {
    this.serviceFilter.reset();
    this.cityFilter.reset();
    this.loadProviders();
  }

  getInitials(p: Provider): string {
    return (p.firstName[0] + p.lastName[0]).toUpperCase();
  }

  // Navigate to booking confirmation with selected provider + service
  bookNow(provider: Provider, service: string): void {
    this.router.navigate(['/booking'], {
      state: { provider, service }
    });
  }
}
