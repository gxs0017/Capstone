import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../core/api.config';

export type PostType =
  'GENERAL' | 'WANTED' | 'OFFERING' | 'RECOMMENDATION' | 'FOR_SALE' | 'LOST_FOUND' | 'SAFETY' | 'EVENT';
export type PostStatus = 'OPEN' | 'CLOSED';

export interface Post {
  postId: number;
  type: PostType;
  title: string;
  description: string;
  price: number | null;
  city: string | null;
  neighbourhood?: string | null;
  status: PostStatus;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  poster: {
    id: number;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface PostPage {
  data: Post[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PostComment {
  commentId: number;
  postId: number;
  parentId: number | null;
  content: string;
  createdAt: string;
  author: { id: number; firstName: string; lastName: string; role: string };
}

export interface CreatePostPayload {
  type: PostType;
  title: string;
  description: string;
  price?: number | null;
  city?: string | null;
}

export interface PostFilters {
  type?: PostType;
  search?: string;
  city?: string;
  /** 'neighbourhood' narrows the feed to the signed-in viewer's own neighbourhood. */
  scope?: 'neighbourhood';
}

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly API = `${API_BASE}/posts`;

  constructor(private http: HttpClient) {}

  /** The Community Board feed — public, no login required to browse. */
  getPosts(filters: PostFilters = {}, page = 1, limit = 12): Observable<PostPage> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.type) params = params.set('type', filters.type);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.city) params = params.set('city', filters.city);
    if (filters.scope) params = params.set('scope', filters.scope);
    return this.http.get<PostPage>(this.API, { params });
  }

  getPost(postId: number): Observable<Post> {
    return this.http.get<Post>(`${this.API}/${postId}`);
  }

  getMyPosts(): Observable<Post[]> {
    return this.http.get<Post[]>(`${this.API}/mine`);
  }

  createPost(payload: CreatePostPayload): Observable<Post> {
    return this.http.post<Post>(this.API, payload);
  }

  closePost(postId: number): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.API}/${postId}/close`, {});
  }

  toggleLike(postId: number): Observable<{ liked: boolean; likeCount: number }> {
    return this.http.post<{ liked: boolean; likeCount: number }>(`${this.API}/${postId}/like`, {});
  }

  getComments(postId: number): Observable<PostComment[]> {
    return this.http.get<PostComment[]>(`${this.API}/${postId}/comments`);
  }

  addComment(postId: number, content: string, parentId?: number): Observable<PostComment> {
    return this.http.post<PostComment>(`${this.API}/${postId}/comments`, { content, parentId });
  }

  deleteComment(postId: number, commentId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API}/${postId}/comments/${commentId}`);
  }
}
