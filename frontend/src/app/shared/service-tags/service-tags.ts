import { Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';

/**
 * Tag editor for the services a provider offers: type any service and press
 * Enter (or comma / "Add") and it becomes a tag. Existing services are offered
 * as one-click suggestions, but nothing is limited to that list.
 */
@Component({
  selector: 'app-service-tags',
  standalone: true,
  imports: [FormsModule, MatIcon],
  templateUrl: './service-tags.html',
  styleUrl: './service-tags.css',
})
export class ServiceTagsComponent {
  tags = model<string[]>([]);
  suggestions = input<string[]>([]);
  max = input(15);
  placeholder = input('Type a service, e.g. Dog walking');

  draft = signal('');
  error = signal('');

  /** Popular services not already chosen, filtered by what's being typed. */
  visibleSuggestions = computed(() => {
    const chosen = new Set(this.tags().map((t) => t.toLowerCase()));
    const term = this.draft().trim().toLowerCase();
    return this.suggestions()
      .filter((s) => !chosen.has(s.toLowerCase()) && (!term || s.toLowerCase().includes(term)))
      .slice(0, 8);
  });

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.add(this.draft());
    } else if (event.key === 'Backspace' && !this.draft() && this.tags().length) {
      this.remove(this.tags().length - 1);
    }
  }

  add(raw: string): void {
    const name = raw.replace(/,/g, ' ').trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (name.length < 2 || name.length > 40) {
      this.error.set('A service name must be 2–40 characters.');
      return;
    }
    if (this.tags().some((t) => t.toLowerCase() === name.toLowerCase())) {
      this.error.set('You already added that one.');
      return;
    }
    if (this.tags().length >= this.max()) {
      this.error.set(`You can add up to ${this.max()} services.`);
      return;
    }
    this.error.set('');
    this.tags.set([...this.tags(), name]);
    this.draft.set('');
  }

  remove(index: number): void {
    this.tags.set(this.tags().filter((_, i) => i !== index));
    this.error.set('');
  }
}
