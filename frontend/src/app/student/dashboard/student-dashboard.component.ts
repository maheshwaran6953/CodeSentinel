import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { AuthService, User } from '../../services/auth.service';
import { StudentDashboardData } from '../../models/student.model';

@Component({
  selector: 'app-student-dashboard',
  templateUrl: './student-dashboard.component.html',
  styleUrls: ['./student-dashboard.component.css'],
  standalone: false
})
export class StudentDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  error = '';
  currentUser: User | null = null;
  dashboardData: StudentDashboardData | null = null;
  isLoading: boolean = true;
  userInitials: string = 'ST';
  userNameShort: string = 'Student';

  constructor(
    private studentService: StudentService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser) {
      this.userNameShort = this.currentUser.name ? this.currentUser.name.split(' ')[0] : 'Student';
      this.userInitials = this.currentUser.name
        ? this.currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : 'ST';
    }

    this.loadDashboardData();
    timer(15000,15000).pipe(takeUntil(this.destroy$)).subscribe(()=>this.loadDashboardData());
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadDashboardData(): void {
    this.isLoading = true;
    this.studentService.getDashboardData().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.dashboardData = data;
        this.error = '';
        this.isLoading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Dashboard unavailable. Please retry or sign in again.';
        this.isLoading = false;
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
