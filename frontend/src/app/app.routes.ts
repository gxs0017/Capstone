import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./home/home').then((m) => m.HomeComponent) },
  { path: 'login', loadComponent: () => import('./login/login').then((m) => m.LoginComponent) },
  { path: 'payment/:bookingId', loadComponent: () => import('./payments/payment').then((m) => m.PaymentComponent), canActivate: [roleGuard('REQUESTER', 'PROVIDER')] },
  { path: 'wallet', loadComponent: () => import('./wallet/wallet').then((m) => m.WalletComponent), canActivate: [roleGuard('REQUESTER', 'PROVIDER')] },
  { path: 'register', loadComponent: () => import('./register/register').then((m) => m.RegisterComponent) },
  // The old Services page now lives inside the Directory; old links keep working
  { path: 'search', redirectTo: 'directory', pathMatch: 'full' },
  { path: 'board', loadComponent: () => import('./board/board').then((m) => m.BoardComponent) },
  { path: 'board/:id', loadComponent: () => import('./board-post/board-post').then((m) => m.BoardPostComponent) },
  { path: 'directory', loadComponent: () => import('./directory/directory').then((m) => m.DirectoryComponent) },
  { path: 'providers/:id', loadComponent: () => import('./provider-profile/provider-profile').then((m) => m.ProviderProfileComponent) },
  { path: 'booking', loadComponent: () => import('./booking/booking').then((m) => m.BookingComponent), canActivate: [authGuard] },
  { path: 'profile', loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent), canActivate: [authGuard] },
  { path: 'my-bookings', loadComponent: () => import('./my-bookings/my-bookings').then((m) => m.MyBookingsComponent), canActivate: [roleGuard('REQUESTER', 'PROVIDER')] },
  { path: 'requests', loadComponent: () => import('./my-bookings/my-bookings').then((m) => m.MyBookingsComponent), canActivate: [roleGuard('PROVIDER')], data: { requestsView: true } },
  { path: 'review/:id', loadComponent: () => import('./review/review').then((m) => m.ReviewComponent), canActivate: [roleGuard('REQUESTER', 'PROVIDER')] },
  { path: 'availability', loadComponent: () => import('./availability/availability').then((m) => m.AvailabilityComponent), canActivate: [roleGuard('PROVIDER')] },
  { path: 'admin', loadComponent: () => import('./admin/admin').then((m) => m.AdminComponent), canActivate: [roleGuard('ADMIN')] },
  { path: 'messages', loadComponent: () => import('./messages/messages').then((m) => m.MessagesComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: 'home' },
];
