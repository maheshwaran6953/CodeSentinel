import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
@Component({selector:'app-login',templateUrl:'./login.component.html',styleUrls:['./login.component.css'],standalone:false})
export class LoginComponent {
  activeTab=0; studentError=''; facultyError=''; isLoading=false; rememberMe=false;
  constructor(private authService:AuthService,private router:Router) {
    if(new URLSearchParams(window.location.search).has('error')) this.studentError='GitHub authorization failed. Please retry and verify App access.';
  }
  switchTab(tabIndex:number):void {this.activeTab=tabIndex;this.studentError='';this.facultyError='';}
  loginWithGitHub():void {this.authService.loginWithGitHubReal();}
  loginFaculty(event:Event):void {
    event.preventDefault();
    const email=(document.getElementById('email') as HTMLInputElement)?.value;
    const password=(document.getElementById('password') as HTMLInputElement)?.value;
    if(!email || !password) {this.facultyError='Email and password are required';return;}
    this.isLoading=true;this.facultyError='';
    this.authService.loginFacultyReal(email,password,this.rememberMe).subscribe({
      next:()=>{this.isLoading=false;this.router.navigate(['/faculty/cohort']);},
      error:err=>{this.isLoading=false;this.facultyError=err.error?.message || 'Sign in unavailable. Please retry.';}
    });
  }
  accountHelp(event:Event):void {event.preventDefault();this.facultyError='Contact your project administrator to create or recover your faculty account in Supabase Auth.';}
}
