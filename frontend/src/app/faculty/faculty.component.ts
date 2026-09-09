import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
@Component({selector:'app-faculty',standalone:false,templateUrl:'./faculty.component.html',styleUrls:['../student/dashboard/student-dashboard.component.css','./faculty.component.css']})
export class FacultyComponent implements OnInit,OnDestroy {
  students:any[]=[]; selected:any=null; evidence:any=null; error=''; loading=false; saving=false;
  action='legitimate'; reason=''; notice=''; private destroy$=new Subject<void>();
  constructor(private http:HttpClient,public auth:AuthService) {}
  ngOnInit() {this.refresh();timer(15000,15000).pipe(takeUntil(this.destroy$)).subscribe(()=>this.refresh());}
  ngOnDestroy() {this.destroy$.next();this.destroy$.complete();}
  refresh() {
    this.http.get<any[]>('/faculty/students').pipe(takeUntil(this.destroy$)).subscribe({next:r=>{this.students=r;this.error='';},error:e=>this.fail(e)});
    if(this.selected) this.openStudent(this.selected.student.id,false);
    if(this.evidence) this.openCommit(this.evidence.commit.id,false);
  }
  openStudent(id:string,clear=true) {
    if(clear) {this.evidence=null;this.loading=true;}
    this.http.get(`/faculty/students/${id}`).pipe(takeUntil(this.destroy$)).subscribe({next:r=>{this.selected=r;this.loading=false;},error:e=>this.fail(e)});
  }
  openCommit(id:string,clear=true) {
    if(clear) {this.loading=true;this.reason='';this.notice='';}
    this.http.get(`/faculty/commits/${id}`).pipe(takeUntil(this.destroy$)).subscribe({next:r=>{this.evidence=r;this.loading=false;},error:e=>this.fail(e)});
  }
  override() {
    if(!this.evidence || this.reason.trim().length<10 || this.saving) return;
    this.saving=true;
    this.http.post(`/faculty/commits/${this.evidence.commit.id}/override`,{action:this.action,reason:this.reason}).subscribe({
      next:()=>{this.saving=false;this.reason='';this.notice='Faculty review saved with original analysis.';this.refresh();},error:e=>{this.saving=false;this.fail(e);}
    });
  }
  retry() {
    this.http.post(`/faculty/commits/${this.evidence.commit.id}/retry`,{}).subscribe({next:()=>{this.notice='Retry queued.';this.refresh();},error:e=>this.fail(e)});
  }
  score(value:number|null) {return value===null || value===undefined ? 'Learning / unavailable' : `${Math.round(value)}%`;}
  private fail(e:any) {this.loading=false;this.error=e.error?.message || 'Unable to load data. Check your session and retry.';}
}
