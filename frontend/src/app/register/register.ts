import { Component, signal } from '@angular/core';
import { Role } from '../models/role.enum';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { AddressFieldComponent, createAddressGroup } from '../shared/address-field/address-field';
import { ServiceTagsComponent } from '../shared/service-tags/service-tags';
import { SearchService } from '../services/search';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCard,
    MatCardTitle,
    MatCardContent,
    MatFormFieldModule,
    MatInputModule,
    MatSelect,
    MatOption,
    MatButton,
    MatIcon,
    RouterLink,
    AddressFieldComponent,
    ServiceTagsComponent,
  ],
  templateUrl: './register.html',
  styleUrls: ['./register.css'],
})
export class RegisterComponent {
  Role = Role;
  /** Services other providers already offer, offered as one-click suggestions (providers can type any service). */
  suggestions = signal<string[]>([]);

  errorMessage = signal('');
  successMessage = signal('');
  loading = signal(false);

  registerForm = new FormGroup({
    firstName: new FormControl('', [Validators.required]),
    lastName: new FormControl('', [Validators.required]),
    phoneNumber: new FormControl('', [Validators.required, Validators.pattern(/^\d{10}$/)]),
    dateOfBirth: new FormControl('', [
      Validators.required,
      (control) => {
        const dob = new Date(control.value);
        return dob < new Date() ? null : { futureDate: true };
      },
    ]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    addressForm: this.buildAddressGroup(),
    role: new FormControl<Role | null>(null, [Validators.required]),
    services: new FormControl<string[]>([]),
  });

  constructor(private authService: AuthService, private router: Router, private searchService: SearchService) {
    this.searchService.getServices().subscribe((list) =>
      this.suggestions.set(list.filter((x) => x.providerCount > 0).sort((a, b) => b.providerCount - a.providerCount).map((x) => x.serviceName))
    );
    this.registerForm.get('role')?.valueChanges.subscribe((role) => {
      const servicesControl = this.registerForm.get('services');
      if (role === 'PROVIDER') {
        servicesControl?.setValidators([Validators.required]);
      } else {
        servicesControl?.clearValidators();
        servicesControl?.reset();
      }
      servicesControl?.updateValueAndValidity();
    });
  }

  /** The address box edits this group; city / province / postal code are filled in together. */
  private buildAddressGroup() {
    const g = createAddressGroup();
    g.controls.street.addValidators([Validators.required]);
    g.controls.city.addValidators([Validators.required]);
    g.controls.province.addValidators([Validators.required]);
    g.controls.postalCode.addValidators([Validators.required, Validators.pattern(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/)]);
    return g;
  }

  setServices(list: string[]) {
    this.registerForm.get('services')?.setValue(list);
    this.registerForm.get('services')?.markAsTouched();
  }

  register() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');

    // Backend expects 'address', but the form group is named 'addressForm'
    const { addressForm, ...rest } = this.registerForm.value as any;
    const payload = { ...rest, address: addressForm };

    this.authService.register(payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.successMessage.set('Account created! Redirecting to login...');
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Registration failed. Please try again.');
      },
    });
  }
}
