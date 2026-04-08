import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Blocks unauthenticated users — redirects to /login */
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

/** Blocks users whose role is not in the allowed list */
export const roleGuard = (...allowedRoles: string[]): CanActivateFn => {
  return () => {
    const auth   = inject(AuthService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
      router.navigate(['/login']);
      return false;
    }

    if (!allowedRoles.includes(auth.role)) {
      router.navigate(['/home']);
      return false;
    }

    return true;
  };
};
