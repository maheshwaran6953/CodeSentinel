import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { StudentDashboardComponent } from './dashboard/student-dashboard.component';
import { RepositoryLinkingComponent } from './repository-linking/repository-linking.component';
import { QuizInterrogationComponent } from './quiz-interrogation/quiz-interrogation.component';

@NgModule({
  declarations: [
    StudentDashboardComponent,
    RepositoryLinkingComponent,
    QuizInterrogationComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
  ],
  exports: [
    StudentDashboardComponent,
    RepositoryLinkingComponent,
    QuizInterrogationComponent
  ]
})
export class StudentModule { }
