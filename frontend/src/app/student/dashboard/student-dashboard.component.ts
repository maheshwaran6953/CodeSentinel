import { Component, OnInit } from '@angular/core';
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
export class StudentDashboardComponent implements OnInit {
  currentUser: User | null = null;
  dashboardData: StudentDashboardData | null = null;
  isLoading: boolean = true;
  userInitials: string = 'JD';
  userNameShort: string = 'John';

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
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.studentService.getDashboardData().subscribe({
      next: (data) => {
        this.dashboardData = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load student dashboard data:', err);
        this.isLoading = false;
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
