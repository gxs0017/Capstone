import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { TestComponent } from './test/test';

export const routes: Routes = [
  {path: 'login', component: LoginComponent},
  {path: 'register', component: RegisterComponent},
  {path: 'test', component: TestComponent},
  {path: '', redirectTo: 'login', pathMatch: 'full'},
];
