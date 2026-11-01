import { Component, inject, signal, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ProviderService, ServiceItem } from '../services/provider.service';
import { RouterLink } from '@angular/router';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatInput } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
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
    MatProgressSpinner,
    MatTooltipModule,
    MatSlideToggle,
    MatInput,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  authService     = inject(AuthService);
  providerService = inject(ProviderService);

  // Provider service management
  myServices       = signal<ServiceItem[]>([]);
  availableServices = signal<ServiceItem[]>([]);
  addableServices  = signal<ServiceItem[]>([]); // available minus already-added
  serviceToAdd     = new FormControl('', { nonNullable: true });
  priceToAdd       = new FormControl<number | null>(null);
  serviceLoading   = signal(false);
  serviceMessage   = signal('');

  // Public listing (providers): bio shown on the directory card and storefront
  bio               = new FormControl('');
  savingDirectory   = signal(false);
  directoryMessage  = signal('');

  // Contact privacy (providers): both off unless the provider switches them on
  contactMessage    = signal('');

  get user() {
    return this.authService.currentUser();
  }

  get initials(): string {
    const u = this.user;
    if (!u) return '?';
    return (u.firstName[0] + u.lastName[0]).toUpperCase();
  }

  get roleLabel(): string {
    switch (this.user?.role) {
      case 'PROVIDER':  return 'Service Provider';
      case 'REQUESTER': return 'Service Requester';
      case 'ADMIN':     return 'Administrator';
      default:          return 'User';
    }
  }

  saveDirectory(): void {
    this.savingDirectory.set(true);
    this.directoryMessage.set('');
    this.authService.updateDirectoryProfile({ bio: (this.bio.value || '').trim() || null }).subscribe({
      next: () => {
        this.savingDirectory.set(false);
        this.directoryMessage.set('Saved.');
        setTimeout(() => this.directoryMessage.set(''), 3000);
      },
      error: (err) => {
        this.savingDirectory.set(false);
        this.directoryMessage.set(err?.error?.message || 'Could not save your directory settings.');
      },
    });
  }

  private syncDirectoryFields(): void {
    this.bio.setValue(this.user?.bio ?? '');
  }

  setContactPref(which: 'showEmail' | 'showPhone', value: boolean): void {
    this.contactMessage.set('');
    this.authService.updateContactPrefs({ [which]: value }).subscribe({
      next: () => {
        this.contactMessage.set('Saved.');
        setTimeout(() => this.contactMessage.set(''), 2500);
      },
      error: (err) => this.contactMessage.set(err?.error?.message || 'Could not save that setting.'),
    });
  }

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.syncDirectoryFields();
      this.authService.refreshProfile().subscribe(() => this.syncDirectoryFields());
      if (this.authService.isProvider()) {
        this.loadMyServices();
        this.loadAvailableServices();
      }
    }
  }

  loadMyServices(): void {
    this.providerService.getMyServices().subscribe({
      next: (services) => {
        this.myServices.set(services);
        this.updateAddable();
      },
    });
  }

  loadAvailableServices(): void {
    this.providerService.getAvailableServices().subscribe({
      next: (services) => {
        this.availableServices.set(services);
        this.updateAddable();
      },
    });
  }

  updateAddable(): void {
    const myIds = new Set(this.myServices().map(s => s.service_id));
    this.addableServices.set(
      this.availableServices().filter(s => !myIds.has(s.service_id))
    );
  }

  /** Any service name can be added; a new name simply becomes a new tag. */
  addService(): void {
    const name = this.serviceToAdd.value.trim().replace(/\s+/g, ' ');
    if (!name) return;

    this.serviceLoading.set(true);
    this.serviceMessage.set('');

    this.providerService.addService(name, this.priceToAdd.value).subscribe({
      next: () => {
        this.serviceLoading.set(false);
        this.serviceMessage.set(`"${name}" added!`);
        this.serviceToAdd.setValue('');
        this.priceToAdd.reset();
        this.loadMyServices();
        this.authService.refreshProfile().subscribe();
        setTimeout(() => this.serviceMessage.set(''), 3000);
      },
      error: (err) => {
        this.serviceLoading.set(false);
        this.serviceMessage.set(err?.error?.message || 'Failed to add service.');
      },
    });
  }

  removeService(svc: ServiceItem): void {
    if (!confirm(`Remove "${svc.service_name}" from your offerings?`)) return;
    this.serviceLoading.set(true);
    this.serviceMessage.set('');

    this.providerService.removeService(svc.service_id).subscribe({
      next: () => {
        this.serviceLoading.set(false);
        this.serviceMessage.set(`"${svc.service_name}" removed.`);
        this.loadMyServices();
        this.authService.refreshProfile().subscribe();
        setTimeout(() => this.serviceMessage.set(''), 3000);
      },
      error: () => {
        this.serviceLoading.set(false);
        this.serviceMessage.set('Failed to remove service.');
      },
    });
  }

  setPrice(svc: ServiceItem, value: string): void {
    const price = parseFloat(value);
    if (isNaN(price) || price < 0 || price === svc.price) return;
    this.serviceLoading.set(true);
    this.serviceMessage.set('');
    this.providerService.updatePrice(svc.service_id, price).subscribe({
      next: () => {
        this.serviceLoading.set(false);
        this.serviceMessage.set(`Price for "${svc.service_name}" updated.`);
        this.loadMyServices();
        setTimeout(() => this.serviceMessage.set(''), 3000);
      },
      error: (err) => {
        this.serviceLoading.set(false);
        this.serviceMessage.set(err?.error?.message || 'Failed to update price.');
      },
    });
  }

  getServiceIcon(name: string): string {
    switch (name) {
      case 'Snow Shovelling': return 'ac_unit';
      case 'Babysitting':     return 'child_care';
      case 'Tutoring':        return 'school';
      case 'Lawn Mowing':     return 'yard';
      default:                return 'handyman';
    }
  }

  logout(): void {
    this.authService.logout();
  }
}
