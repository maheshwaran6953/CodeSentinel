import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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
      imports: [FormsModule, CommonModule],
      declarations: [RepositoryLinkingComponent],
      providers: [
        { provide: RepositoryService, useValue: mockRepositoryService },
        { provide: StudentService, useValue: mockStudentService },
        { provide: Router, useValue: mockRouter }
        ,{ provide: AuthService, useValue: { installApp: () => {}, getCurrentUser:()=>({id:'student-1'}) } },
        { provide: HttpClient, useValue:{get:()=>of({enrollments:[],teams:[]})} },
        { provide: ActivatedRoute, useValue:{snapshot:{queryParamMap:convertToParamMap({})}} }
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
  it('requires an approved lead team for enrolled students and passes the team identity',()=>{
    component.enrolled=true;component.proceedToReview();expect(component.currentStep).toBe(1);
    component.teamId='team-1';component.proceedToReview();expect(component.currentStep).toBe(2);
    component.proceedToLinking();expect(mockRepositoryService.registerWebhook).toHaveBeenCalledWith(mockRepos[0],'team-1');
  });
  it('does not permit linking when membership lookup fails',()=>{
    component.teamContextReady=false;component.proceedToLinking();expect(mockRepositoryService.registerWebhook).not.toHaveBeenCalled();
  });

  it('should navigate back to dashboard on cancel or completion', () => {
    component.completeLinking();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/student/dashboard']);

    component.cancel();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/student/dashboard']);
  });

  it('offers fresh sign-in instead of retrying a link with an expired session', () => {
    mockRepositoryService.registerWebhook.and.returnValue(throwError(() => ({status:401,error:{message:'Please sign in'}})));
    component.proceedToLinking();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your session has expired.');
    expect(fixture.nativeElement.textContent).not.toContain('Retry Registration');
    const button=Array.from(fixture.nativeElement.querySelectorAll('button')).find((b:any)=>b.textContent.trim()==='Sign in again') as HTMLButtonElement;
    button.click();expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    expect(mockStudentService.updateLinkedRepository).not.toHaveBeenCalled();
  });

  it('keeps retry available for a non-session provider failure', () => {
    mockRepositoryService.registerWebhook.and.returnValue(throwError(() => ({status:503,error:{message:'GitHub temporarily unavailable'}})));
    component.proceedToLinking();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('GitHub temporarily unavailable');
    expect(fixture.nativeElement.textContent).toContain('Retry Registration');
    expect(fixture.nativeElement.textContent).not.toContain('Your session has expired.');
  });
});
