import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { HomeComponent } from './home/home';
import { SearchComponent } from './search/search';
import { ProfileComponent } from './profile/profile';
import { BookingComponent } from './booking/booking';
import { AdminComponent } from './admin/admin';
import { MyBookingsComponent } from './my-bookings/my-bookings';
import { authGuard, roleGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'search', component: SearchComponent },
  { path: 'booking', component: BookingComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'my-bookings', component: MyBookingsComponent, canActivate: [roleGuard('REQUESTER', 'PROVIDER')] },
  { path: 'requests', component: MyBookingsComponent, canActivate: [roleGuard('PROVIDER')], data: { requestsView: true } },
  { path: 'admin', component: AdminComponent, canActivate: [roleGuard('ADMIN')] },
  { path: '**', redirectTo: 'home' },
];
