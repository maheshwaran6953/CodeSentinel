import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../services/auth.service';

describe('Login readiness and recovery',()=>{
  let auth:any;
  beforeEach(async()=>{
    auth=jasmine.createSpyObj('AuthService',['readiness','loginWithGitHubReal','loginFacultyReal']);
    auth.readiness.and.returnValue(of({status:'ready'}));
    await TestBed.configureTestingModule({imports:[CommonModule,FormsModule],declarations:[LoginComponent],providers:[{provide:AuthService,useValue:auth},{provide:Router,useValue:{navigate:()=>{}}}]}).compileComponents();
  });
  it('waits for readiness before redirecting and suppresses duplicate clicks',fakeAsync(()=>{
    const f=TestBed.createComponent(LoginComponent),pending=new Subject();auth.readiness.and.returnValue(pending);
    void f.componentInstance.loginWithGitHub();void f.componentInstance.loginWithGitHub();
    expect(auth.readiness).toHaveBeenCalledTimes(1);expect(auth.loginWithGitHubReal).not.toHaveBeenCalled();
    pending.next({});flushMicrotasks();expect(auth.loginWithGitHubReal).toHaveBeenCalledTimes(1);f.destroy();
  }));
  it('retries read-only readiness within a fixed bound and keeps the user on login',fakeAsync(()=>{
    const f=TestBed.createComponent(LoginComponent);auth.readiness.and.returnValue(throwError(()=>({status:503})));
    void f.componentInstance.loginWithGitHub();flushMicrotasks();
    for(let i=0;i<5;i++){tick(3000);flushMicrotasks();}
    expect(auth.readiness).toHaveBeenCalledTimes(6);expect(auth.loginWithGitHubReal).not.toHaveBeenCalled();
    expect(f.componentInstance.studentError).toContain('not ready');expect(f.componentInstance.checking).toBeFalse();f.destroy();
  }));
  it('cancels pending readiness on navigation instead of redirecting afterward',fakeAsync(()=>{
    const f=TestBed.createComponent(LoginComponent),pending=new Subject();auth.readiness.and.returnValue(pending);
    void f.componentInstance.loginWithGitHub();f.destroy();flushMicrotasks();pending.next({});flushMicrotasks();
    expect(auth.loginWithGitHubReal).not.toHaveBeenCalled();
  }));
  it('checks availability before sending faculty credentials and does not retry login',fakeAsync(()=>{
    const f=TestBed.createComponent(LoginComponent);f.componentInstance.activeTab=1;f.detectChanges();
    (f.nativeElement.querySelector('#email') as HTMLInputElement).value='faculty@example.edu';
    (f.nativeElement.querySelector('#password') as HTMLInputElement).value='test-only';
    auth.loginFacultyReal.and.returnValue(throwError(()=>({status:401})));
    void f.componentInstance.loginFaculty(new Event('submit'));flushMicrotasks();
    expect(auth.readiness).toHaveBeenCalledTimes(1);expect(auth.loginFacultyReal).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.facultyError).toContain('Email or password');f.destroy();
  }));
});
