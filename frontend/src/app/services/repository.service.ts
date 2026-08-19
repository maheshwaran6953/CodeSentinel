import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { Repository, WebhookStatus } from '../models/repository.model';

@Injectable({
  providedIn: 'root'
})
export class RepositoryService {
  private mockRepositories: Repository[] = [
    {
      id: 'repo-001',
      name: 'capstone-project',
      owner: 'maheshwaran6953',
      fullName: 'maheshwaran6953/capstone-project',
      description: 'Core payment processing microservice and API gateway integration.',
      language: 'TypeScript',
      stars: 42,
      forks: 3,
      url: 'https://github.com/maheshwaran6953/capstone-project',
      lastUpdated: 'Updated 2h ago',
      branches: 4,
      isPrivate: true
    },
    {
      id: 'repo-002',
      name: 'nodejs-backend',
      owner: 'maheshwaran6953',
      fullName: 'maheshwaran6953/nodejs-backend',
      description: 'Centralized authentication and identity management service.',
      language: 'JavaScript',
      stars: 15,
      forks: 1,
      url: 'https://github.com/maheshwaran6953/nodejs-backend',
      lastUpdated: 'Updated 1w ago',
      branches: 2,
      isPrivate: true
    },
    {
      id: 'repo-003',
      name: 'frontend-angular',
      owner: 'maheshwaran6953',
      fullName: 'maheshwaran6953/frontend-angular',
      description: 'ETL pipelines and data warehouse integration scripts.',
      language: 'TypeScript',
      stars: 8,
      forks: 0,
      url: 'https://github.com/maheshwaran6953/frontend-angular',
      lastUpdated: 'Updated 3d ago',
      branches: 3,
      isPrivate: false
    },
    {
      id: 'repo-004',
      name: 'ml-models',
      owner: 'maheshwaran6953',
      fullName: 'maheshwaran6953/ml-models',
      description: 'Machine learning code authorship classification models.',
      language: 'Python',
      stars: 5,
      forks: 0,
      url: 'https://github.com/maheshwaran6953/ml-models',
      lastUpdated: 'Updated 2w ago',
      branches: 1,
      isPrivate: true
    },
    {
      id: 'repo-005',
      name: 'old-project',
      owner: 'maheshwaran6953',
      fullName: 'maheshwaran6953/old-project',
      description: 'Deprecated customer relationship management system.',
      language: 'Java',
      stars: 2,
      forks: 0,
      url: 'https://github.com/maheshwaran6953/old-project',
      lastUpdated: 'Updated 3m ago',
      branches: 1,
      isPrivate: true,
      isArchived: true
    }
  ];

  private selectedRepository: Repository | null = null;

  constructor() {}

  /**
   * Get user's GitHub repositories
   */
  getRepositories(): Observable<Repository[]> {
    return of(this.mockRepositories).pipe(delay(300));
  }

  /**
   * Validate repository selection
   */
  validateRepository(repo: Repository): Observable<boolean> {
    if (!repo) {
      return of(false);
    }
    return of(true);
  }

  /**
   * Register webhook on GitHub for selected repository
   */
  registerWebhook(repo: Repository): Observable<WebhookStatus> {
    if (!repo) {
      return throwError(() => new Error('No repository provided for webhook registration'));
    }

    this.selectedRepository = repo;

    const successStatus: WebhookStatus = {
      status: 'completed',
      message: 'Webhook registered successfully! CodeSentinel is actively monitoring your repository.'
    };

    return of(successStatus).pipe(delay(2500));
  }

  /**
   * Get currently linked repository
   */
  getSelectedRepository(): Repository | null {
    return this.selectedRepository || this.mockRepositories[0];
  }
}
