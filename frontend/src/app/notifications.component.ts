import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
interface Notice {id:string;title:string;context:string;occurredAt:string;readAt:string|null;path:string;commitId?:string;studentId?:string;quizId?:string;questionId?:string}
interface InboxPage {items:Notice[];unreadCount:number;asOf:string;nextCursor:string|null}
@Component({selector:'app-notifications',standalone:true,imports:[CommonModule],template:`
  <button *ngIf="userId" class="inbox-toggle" [style.bottom]="router.url.includes('quiz-interrogation') ? '112px' : '20px'" (click)="openInbox()" aria-haspopup="dialog">Updates <span>{{unread}}</span></button>
  <dialog #inbox aria-labelledby="inbox-title">
    <header><h2 id="inbox-title">Activity & reminders</h2><button (click)="dialog.nativeElement.close()" autofocus>Close</button></header>
    <p>Recent repository activity, analysis, discussions and faculty reviews. Updates every 30 seconds.</p>
    <p class="muted">Read status is saved to your account across devices. Events are recorded from the durable-notification release onward.</p>
    <p *ngIf="error" role="alert">{{error}}</p>
    <nav aria-label="Notification filters"><button (click)="setFilter('all')" [attr.aria-pressed]="filter==='all'">All</button> <button (click)="setFilter('unread')" [attr.aria-pressed]="filter==='unread'">Unread</button> <button (click)="load()" [disabled]="loading">Refresh</button></nav>
    <button *ngIf="unread && asOf" (click)="markAll()" [disabled]="saving || loading">Mark all read through this refresh</button>
    <p *ngIf="loading" role="status">Loading updates…</p>
    <p *ngIf="!items.length && !error && !loading">No notifications in this view. New workflow events will appear here.</p>
    <button class="notice" *ngFor="let item of items" [class.unread]="!item.readAt" (click)="open(item)" [disabled]="saving || loading">
      <strong>{{item.title}} <span *ngIf="!item.readAt">· New</span></strong><span>{{item.context}}</span><time>{{item.occurredAt | date:'medium'}}</time>
    </button>
    <button *ngIf="nextCursor" (click)="load(true)" [disabled]="loading">Load older updates</button>
  </dialog>`,styles:[`
    :host {font-family:Inter,system-ui,sans-serif;color:#e4e4e7}button{font:inherit;cursor:pointer;color:inherit;background:#222228;border:1px solid #44444c;border-radius:8px;padding:10px 14px}
    .inbox-toggle{position:fixed;bottom:20px;right:20px;z-index:25;box-shadow:0 4px 20px #0006}.inbox-toggle span{margin-left:8px;color:#93c5fd}
    dialog{box-sizing:border-box;width:min(520px,calc(100vw - 32px));max-height:80dvh;border:1px solid #44444c;border-radius:16px;padding:24px;background:#141418;color:#e4e4e7}
    dialog::backdrop{background:#0009;backdrop-filter:blur(6px)}header{display:flex;justify-content:space-between;align-items:center;gap:16px}h2{font-size:20px;margin:0}p{font-size:14px;line-height:1.6}.muted,time{color:#a1a1aa;font-size:12px}
    .notice{display:flex;flex-direction:column;gap:8px;width:100%;text-align:left;margin-top:12px;overflow-wrap:anywhere}.notice.unread{border-left:3px solid #60a5fa}.notice strong{font-size:14px}.notice>span{font-size:12px;color:#a1a1aa}
  `]})
export class NotificationsComponent implements OnInit,OnDestroy {
  @ViewChild('inbox',{static:true}) dialog!:ElementRef<HTMLDialogElement>;
  items:Notice[]=[]; userId=''; error=''; unread=0; filter:'all'|'unread'='all'; asOf=''; nextCursor:string|null=null; loading=false; saving=false;
  private stop$=new Subject<void>(); private accountChanged$=new Subject<void>(); private pages=1;
  constructor(private auth:AuthService,private http:HttpClient,public router:Router) {}
  ngOnInit() {
    this.auth.currentUser$.pipe(takeUntil(this.stop$)).subscribe(user=>{
      this.accountChanged$.next();this.userId=user?.id || '';this.items=[];this.unread=0;this.error='';this.asOf='';this.nextCursor=null;this.loading=false;this.saving=false;this.pages=1;this.dialog.nativeElement.close();
      if(this.userId)this.load();
    });
    timer(30000,30000).pipe(takeUntil(this.stop$)).subscribe(()=>{
      if(!this.userId)return;
      if(this.pages===1 && !this.saving)this.load();
      else this.http.get<{unreadCount:number}>('/notifications/count').pipe(takeUntil(this.stop$),takeUntil(this.accountChanged$)).subscribe({next:r=>this.unread=r.unreadCount,error:()=>this.error='Updates could not refresh. Please retry.'});
    });
  }
  openInbox() {this.dialog.nativeElement.showModal();this.load();}
  setFilter(value:'all'|'unread') {if(this.loading)return;this.filter=value;this.load();}
  load(older=false) {
    if(this.loading || this.saving || !this.userId)return;
    this.loading=true;this.error='';
    const query='?filter='+this.filter+(older && this.nextCursor?'&cursor='+encodeURIComponent(this.nextCursor):'');
    this.http.get<InboxPage>('/notifications/inbox'+query).pipe(takeUntil(this.stop$),takeUntil(this.accountChanged$)).subscribe({next:r=>{
      this.items=older?[...this.items,...r.items.filter(i=>!this.items.some(old=>old.id===i.id))]:r.items;
      this.pages=older?this.pages+1:1;this.unread=r.unreadCount;if(!older)this.asOf=r.asOf;this.nextCursor=r.nextCursor;this.loading=false;
    },error:()=>{this.loading=false;this.error='Updates unavailable. Please retry; saved notifications are retained.';}});
  }
  markAll() {
    if(this.saving || this.loading || !this.asOf)return;this.saving=true;
    this.http.post('/notifications/read-all',{before:this.asOf}).pipe(takeUntil(this.stop$),takeUntil(this.accountChanged$)).subscribe({next:()=>{this.saving=false;this.load();},error:()=>{this.saving=false;this.error='Read status was not saved. Please retry.';}});
  }
  open(item:Notice) {
    if(this.saving || this.loading)return;this.saving=true;
    this.http.post<{readAt:string}>('/notifications/'+item.id+'/read',{}).pipe(takeUntil(this.stop$),takeUntil(this.accountChanged$)).subscribe({next:r=>{
      this.saving=false;if(!item.readAt)this.unread=Math.max(0,this.unread-1);item.readAt=r.readAt;this.dialog.nativeElement.close();
      void this.router.navigate([item.path],{queryParams:item.studentId?{commit:item.commitId,student:item.studentId}:item.quizId?{quiz:item.quizId,question:item.questionId}:item.commitId?{commit:item.commitId}:undefined});
    },error:()=>{this.saving=false;this.error='Unable to open this notification. Refresh and retry.';}});
  }
  ngOnDestroy() {this.stop$.next();this.stop$.complete();this.accountChanged$.complete();}
}
