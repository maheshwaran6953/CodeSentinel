import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { StudentDashboardComponent } from './student/dashboard/student-dashboard.component';
import { RepositoryLinkingComponent } from './student/repository-linking/repository-linking.component';
import { AuthGuard } from './guards/auth.guard';
import { StudentGuard } from './guards/student.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  
  // Student routes (protected)
  {
    path: 'student',
    canActivate: [AuthGuard, StudentGuard],
    children: [
      { path: 'dashboard', component: StudentDashboardComponent },
      { path: 'repository-linking', component: RepositoryLinkingComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  
  // Faculty routes (protected)
  {
    path: 'faculty',
    canActivate: [AuthGuard],
    children: [
      // Dashboard and other faculty pages will go here
    ]
  },

  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }