import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'faculty';
  githubId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(this.getUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {}

  /**
   * Mock GitHub OAuth Login - Development Only
   * In production, this redirects to actual GitHub
   */
  loginWithGitHubMock(): void {
    const mockStudent: User = {
      id: 'student-001',
      name: 'John Doe',
      email: 'john.doe@university.edu',
      role: 'student',
      githubId: 'johndoe'
    };

    this.setUser(mockStudent);
    window.location.href = '/student/dashboard';
  }

  /**
   * Real GitHub OAuth Login - Production
   * Redirects to backend OAuth endpoint
   */
  loginWithGitHubReal(): void {
    window.location.href = 'http://localhost:3000/auth/github';
  }

  /**
   * Mock Faculty Login - Development Only
   */
  loginFacultyMock(email: string, password: string): Observable<User> {
    return new Observable(observer => {
      setTimeout(() => {
        const mockFaculty: User = {
          id: 'faculty-001',
          name: 'Dr. Smith',
          email: email,
          role: 'faculty'
        };

        this.setUser(mockFaculty);
        observer.next(mockFaculty);
        observer.complete();
      }, 1000);
    });
  }

  /**
   * Real Faculty Login - Production
   */
  loginFacultyReal(email: string, password: string): Observable<User> {
    return new Observable(observer => {
      // TODO: Replace with actual API call to backend
      // this.http.post('/api/auth/login', { email, password })
      //   .subscribe(...)
    });
  }

  /**
   * Store user in localStorage
   */
  private setUser(user: User): void {
    localStorage.setItem('currentUser', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  /**
   * Retrieve user from localStorage
   */
  private getUserFromStorage(): User | null {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
  }

  /**
   * Get current logged-in user
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  /**
   * Check if user is student
   */
  isStudent(): boolean {
    return this.currentUserSubject.value?.role === 'student';
  }

  /**
   * Check if user is faculty
   */
  isFaculty(): boolean {
    return this.currentUserSubject.value?.role === 'faculty';
  }

  /**
   * Logout
   */
  logout(): void {
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }
}