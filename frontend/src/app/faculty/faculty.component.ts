import { Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
@Component({selector:'app-faculty',standalone:false,templateUrl:'./faculty.component.html',styleUrls:['../student/dashboard/student-dashboard.component.css','./faculty.component.css']})
export class FacultyComponent implements OnInit,OnDestroy {
  @ViewChild('evidenceDialog',{static:true}) evidenceDialog!: ElementRef<HTMLDialogElement>;
  students:any[]=[]; selected:any=null; evidence:any=null; error=''; loading=false; saving=false;
  action='legitimate'; reason=''; notice=''; private destroy$=new Subject<void>();
  provider:any=null; private activeCommit='';
  constructor(private http:HttpClient,public auth:AuthService,private route:ActivatedRoute,private router:Router) {}
  ngOnInit() {this.watchLinks();this.refresh();timer(15000,15000).pipe(takeUntil(this.destroy$)).subscribe(()=>this.refresh());}
  private watchLinks() {this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params=>{const commit=params.get('commit'),student=params.get('student');if(student && /^[a-f0-9-]{36}$/i.test(student)){this.openStudent(student);if(commit && /^[a-f0-9-]{36}$/i.test(commit))this.openCommit(commit);}});}
  ngOnDestroy() {this.destroy$.next();this.destroy$.complete();}
  refresh() {
    this.http.get('/faculty/provider-status').pipe(takeUntil(this.destroy$)).subscribe({next:r=>this.provider=r,error:()=>this.provider=null});
    this.http.get<any[]>('/faculty/students').pipe(takeUntil(this.destroy$)).subscribe({next:r=>{this.students=r;this.error='';},error:e=>this.fail(e)});
    if(this.selected) this.openStudent(this.selected.student.id,false);
    if(this.evidence) this.openCommit(this.evidence.commit.id,false);
  }
  openStudent(id:string,clear=true) {
    if(clear) {this.evidence=null;this.loading=true;}
    this.http.get(`/faculty/students/${id}`).pipe(takeUntil(this.destroy$)).subscribe({next:r=>{const value=r as any;this.selected={...value,commits:value.commits.map((c:any)=>({...c,evidence:c.evidence || this.unavailableEvidence()}))};this.loading=false;},error:e=>this.fail(e)});
  }
  closeEvidence() { this.activeCommit=''; this.evidenceDialog.nativeElement.close(); this.evidence=null; void this.router.navigate([],{relativeTo:this.route,queryParams:{},replaceUrl:true}); }
  get pendingDiscussions() { return this.students.reduce((n,s)=>n+Number(s.pending_discussions || 0),0); }
  get linkedStudents() { return this.students.filter(s=>s.repositories>0).length; }
  openCommit(id:string,clear=true) {
    if(clear) {this.activeCommit=id;this.evidence=null;this.loading=true;this.reason='';this.notice='';this.error='';this.evidenceDialog.nativeElement.showModal();}
    this.http.get(`/faculty/commits/${id}`).pipe(takeUntil(this.destroy$)).subscribe({next:r=>{if(this.activeCommit!==id || !this.evidenceDialog.nativeElement.open)return;const value=r as any;this.evidence={...value,commit:{...value.commit,evidence:value.commit.evidence || this.unavailableEvidence()}};this.loading=false;},error:e=>this.fail(e)});
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
  requestDiscussion() {
    if(!this.evidence || this.reason.trim().length<10 || this.saving) return;
    this.saving=true;
    this.http.post(`/faculty/commits/${this.evidence.commit.id}/discussion`,{action:'note',reason:this.reason}).subscribe({
      next:()=>{this.saving=false;this.reason='';this.notice='Technical discussion requested; this is not an accusation.';this.refresh();},
      error:e=>{this.saving=false;this.fail(e);}
    });
  }
  private unavailableEvidence() {return {status:'Legacy evidence - server update pending',abstained:true,reasons:['No current evidence assessment is available.'],baseline:{status:'not_assessed'}};}
  score(value:number|null) {return value===null || value===undefined ? 'Learning / unavailable' : `${Math.round(value)}%`;}
  private fail(e:any) {this.loading=false;this.error=e.error?.message || 'Unable to load data. Check your session and retry.';}
}
