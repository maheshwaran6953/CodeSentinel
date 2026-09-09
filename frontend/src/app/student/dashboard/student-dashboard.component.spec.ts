import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { StudentDashboardComponent } from './student-dashboard.component';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
import { StudentDashboardData } from '../../models/student.model';

describe('StudentDashboardComponent', () => {
  let component: StudentDashboardComponent;
  let fixture: ComponentFixture<StudentDashboardComponent>;
  let mockStudentService: jasmine.SpyObj<StudentService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockData: StudentDashboardData = {
    authenticity_score: 85,
    authenticity_level: 'High',
    total_commits: 12,
    avg_score: 82,
    pending_quizzes: 0,
    flagged_commits: 1,
    repository: {
      name: 'maheshwaran6953/capstone-project',
      url: 'https://github.com/maheshwaran6953/capstone-project',
      linked_at: '2026-01-01',
      is_linked: true
    },
    recent_commits: [
      {
        sha: 'abc123',
        message: 'Added auth module',
        date: 'Jan 10, 2026',
        lines_added: 150,
        score: 92,
        status: 'normal'
      }
    ]
  };

  beforeEach(async () => {
    mockStudentService = jasmine.createSpyObj('StudentService', ['getDashboardData']);
    mockAuthService = jasmine.createSpyObj('AuthService', ['getCurrentUser', 'logout']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockStudentService.getDashboardData.and.returnValue(of(mockData));
    mockAuthService.getCurrentUser.and.returnValue({
      id: 'student-001',
      name: 'John Doe',
      email: 'john@university.edu',
      role: 'student'
    });

    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule],
      declarations: [StudentDashboardComponent],
      providers: [
        { provide: StudentService, useValue: mockStudentService },
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    spyOn(mockRouter, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(StudentDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load dashboard data on init', () => {
    expect(component.dashboardData).toEqual(mockData);
    expect(component.userNameShort).toBe('John');
    expect(component.userInitials).toBe('JD');
  });

  it('should handle logout', () => {
    component.logout();
    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
