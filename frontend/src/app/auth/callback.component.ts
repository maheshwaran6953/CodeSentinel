import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
@Component({selector:'app-auth-callback',standalone:false,template:'<p>Completing secure sign in...</p>'})
export class CallbackComponent implements OnInit {
  constructor(private auth:AuthService,private router:Router) {}
  ngOnInit() {this.auth.refresh().subscribe({next:u=>this.router.navigate([u.role==='faculty'?'/faculty/cohort':'/student/dashboard']),error:()=>this.router.navigate(['/login'],{queryParams:{error:'session_failed'}})});}
}
