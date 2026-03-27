import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { HomeComponent } from './home/home';
import { SearchComponent } from './search/search';
import { ProfileComponent } from './profile/profile';
import { BookingComponent } from './booking/booking';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'search', component: SearchComponent },
  { path: 'booking', component: BookingComponent },
  { path: 'profile', component: ProfileComponent },
  { path: '**', redirectTo: 'home' },
];
