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
  serviceToAdd     = new FormControl<number | null>(null);
  serviceLoading   = signal(false);
  serviceMessage   = signal('');

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

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.authService.refreshProfile().subscribe();
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

  addService(): void {
    const serviceId = this.serviceToAdd.value;
    if (!serviceId) return;

    const svc = this.availableServices().find(s => s.service_id === serviceId);
    if (!svc) return;

    this.serviceLoading.set(true);
    this.serviceMessage.set('');

    this.providerService.addService(svc.service_name).subscribe({
      next: () => {
        this.serviceLoading.set(false);
        this.serviceMessage.set(`"${svc.service_name}" added!`);
        this.serviceToAdd.reset();
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
