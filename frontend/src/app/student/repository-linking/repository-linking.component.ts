import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RepositoryService } from '../../services/repository.service';
import { StudentService } from '../../services/student.service';
import { Repository, WebhookStatus } from '../../models/repository.model';

@Component({
  selector: 'app-repository-linking',
  templateUrl: './repository-linking.component.html',
  styleUrls: ['./repository-linking.component.css'],
  standalone: false
})
export class RepositoryLinkingComponent implements OnInit, OnDestroy {
  // State management
  currentStep: 1 | 2 | 3 = 1;
  repositories: Repository[] = [];
  selectedRepository: Repository | null = null;
  searchQuery: string = '';
  filteredRepositories: Repository[] = [];

  // UI state
  isLoading: boolean = false;
  isSearching: boolean = false;
  error: string | null = null;

  // Webhook registration state
  webhookStatus: WebhookStatus | null = null;
  registrationProgress: number = 0; // 0, 33, 66, 100

  // Observable subscriptions
  private destroy$ = new Subject<void>();
  private progressInterval: any = null;

  constructor(
    private repositoryService: RepositoryService,
    private studentService: StudentService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadRepositories();
  }

  ngOnDestroy(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load user's repositories from service
   */
  loadRepositories(): void {
    this.isLoading = true;
    this.repositoryService.getRepositories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (repos) => {
          this.repositories = repos;
          this.filteredRepositories = repos;
          // Auto-select first repo by default if none selected
          if (repos.length > 0) {
            this.selectedRepository = repos[0];
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.error = 'Failed to load repositories';
          this.isLoading = false;
        }
      });
  }

  /**
   * Search / filter repository list
   */
  searchRepositories(query: string): void {
    this.searchQuery = query;
    this.isSearching = query.length > 0;

    if (!query || !query.trim()) {
      this.filteredRepositories = this.repositories;
      return;
    }

    const q = query.toLowerCase().trim();
    this.filteredRepositories = this.repositories.filter(repo =>
      repo.name.toLowerCase().includes(q) ||
      repo.fullName.toLowerCase().includes(q) ||
      repo.description.toLowerCase().includes(q) ||
      repo.language.toLowerCase().includes(q)
    );
  }

  /**
   * Clear search box
   */
  clearSearch(): void {
    this.searchQuery = '';
    this.filteredRepositories = this.repositories;
    this.isSearching = false;
  }

  /**
   * Select a repository (Step 1)
   */
  selectRepository(repo: Repository): void {
    if (repo.isArchived) {
      return;
    }
    this.selectedRepository = repo;
  }

  /**
   * Proceed to Step 2 (Review)
   */
  proceedToReview(): void {
    if (!this.selectedRepository) {
      this.error = 'Please select a repository';
      return;
    }
    this.currentStep = 2;
    this.error = null;
  }

  /**
   * Go back to Step 1 (Selection)
   */
  goBackToSelection(): void {
    this.currentStep = 1;
    this.error = null;
  }

  /**
   * Proceed to Step 3 (Webhook Linking)
   */
  proceedToLinking(): void {
    if (!this.selectedRepository) {
      this.error = 'No repository selected';
      return;
    }

    this.currentStep = 3;
    this.isLoading = true;
    this.registrationProgress = 10;
    this.webhookStatus = {
      status: 'installing',
      message: 'Registering webhook...'
    };

    this.registerWebhook();
  }

  /**
   * Register Webhook with simulated progress
   */
  private registerWebhook(): void {
    if (!this.selectedRepository) return;

    this.simulateRegistrationProgress();

    this.repositoryService.registerWebhook(this.selectedRepository)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          if (this.progressInterval) {
            clearInterval(this.progressInterval);
          }
          this.registrationProgress = 100;
          this.webhookStatus = status;
          this.isLoading = false;
          // Update linked repository in StudentService
          if (this.selectedRepository) {
            this.studentService.updateLinkedRepository(this.selectedRepository);
          }
        },
        error: (err) => {
          if (this.progressInterval) {
            clearInterval(this.progressInterval);
          }
          this.webhookStatus = {
            status: 'failed',
            message: 'Webhook registration failed',
            errorCode: 'ERR_WEBHOOK_INSTALL',
            errorMessage: err.message || 'GitHub API error'
          };
          this.isLoading = false;
        }
      });
  }

  /**
   * Progress bar animation loop
   */
  private simulateRegistrationProgress(): void {
    let progress = 10;
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }

    this.progressInterval = setInterval(() => {
      progress += Math.floor(Math.random() * 20) + 10;
      if (progress >= 90) {
        progress = 90;
        clearInterval(this.progressInterval);
      }
      this.registrationProgress = progress;
    }, 400);
  }

  /**
   * Retry registration on error
   */
  retryWebhookRegistration(): void {
    this.error = null;
    this.webhookStatus = null;
    this.registrationProgress = 0;
    this.proceedToLinking();
  }

  /**
   * Go back from Step 3 to Step 2
   */
  goBackFromLinking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.currentStep = 2;
    this.webhookStatus = null;
    this.registrationProgress = 0;
    this.isLoading = false;
  }

  /**
   * Finish linking and return to dashboard
   */
  completeLinking(): void {
    if (this.selectedRepository) {
      this.studentService.updateLinkedRepository(this.selectedRepository);
    }
    this.router.navigate(['/student/dashboard']);
  }

  /**
   * Cancel and return to dashboard
   */
  cancel(): void {
    this.router.navigate(['/student/dashboard']);
  }
}
