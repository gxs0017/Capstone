import { Component } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatButton } from '@angular/material/button';
import {MatCheckbox} from '@angular/material/checkbox';

@Component({
  selector: 'app-register',
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
    MatCardHeader,
    MatCheckbox,
  ],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  registerForm = new FormGroup({
    firstName: new FormControl('', [Validators.required]),
    lastName: new FormControl('', [Validators.required]),
    dateOfBirth: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),

    addressForm: new FormGroup({
      street: new FormControl('', [Validators.required]),
      city: new FormControl('', [Validators.required]),
      province: new FormControl('', [Validators.required]),
      postalCode: new FormControl('', [Validators.required]),
    }),
  });
  register() {
    //to do
  }
}
