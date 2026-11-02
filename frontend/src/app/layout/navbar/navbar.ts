import { Component, inject, effect, OnInit, OnDestroy } from '@angular/core';
import { MatToolbar } from '@angular/material/toolbar';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatIcon } from '@angular/material/icon';
import { MatBadge } from '@angular/material/badge';
import { MatDivider } from '@angular/material/divider';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { ChatSocketService } from '../../services/chat-socket.service';
import { NotificationService, AppNotification } from '../../services/notification.service';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';

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
  notifications = inject(NotificationService);
  private chatSocket = inject(ChatSocketService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private subs = new Subscription();

  constructor() {
    // One app-wide connection. Signed in (admins too — they message people and watch live logs)
    // it carries chat, bookings and notifications; signed out it still carries the public live data.
    effect(() => {
      const loggedIn = this.authService.isLoggedIn();
      this.authService.currentUser(); // reconnect if the account changes
      this.chatSocket.connect();
      if (loggedIn) {
        this.chatService.refreshUnreadCount();
        this.notifications.load();
      } else {
        this.chatService.unreadTotal.set(0);
        this.notifications.clear();
      }
    });
  }

  ngOnInit(): void {
    this.subs.add(this.chatSocket.onNewMessage().subscribe(() => this.chatService.refreshUnreadCount()));

    // Something happened to you: add it to the bell and pop a short toast
    this.subs.add(this.chatSocket.on<AppNotification>('notification:new').subscribe((n) => {
      this.notifications.receive(n);
      this.snackBar.open(n.title, 'View', { duration: 5000, horizontalPosition: 'end', verticalPosition: 'bottom' })
        .onAction().subscribe(() => this.open(n));
    }));

    // Anything missed while the connection was down
    this.subs.add(this.chatSocket.on('socket:reconnected').subscribe(() => {
      if (!this.authService.isLoggedIn()) return;
      this.chatService.refreshUnreadCount();
      this.notifications.load();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  open(n: AppNotification): void {
    this.notifications.markRead(n);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  logout(): void {
    this.authService.logout();
  }
}
