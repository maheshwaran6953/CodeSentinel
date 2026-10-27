import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { OnDestroy } from '@angular/core';
import { Subject, firstValueFrom, timer } from 'rxjs';
import { takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
@Component({selector:'app-login',templateUrl:'./login.component.html',styleUrls:['./login.component.css'],standalone:false})
export class LoginComponent implements OnDestroy {
  activeTab=0; studentError=''; facultyError=''; isLoading=false; rememberMe=false;
  checking=false; connectionStatus=''; private destroyed=false; private stop$=new Subject<void>();
  constructor(private authService:AuthService,private router:Router) {
    if(new URLSearchParams(window.location.search).has('error')) this.studentError='GitHub authorization failed. Please retry and verify App access.';
  }
  ngOnDestroy(){this.destroyed=true;this.stop$.next();this.stop$.complete();}
  switchTab(tabIndex:number):void {this.activeTab=tabIndex;this.studentError='';this.facultyError='';}
  async loginWithGitHub():Promise<void> {
    if(this.checking||this.isLoading)return;
    this.studentError='';
    if(await this.ready())this.authService.loginWithGitHubReal();
    else if(!this.destroyed)this.studentError='The service is not ready yet. Retry in a moment. If this continues, ask your advisor to check backend and database availability.';
  }
  private async ready():Promise<boolean> {
    this.checking=true;
    try {
      for(let attempt=1;attempt<=6;attempt++) {
        this.connectionStatus=attempt===1?'Connecting to CodeSentinel…':`Still waiting for the service to start (${attempt} of 6 checks)…`;
        try{await firstValueFrom(this.authService.readiness().pipe(timeout(12000),takeUntil(this.stop$)));this.connectionStatus='';return !this.destroyed;}
        catch(e:any){if(this.destroyed)return false;if(e.status && ![502,503,504].includes(e.status))break;}
        if(attempt<6)await firstValueFrom(timer(3000).pipe(takeUntil(this.stop$)));
      }
      this.connectionStatus='';return false;
    }catch{return false;}finally{this.checking=false;}
  }
  async loginFaculty(event:Event):Promise<void> {
    event.preventDefault();
    if(this.checking||this.isLoading)return;
    const email=(document.getElementById('email') as HTMLInputElement)?.value;
    const password=(document.getElementById('password') as HTMLInputElement)?.value;
    if(!email || !password) {this.facultyError='Email and password are required';return;}
    this.isLoading=true;this.facultyError='';
    if(!await this.ready()){this.isLoading=false;if(!this.destroyed)this.facultyError='The service is not ready yet. Retry shortly or ask your advisor to check database availability.';return;}
    this.authService.loginFacultyReal(email,password,this.rememberMe).pipe(takeUntil(this.stop$)).subscribe({
      next:()=>{this.isLoading=false;this.router.navigate(['/faculty/cohort']);},
      error:err=>{this.isLoading=false;this.facultyError=err.status===401?'Email or password was not accepted. Please check your faculty credentials.':err.status===403?'This account is not authorized for faculty access. Contact the administrator.':'Sign in is temporarily unavailable. Please retry; your password has not been stored.';}
    });
  }
  accountHelp(event:Event):void {event.preventDefault();this.facultyError='Contact your project administrator to create or recover your faculty account in Supabase Auth.';}
}
