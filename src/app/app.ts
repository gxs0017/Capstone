import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {LoginComponent} from './login/login';
import { Register } from './register/register';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginComponent, Register],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('Neighbourhood-Booking-App');
}
