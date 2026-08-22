import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { StudentDashboardData } from '../models/student.model';
import { Repository } from '../models/repository.model';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private mockDashboardData: StudentDashboardData = {
    authenticity_score: 85,
    authenticity_level: 'High',
    total_commits: 12,
    avg_score: 82,
    pending_quizzes: 3,
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
      },
      {
        sha: 'dcf456',
        message: 'Implemented database',
        date: 'Jan 9, 2026',
        lines_added: 320,
        score: 45,
        status: 'flagged'
      }
    ]
  };

  constructor() {}

  /**
   * Get Student Dashboard Overview Data
   */
  getDashboardData(): Observable<StudentDashboardData> {
    return of(this.mockDashboardData);
  }

  /**
   * Update Linked Repository details
   */
  updateLinkedRepository(repo: Repository): void {
    this.mockDashboardData.repository = {
      name: repo.fullName,
      url: repo.url,
      linked_at: new Date().toISOString().split('T')[0],
      is_linked: true
    };
  }
}
