import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardTitle } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '../services/auth.service';
import { CommonModule } from '@angular/common';

interface ServiceCategory {
  icon: string;
  name: string;
  description: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButton, MatCard, MatCardContent, MatCardTitle, MatIcon],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  authService = inject(AuthService);

  categories: ServiceCategory[] = [
    { icon: 'ac_unit', name: 'Snow Shovelling', description: 'Keep your driveway and walkways clear this winter.' },
    { icon: 'child_care', name: 'Babysitting', description: 'Trusted neighbours to look after your little ones.' },
    { icon: 'school', name: 'Tutoring', description: 'Expert help with homework and school subjects.' },
    { icon: 'yard', name: 'Lawn Mowing', description: 'Keep your yard looking its best all season long.' },
  ];
}
