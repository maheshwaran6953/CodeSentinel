import { Component } from '@angular/core';
import { Router } from '@angular/router';

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

  constructor(private router: Router) {}

  switchTab(tabIndex: number): void {
    this.activeTab = tabIndex;
    this.studentError = '';
    this.facultyError = '';
  }

  loginWithGitHub(): void {
    console.log('Redirecting to GitHub OAuth...');
    // This will connect to actual backend endpoint
    window.location.href = 'http://localhost:3000/auth/github';
  }

  loginFaculty(event: Event): void {
    event.preventDefault();
    
    const emailInput = (document.getElementById('email') as HTMLInputElement)?.value;
    const passwordInput = (document.getElementById('password') as HTMLInputElement)?.value;
    const rememberMeCheckbox = (document.getElementById('remember') as HTMLInputElement)?.checked;

    if (!emailInput || !passwordInput) {
      this.facultyError = 'Email and password are required';
      return;
    }

    this.isLoading = true;
    this.facultyError = '';

    // TODO: Replace with actual API call to backend
    // this.authService.loginFaculty(emailInput, passwordInput, rememberMeCheckbox)
    //   .subscribe(
    //     (response) => {
    //       this.isLoading = false;
    //       this.router.navigate(['/faculty/cohort']);
    //     },
    //     (error) => {
    //       this.isLoading = false;
    //       this.facultyError = 'Invalid email or password';
    //     }
    //   );

    // For now, simulate API call
    setTimeout(() => {
      this.isLoading = false;
      this.facultyError = 'Invalid email or password (Demo mode)';
    }, 1500);
  }
}