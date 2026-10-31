import { Component, inject, effect, OnInit, OnDestroy } from '@angular/core';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatIcon } from '@angular/material/icon';
import { MatBadge } from '@angular/material/badge';
import { MatDivider } from '@angular/material/divider';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { ChatSocketService } from '../../services/chat-socket.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  imports: [
    CommonModule,
    MatToolbar,
    MatButton,
    MatIconButton,
    MatMenu,
    MatMenuTrigger,
    MatMenuItem,
    MatIcon,
    MatBadge,
    MatDivider,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  standalone: true
})
export class Navbar implements OnInit, OnDestroy {
  authService = inject(AuthService);
  chatService = inject(ChatService);
  private chatSocket = inject(ChatSocketService);
  private messageSub?: Subscription;

  constructor() {
    // Chat isn't an admin feature (admins moderate, they don't chat), so the
    // connection — and the badge it feeds — only exists for a logged-in
    // requester/provider. This stays alive app-wide, not just on /messages.
    effect(() => {
      if (this.authService.isLoggedIn() && !this.authService.isAdmin()) {
        this.chatSocket.connect();
        this.chatService.refreshUnreadCount();
      } else {
        this.chatSocket.disconnect();
        this.chatService.unreadTotal.set(0);
      }
    });
  }

  ngOnInit(): void {
    this.messageSub = this.chatSocket.onNewMessage().subscribe(() => this.chatService.refreshUnreadCount());
  }

  ngOnDestroy(): void {
    this.messageSub?.unsubscribe();
  }

  logout(): void {
    this.authService.logout();
  }
}
