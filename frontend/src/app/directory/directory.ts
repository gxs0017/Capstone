import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DirectoryService, DirectoryEntry, Proximity } from '../services/directory.service';
import { SearchService } from '../services/search';
import { ChatService } from '../services/chat.service';
import { AuthService } from '../services/auth.service';

/** The neighbourhood directory ("yellow pages"): scroll the service providers
 *  around you, nearest first. Only providers are listed — neighbours/requesters
 *  never are — and no listing shows an email, phone or street address. */
@Component({
  selector: 'app-directory',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButton, MatIconButton, MatIcon,
    MatFormFieldModule, MatInput, MatSelect, MatOption,
    MatProgressSpinner,
  ],
  templateUrl: './directory.html',
  styleUrl: './directory.css',
})
export class DirectoryComponent implements OnInit, OnDestroy {
  private directoryService = inject(DirectoryService);
  private searchService = inject(SearchService);
  private chatService = inject(ChatService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private subs = new Subscription();
  authService = inject(AuthService);

  entries = signal<DirectoryEntry[]>([]);
  loading = signal(false);
  total = signal(0);
  totalPages = signal(1);
  currentPage = signal(1);
  viewerArea = signal<{ city: string; province: string; neighbourhood: string | null } | null>(null);
  serviceOptions = signal<string[]>([]);
  messagingId = signal<number | null>(null);
  readonly pageSize = 12;

  searchFilter = new FormControl('');
  serviceFilter = new FormControl('');

  ngOnInit(): void {
    this.searchService.getServices().subscribe((s) => this.serviceOptions.set(s.filter((x) => x.providerCount > 0).map((x) => x.serviceName)));
    this.load(1);
    this.subs.add(
      this.searchFilter.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load(1)),
    );
    this.subs.add(this.serviceFilter.valueChanges.subscribe(() => this.load(1)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(page = 1): void {
    this.loading.set(true);
    this.directoryService.getDirectory(
      {
        search: this.searchFilter.value || undefined,
        service: this.serviceFilter.value || undefined,
      },
      page,
      this.pageSize,
    ).subscribe({
      next: (res) => {
        this.entries.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.currentPage.set(res.page);
        this.viewerArea.set(res.viewerArea);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  clearFilters(): void {
    this.searchFilter.setValue('', { emitEvent: false });
    this.serviceFilter.setValue('', { emitEvent: false });
    this.load(1);
  }

  message(entry: DirectoryEntry): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.messagingId.set(entry.id);
    this.chatService.startConversation(entry.id).subscribe({
      next: (conversation) => {
        this.messagingId.set(null);
        this.router.navigate(['/messages'], { queryParams: { conversation: conversation.conversationId } });
      },
      error: () => {
        this.messagingId.set(null);
        this.snackBar.open('Could not start the conversation. Please try again.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  proximityLabel(p: Proximity): string | null {
    switch (p) {
      case 'SAME_NEIGHBOURHOOD': return 'Your neighbourhood';
      case 'SAME_CITY':     return 'Your city';
      case 'SAME_PROVINCE': return 'Nearby';
      default:              return null;
    }
  }

  initials(e: DirectoryEntry): string {
    return `${e.firstName?.[0] ?? ''}${e.lastName?.[0] ?? ''}`.toUpperCase();
  }

  starIcon(rating: number, position: number): string {
    if (position <= Math.floor(rating)) return 'star';
    if (position === Math.ceil(rating) && rating % 1 >= 0.5) return 'star_half';
    return 'star_border';
  }

  isMe(e: DirectoryEntry): boolean {
    return this.authService.currentUser()?.id === e.id;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }

  trackByEntry(_i: number, e: DirectoryEntry): number {
    return e.id;
  }
}
