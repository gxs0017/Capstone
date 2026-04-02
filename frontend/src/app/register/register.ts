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
  ],
  templateUrl: './register.html',
  styleUrls: ['./register.css'],
})
export class RegisterComponent {
  Role = Role;
  items = ['Snow Shovelling', 'Babysitting', 'Tutoring', 'Lawn Mowing'];

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
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    addressForm: new FormGroup({
      street: new FormControl('', [Validators.required]),
      city: new FormControl('', [Validators.required]),
      province: new FormControl('', [Validators.required]),
      postalCode: new FormControl('', [
        Validators.required,
        Validators.pattern(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/),
      ]),
    }),
    role: new FormControl<Role | null>(null, [Validators.required]),
    services: new FormControl<string[]>([]),
  });

  constructor(private authService: AuthService, private router: Router) {
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
