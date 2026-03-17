import { Component } from '@angular/core';
import {Role} from '../models/role.enum';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';


@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCard,
    MatCardTitle,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
    MatButton,
    RouterLink,
    MatFormFieldModule,
    MatInputModule

  ],
  templateUrl: './register.html',
  styleUrls: ['./register.css'],
})
export class RegisterComponent {
  Role = Role;
  items = ['Snow Shovelling', 'Babysitting', 'Tutoring', 'Lawn Mowing'];

  registerForm = new FormGroup({

    firstName: new FormControl('', [
      Validators.required
    ]),

    lastName: new FormControl('', [
      Validators.required
    ]),

    phoneNumber: new FormControl('', [
      Validators.required,
      Validators.pattern(/^\d{10}$/)
    ]),

    dateOfBirth: new FormControl('', [
      Validators.required,
      (control) => {
        const dob = new Date(control.value);
        return dob < new Date() ? null : { futureDate: true };
      }
    ]),

    email: new FormControl('', [
      Validators.required, 
      Validators.email]),

    password: new FormControl('', [
      Validators.required,
      Validators.minLength(6)
    ]),

    addressForm: new FormGroup({

      street: new FormControl('', [
        Validators.required
      ]),

      city: new FormControl('', [
        Validators.required
      ]),

      province: new FormControl('', [
        Validators.required
      ]),

      postalCode: new FormControl('', [
        Validators.required,
        Validators.pattern(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/)
      ]),

    }),

    role: new FormControl<Role | null>(null, [
      Validators.required]),
    services: new FormControl<string[]>([],),

  });
  constructor(private authService: AuthService) {
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
    if (this.registerForm.valid) {
      this.authService.register(this.registerForm.value);
      console.log('Register success');
      this.registerForm.reset();
    }
  }

}
