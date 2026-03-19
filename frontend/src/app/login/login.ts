import { Component } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatCard,
    MatCardTitle,
    MatCardContent,
    MatFormField,
    MatLabel,
    MatInput,
    MatButton,
    RouterLink,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent {
  loginForm = new FormGroup({
    email: new FormControl('', [
      Validators.required,
      Validators.email]),

    password: new FormControl('', [
      Validators.required
    ]),
  });

  constructor(private authService: AuthService) {}

  login() {
    const user = this.authService.login(
      this.loginForm.value.email!,
      this.loginForm.value.password!);

    if (user) {
      console.log('Login success');
    } else {
      console.log('Invalid login');
    }
    this.loginForm.reset();
  }
}

