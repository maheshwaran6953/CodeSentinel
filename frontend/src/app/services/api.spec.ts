import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthService } from './auth.service';
import { RepositoryService } from './repository.service';
import { QuizService } from './quiz.service';
import { ApiInterceptor } from './api.interceptor';
import { FacultyGuard } from '../guards/faculty.guard';
import { Router, UrlTree } from '@angular/router';

describe('Authenticated API contracts',()=>{
  let http:HttpTestingController;let auth:AuthService;
  beforeEach(()=>{
    (window as any).__CODESENTINEL_CONFIG__={apiUrl:'/api'};
    TestBed.configureTestingModule({imports:[HttpClientTestingModule],providers:[
      {provide:HTTP_INTERCEPTORS,useClass:ApiInterceptor,multi:true},
      {provide:Router,useValue:{createUrlTree:()=>new UrlTree()}}
    ]});
    http=TestBed.inject(HttpTestingController);auth=TestBed.inject(AuthService);
  });
  afterEach(()=>http.verify());
  it('hydrates only the server session and sends credentials',()=>{
    expect(auth.isLoggedIn()).toBeFalse();
    auth.refresh().subscribe();const request=http.expectOne('/api/auth/me');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({id:'student',name:'Student',email:'',role:'student'});
    expect(auth.isStudent()).toBeTrue();
    expect(TestBed.inject(FacultyGuard).canActivate()).toEqual(jasmine.any(UrlTree));
  });
  it('faculty login sends credentials and remember choice to the real endpoint',()=>{
    auth.loginFacultyReal('faculty@example.edu','password',true).subscribe();
    const request=http.expectOne('/api/auth/login');expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({email:'faculty@example.edu',password:'password',remember:true});
    request.flush({id:'faculty',name:'Faculty',email:'faculty@example.edu',role:'faculty'});
    expect(TestBed.inject(FacultyGuard).canActivate()).toBeTrue();
  });
  it('handles no pending quiz without creating static questions',()=>{
    TestBed.inject(QuizService).getQuizSession().subscribe(session=>expect(session).toBeNull());
    http.expectOne('/api/quizzes/active').flush(null);
  });
  it('sends only repository identity when linking',()=>{
    TestBed.inject(RepositoryService).registerWebhook({id:'42'} as any).subscribe();
    const request=http.expectOne('/api/repositories/link');expect(request.request.body).toEqual({repositoryId:'42'});
    request.flush({status:'completed',message:'Authorized'});
  });
});
