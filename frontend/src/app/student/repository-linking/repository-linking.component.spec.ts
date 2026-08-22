import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RepositoryLinkingComponent } from './repository-linking.component';
import { RepositoryService } from '../../services/repository.service';
import { StudentService } from '../../services/student.service';
import { Repository } from '../../models/repository.model';

describe('RepositoryLinkingComponent', () => {
  let component: RepositoryLinkingComponent;
  let fixture: ComponentFixture<RepositoryLinkingComponent>;
  let mockRepositoryService: jasmine.SpyObj<RepositoryService>;
  let mockStudentService: jasmine.SpyObj<StudentService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockRepos: Repository[] = [
    {
      id: 'repo-001',
      name: 'capstone-project',
      owner: 'maheshwaran6953',
      fullName: 'maheshwaran6953/capstone-project',
      description: 'Core payment processing microservice',
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
      description: 'Centralized auth service',
      language: 'JavaScript',
      stars: 15,
      forks: 1,
      url: 'https://github.com/maheshwaran6953/nodejs-backend',
      lastUpdated: 'Updated 1w ago',
      branches: 2,
      isPrivate: true
    }
  ];

  beforeEach(async () => {
    mockRepositoryService = jasmine.createSpyObj('RepositoryService', ['getRepositories', 'registerWebhook', 'validateRepository']);
    mockStudentService = jasmine.createSpyObj('StudentService', ['updateLinkedRepository']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockRepositoryService.getRepositories.and.returnValue(of(mockRepos));
    mockRepositoryService.registerWebhook.and.returnValue(of({
      status: 'completed',
      message: 'Webhook registered successfully'
    }));

    await TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [RepositoryLinkingComponent],
      providers: [
        { provide: RepositoryService, useValue: mockRepositoryService },
        { provide: StudentService, useValue: mockStudentService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RepositoryLinkingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load repositories on init', () => {
    expect(component.repositories.length).toBe(2);
    expect(component.filteredRepositories.length).toBe(2);
    expect(component.selectedRepository).toEqual(mockRepos[0]);
  });

  it('should filter repositories by search query', () => {
    component.searchRepositories('typescript');
    expect(component.filteredRepositories.length).toBe(1);
    expect(component.filteredRepositories[0].name).toBe('capstone-project');
  });

  it('should select repository', () => {
    component.selectRepository(mockRepos[1]);
    expect(component.selectedRepository).toEqual(mockRepos[1]);
  });

  it('should proceed to review when repository selected', () => {
    component.selectedRepository = mockRepos[0];
    component.proceedToReview();
    expect(component.currentStep).toBe(2);
  });

  it('should register webhook on proceeding to linking', () => {
    component.selectedRepository = mockRepos[0];
    component.proceedToLinking();
    expect(component.currentStep).toBe(3);
    expect(component.webhookStatus?.status).toBe('completed');
    expect(mockStudentService.updateLinkedRepository).toHaveBeenCalledWith(mockRepos[0]);
  });

  it('should navigate back to dashboard on cancel or completion', () => {
    component.completeLinking();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/student/dashboard']);

    component.cancel();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/student/dashboard']);
  });
});
