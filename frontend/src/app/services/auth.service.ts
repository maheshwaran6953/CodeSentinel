import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';
export interface User { id: string; name: string; email: string; role: 'student' | 'faculty'; githubId?: string; }
@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();
  constructor(private http: HttpClient) {}
  async initialize(): Promise<void> { await firstValueFrom(this.refresh().pipe(timeout(10000),catchError(() => of(null)))); }
  refresh(): Observable<User> { return this.http.get<User>('/auth/me').pipe(tap(user => this.currentUserSubject.next(user))); }
  loginWithGitHubReal(): void { window.location.href = this.apiBase() + '/auth/github'; }
  loginFacultyReal(email: string, password: string, remember = false): Observable<User> {
    return this.http.post<User>('/auth/login', { email, password, remember }).pipe(tap(user=>this.currentUserSubject.next(user)));
  }
  apiBase(): string { return (window as any).__CODESENTINEL_CONFIG__?.apiUrl || ''; }
  installApp(): void {
    this.http.get<{url:string}>('/auth/installation-url').subscribe({next:r=>window.location.assign(r.url),error:()=>window.location.assign('/login')});
  }
  getCurrentUser(): User | null { return this.currentUserSubject.value; }
  isLoggedIn(): boolean { return this.currentUserSubject.value !== null; }
  isStudent(): boolean { return this.currentUserSubject.value?.role==='student'; }
  isFaculty(): boolean { return this.currentUserSubject.value?.role==='faculty'; }
  clear(): void { this.currentUserSubject.next(null); }
  logout(): void { this.http.post('/auth/logout',{}).subscribe({ next:()=>{ this.clear(); window.location.assign('/login'); }, error:()=>{ window.alert('Sign out could not reach the server. Please retry.'); } }); }
}
