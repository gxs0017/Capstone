import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './layout/navbar/navbar';
import { Footer } from './layout/footer/footer';
import { AuthService } from './services/auth.service';
import { IdleService } from './services/idle.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css',
  standalone: true
})
export class App {
  private auth = inject(AuthService);
  private idle = inject(IdleService);
  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) this.idle.start();
      else this.idle.stop();
    });
  }
}
