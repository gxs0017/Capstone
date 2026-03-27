import { Component, inject, signal, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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

  serviceFilter = new FormControl('');
  cityFilter = new FormControl('');

  providers = signal<Provider[]>([]);
  loading = signal(false);
  errorMsg = signal('');

  serviceOptions = ['Snow Shovelling', 'Babysitting', 'Tutoring', 'Lawn Mowing'];

  ngOnInit(): void {
    this.loadProviders();
  }

  loadProviders(): void {
    this.loading.set(true);
    this.errorMsg.set('');
    this.searchService
      .getProviders(
        this.serviceFilter.value || undefined,
        this.cityFilter.value || undefined
      )
      .subscribe({
        next: (data: Provider[]) => {
          this.providers.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.errorMsg.set('Backend unavailable — showing mock data.');
          this.loading.set(false);
          this.providers.set(this.getMockProviders());
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

  getCity(p: Provider): string {
    return p.address?.city || '';
  }

  getProvince(p: Provider): string {
    return p.address?.province || '';
  }

  private getMockProviders(): Provider[] {
    return [
      {
        _id: '1', role: 'PROVIDER',
        firstName: 'Sarah', lastName: 'Thompson', email: 'sarah@example.com',
        services: ['Babysitting', 'Tutoring'],
        address: { street: '1 Main St', city: 'Brampton', province: 'ON', postalCode: 'L6Y 1A1' },
      },
      {
        _id: '2', role: 'PROVIDER',
        firstName: 'James', lastName: 'Kowalski', email: 'james@example.com',
        services: ['Snow Shovelling', 'Lawn Mowing'],
        address: { street: '22 Oak Ave', city: 'Mississauga', province: 'ON', postalCode: 'L5B 2C3' },
      },
      {
        _id: '3', role: 'PROVIDER',
        firstName: 'Priya', lastName: 'Nair', email: 'priya@example.com',
        services: ['Tutoring'],
        address: { street: '8 Elm Dr', city: 'Brampton', province: 'ON', postalCode: 'L6Z 4D5' },
      },
      {
        _id: '4', role: 'PROVIDER',
        firstName: 'Daniel', lastName: 'Brooks', email: 'daniel@example.com',
        services: ['Lawn Mowing', 'Snow Shovelling'],
        address: { street: '55 Birch Rd', city: 'Toronto', province: 'ON', postalCode: 'M4B 1E2' },
      },
    ];
  }
}
