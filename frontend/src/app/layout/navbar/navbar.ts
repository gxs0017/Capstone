import { Component } from '@angular/core';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [MatToolbar,
    MatButton,
    MatIconButton,
    MatMenu,
    MatMenuTrigger,
    MatMenuItem,
    MatIcon,
    MatDivider,
    RouterLink,
    RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  logout(): void {

  }
}
