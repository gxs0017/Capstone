import { PostType } from '../services/post.service';

/** How each Community Board category looks and what extra fields it takes. */
export interface PostCategory {
  value: PostType;
  label: string;
  icon: string;
  /** Label for the optional price field, or null when the category has no price. */
  priceLabel: string | null;
  /** Shows a "Message" call-to-action on cards (a marketplace-style ad). */
  hasOffer: boolean;
  /** Placeholder to nudge people toward a useful post. */
  hint: string;
}

export const POST_CATEGORIES: PostCategory[] = [
  { value: 'GENERAL',        label: 'General',          icon: 'forum',        priceLabel: null,              hasOffer: false, hint: "What's on your mind? Share news, ask the neighborhood, say hello…" },
  { value: 'WANTED',         label: 'Help wanted',      icon: 'campaign',     priceLabel: 'Budget (optional)', hasOffer: true,  hint: 'What do you need done, and roughly when?' },
  { value: 'OFFERING',       label: 'Services offered', icon: 'handyman',     priceLabel: 'Price (optional)',  hasOffer: true,  hint: 'What do you offer, and where are you based?' },
  { value: 'FOR_SALE',       label: 'For sale & free',  icon: 'sell',         priceLabel: 'Price (0 = free)',  hasOffer: true,  hint: "What are you selling or giving away? Mention its condition and where to pick it up." },
  { value: 'LOST_FOUND',     label: 'Lost & found',     icon: 'pets',         priceLabel: null,              hasOffer: false, hint: 'Lost or found something? Describe it and where you last saw it.' },
  { value: 'SAFETY',         label: 'Safety',           icon: 'shield',       priceLabel: null,              hasOffer: false, hint: 'Let neighbors know about something they should be aware of.' },
  { value: 'EVENT',          label: 'Events',           icon: 'event',        priceLabel: null,              hasOffer: false, hint: 'What, when and where? Include the date and time.' },
];

export const categoryOf = (type: PostType): PostCategory =>
  POST_CATEGORIES.find((c) => c.value === type) ?? POST_CATEGORIES[0];
