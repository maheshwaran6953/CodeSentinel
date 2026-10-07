import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RepositoryService } from '../../services/repository.service';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../services/auth.service';
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
  teamId=''; teams:any[]=[]; enrolled=false; teamContextReady=false;

  // Webhook registration state
  webhookStatus: WebhookStatus | null = null;
  registrationProgress: number = 0; // 0, 33, 66, 100

  // Observable subscriptions
  private destroy$ = new Subject<void>();
  private progressInterval: any = null;

  constructor(
    private repositoryService: RepositoryService,
    private studentService: StudentService,
    private router: Router,
    public auth: AuthService,
    private http: HttpClient,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadRepositories();
    this.http.get<any>('/teams/me').pipe(takeUntil(this.destroy$)).subscribe({next:data=>{
      this.enrolled=data.enrollments.length>0;
      this.teams=data.teams.filter((t:any)=>t.approved&&t.members.some((m:any)=>m.roster_id===t.lead_roster_id&&m.user_id===this.auth.getCurrentUser()?.id&&m.status==='accepted'));
      const requested=this.route.snapshot.queryParamMap.get('team');
      this.teamId=this.teams.some(t=>t.id===requested)?requested!:(this.teams.length===1?this.teams[0].id:'');
      this.teamContextReady=true;
    },error:()=>{this.error='Team membership could not be verified. Reload this page before linking a repository.';}});
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
          this.error = err.error?.message || 'Failed to load repositories';
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
    if(!this.teamContextReady || (this.enrolled&&!this.teamId)){this.error='Choose an approved team you lead before linking its repository.';return;}
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
    if(!this.teamContextReady || (this.enrolled&&!this.teamId)){this.error='Team membership must be verified before linking.';return;}
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

    this.repositoryService.registerWebhook(this.selectedRepository, this.teamId||undefined)
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
          if (this.selectedRepository && status.status === 'completed') {
            this.studentService.updateLinkedRepository(this.selectedRepository);
          }
        },
        error: (err) => {
          if (this.progressInterval) {
            clearInterval(this.progressInterval);
          }
          this.webhookStatus = {
            status: 'failed',
            message: err.status === 401 ? 'Your session has expired.' : 'Repository linking failed',
            errorCode: err.status === 401 ? 'ERR_SESSION_EXPIRED' : 'ERR_WEBHOOK_INSTALL',
            errorMessage: err.status === 401
              ? 'Sign in again, then return to your team and link its repository.'
              : err.error?.message || 'GitHub API error'
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
      progress += 10;
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

  signInAgain(): void {
    this.router.navigate(['/login']);
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
    if (this.selectedRepository && this.webhookStatus?.status === 'completed') {
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
