import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: false
})
export class LoginComponent {
  activeTab: number = 0;
  studentError: string = '';
  facultyError: string = '';
  isLoading: boolean = false;
  rememberMe: boolean = false;

  // Toggle between mock (development) and real (production) mode
  isDevelopmentMode: boolean = true; // Set to false for production

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  switchTab(tabIndex: number): void {
    this.activeTab = tabIndex;
    this.studentError = '';
    this.facultyError = '';
  }

  loginWithGitHub(): void {
    if (this.isDevelopmentMode) {
      // Development: Use mock login
      console.log('Development Mode: Using mock GitHub login');
      this.authService.loginWithGitHubMock();
    } else {
      // Production: Use real GitHub OAuth
      console.log('Production Mode: Redirecting to GitHub OAuth');
      this.authService.loginWithGitHubReal();
    }
  }

  loginFaculty(event: Event): void {
    event.preventDefault();
    
    const emailInput = (document.getElementById('email') as HTMLInputElement)?.value;
    const passwordInput = (document.getElementById('password') as HTMLInputElement)?.value;

    if (!emailInput || !passwordInput) {
      this.facultyError = 'Email and password are required';
      return;
    }

    this.isLoading = true;
    this.facultyError = '';

    if (this.isDevelopmentMode) {
      // Development: Use mock login
      this.authService.loginFacultyMock(emailInput, passwordInput)
        .subscribe(
          (user) => {
            this.isLoading = false;
            console.log('Mock faculty login successful:', user);
            this.router.navigate(['/faculty/cohort']);
          },
          (error) => {
            this.isLoading = false;
            this.facultyError = 'Mock login error (development mode)';
          }
        );
    } else {
      // Production: Use real API
      this.authService.loginFacultyReal(emailInput, passwordInput)
        .subscribe(
          (user) => {
            this.isLoading = false;
            this.router.navigate(['/faculty/cohort']);
          },
          (error) => {
            this.isLoading = false;
            this.facultyError = 'Invalid email or password';
          }
        );
    }
  }
}