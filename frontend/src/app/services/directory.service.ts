import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

export type Proximity = 'SAME_NEIGHBOURHOOD' | 'SAME_CITY' | 'SAME_PROVINCE' | 'ELSEWHERE';

export interface DirectoryEntry {
  id: number;
  firstName: string;
  lastName: string;
  city: string;
  province: string;
  neighbourhood: string | null;
  bio: string | null;
  proximity: Proximity;
  memberSince: string;
  avgRating: number | null;
  reviewCount: number;
  completedJobs: number;
  /** Only present when the provider chose to show them. */
  email?: string | null;
  phoneNumber?: string | null;
  minPrice?: number | null;
  services: { id: number; name: string; price: number }[];
}

export type DirectorySort = 'nearest' | 'rating' | 'jobs' | 'price' | 'name' | 'newest';

export interface DirectoryFilters {
  search?: string;
  service?: string;
  /** Advanced filters */
  cityFilter?: string;
  neighbourhood?: string;
  minRating?: number;
  maxPrice?: number;
  sort?: DirectorySort;
}

export interface DirectoryPage {
  data: DirectoryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  viewerArea: { city: string; province: string; neighbourhood: string | null } | null;
}

export interface Recommendations {
  data: DirectoryEntry[];
  viewerArea: DirectoryPage['viewerArea'];
}

@Injectable({ providedIn: 'root' })
export class DirectoryService {
  private readonly API = `${API_BASE}/directory`;

  constructor(private http: HttpClient) {}

  /** Nearby service providers, nearest first. */
  getDirectory(opts: DirectoryFilters, page = 1, limit = 12): Observable<DirectoryPage> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (opts.search) params = params.set('search', opts.search);
    if (opts.service) params = params.set('service', opts.service);
    if (opts.cityFilter) params = params.set('cityFilter', opts.cityFilter);
    if (opts.neighbourhood) params = params.set('neighbourhood', opts.neighbourhood);
    if (opts.minRating) params = params.set('minRating', String(opts.minRating));
    if (opts.maxPrice) params = params.set('maxPrice', String(opts.maxPrice));
    if (opts.sort && opts.sort !== 'nearest') params = params.set('sort', opts.sort);
    return this.http.get<DirectoryPage>(this.API, { params });
  }

  /** "Recommended near you": nearest, best-rated providers (not user-posted). */
  getRecommendations(limit = 6, service?: string): Observable<Recommendations> {
    let params = new HttpParams().set('limit', String(limit));
    if (service) params = params.set('service', service);
    return this.http.get<Recommendations>(`${API_BASE}/recommendations`, { params });
  }
}
