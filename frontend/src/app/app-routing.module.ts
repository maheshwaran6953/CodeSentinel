import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { StudentDashboardComponent } from './student/dashboard/student-dashboard.component';
import { RepositoryLinkingComponent } from './student/repository-linking/repository-linking.component';
import { QuizInterrogationComponent } from './student/quiz-interrogation/quiz-interrogation.component';
import { AuthGuard } from './guards/auth.guard';
import { StudentGuard } from './guards/student.guard';
import { FacultyGuard } from './guards/faculty.guard';
import { FacultyComponent } from './faculty/faculty.component';
import { CallbackComponent } from './auth/callback.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'auth/callback', component: CallbackComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  
  // Student routes (protected)
  {
    path: 'student',
    canActivate: [AuthGuard, StudentGuard],
    children: [
      { path: 'dashboard', component: StudentDashboardComponent },
      { path: 'repository-linking', component: RepositoryLinkingComponent },
      { path: 'quiz-interrogation', component: QuizInterrogationComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  
  // Faculty routes (protected)
  {
    path: 'faculty',
    canActivate: [AuthGuard, FacultyGuard],
    children: [
      { path: 'cohort', component: FacultyComponent },
      { path: '', redirectTo: 'cohort', pathMatch: 'full' }
    ]
  },

  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
