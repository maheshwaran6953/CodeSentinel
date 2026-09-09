import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { StudentDashboardData } from '../models/student.model';
import { Repository } from '../models/repository.model';
@Injectable({providedIn:'root'})
export class StudentService {
  readonly repositoryChanged$ = new Subject<Repository>();
  constructor(private http: HttpClient) {}
  getDashboardData(): Observable<StudentDashboardData> { return this.http.get<StudentDashboardData>('/student/dashboard'); }
  updateLinkedRepository(repo: Repository): void { this.repositoryChanged$.next(repo); }
}
