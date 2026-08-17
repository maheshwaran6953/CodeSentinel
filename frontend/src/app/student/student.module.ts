import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StudentDashboardComponent } from './dashboard/student-dashboard.component';

@NgModule({
  declarations: [
    StudentDashboardComponent
  ],
  imports: [
    CommonModule,
    RouterModule
  ],
  exports: [
    StudentDashboardComponent
  ]
})
export class StudentModule { }
