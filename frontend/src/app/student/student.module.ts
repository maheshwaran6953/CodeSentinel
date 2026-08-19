import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { StudentDashboardComponent } from './dashboard/student-dashboard.component';
import { RepositoryLinkingComponent } from './repository-linking/repository-linking.component';

@NgModule({
  declarations: [
    StudentDashboardComponent,
    RepositoryLinkingComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
  ],
  exports: [
    StudentDashboardComponent,
    RepositoryLinkingComponent
  ]
})
export class StudentModule { }
