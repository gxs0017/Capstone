// services/idle.service.ts
// Logs the user out after 5 minutes of inactivity (protects shared devices).
import { Injectable, NgZone, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class IdleService {
  private authService = inject(AuthService);
  private zone = inject(NgZone);

  private readonly TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly LAST_ACTIVITY_KEY = 'nb_last_activity';
  private readonly ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

  private timerId: any = null;
  private started = false;
  private readonly onActivity = () => this.reset();

  /** Begin watching for inactivity (call when logged in). */
  start(): void {
    if (this.started || !this.authService.isLoggedIn()) return;
    this.started = true;

    // Already away longer than the timeout? Log out immediately.
    if (this.isExpired()) { this.expire(); return; }

    this.zone.runOutsideAngular(() => {
      this.ACTIVITY_EVENTS.forEach(e =>
        window.addEventListener(e, this.onActivity, { passive: true })
      );
    });
    this.reset();
  }

  /** Stop watching (call on logout). */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, this.onActivity));
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
  }

  private reset(): void {
    localStorage.setItem(this.LAST_ACTIVITY_KEY, Date.now().toString());
    if (this.timerId) clearTimeout(this.timerId);
    this.timerId = setTimeout(() => this.zone.run(() => this.expire()), this.TIMEOUT_MS);
  }

  private isExpired(): boolean {
    const last = Number(localStorage.getItem(this.LAST_ACTIVITY_KEY));
    return !!last && (Date.now() - last) > this.TIMEOUT_MS;
  }

  private expire(): void {
    this.stop();
    this.authService.logout(); // clears token + redirects to /login
  }
}
