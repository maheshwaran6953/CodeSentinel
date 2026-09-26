import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, of, timer } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
interface Notice {id:string;title:string;context:string;occurredAt:string;path:string;commitId?:string;studentId?:string}
@Component({selector:'app-notifications',standalone:true,imports:[CommonModule],template:`
  <button *ngIf="userId" class="inbox-toggle" [style.bottom]="router.url.includes('quiz-interrogation') ? '112px' : '20px'" (click)="dialog.nativeElement.showModal()" aria-haspopup="dialog">Updates <span>{{unread}}</span></button>
  <dialog #inbox aria-labelledby="inbox-title">
    <header><h2 id="inbox-title">Activity & reminders</h2><button (click)="dialog.nativeElement.close()" autofocus>Close</button></header>
    <p>Recent repository activity, analysis, discussions and faculty reviews. Updates every 30 seconds.</p>
    <p class="muted">Read markers are saved on this browser. Up to 100 recent updates are shown.</p>
    <p *ngIf="error" role="alert">{{error}}</p>
    <button *ngIf="items.length" (click)="markAll()">Mark all read</button>
    <p *ngIf="!items.length && !error">No recent updates. Link a repository to begin.</p>
    <button class="notice" *ngFor="let item of items" [class.unread]="!seen.has(item.id)" (click)="open(item)">
      <strong>{{item.title}} <span *ngIf="!seen.has(item.id)">· New</span></strong><span>{{item.context}}</span><time>{{item.occurredAt | date:'medium'}}</time>
    </button>
  </dialog>`,styles:[`
    :host {font-family:Inter,system-ui,sans-serif;color:#e4e4e7}button{font:inherit;cursor:pointer;color:inherit;background:#222228;border:1px solid #44444c;border-radius:8px;padding:10px 14px}
    .inbox-toggle{position:fixed;bottom:20px;right:20px;z-index:25;box-shadow:0 4px 20px #0006}.inbox-toggle span{margin-left:8px;color:#93c5fd}
    dialog{box-sizing:border-box;width:min(520px,calc(100vw - 32px));max-height:80dvh;border:1px solid #44444c;border-radius:16px;padding:24px;background:#141418;color:#e4e4e7}
    dialog::backdrop{background:#0009;backdrop-filter:blur(6px)}header{display:flex;justify-content:space-between;align-items:center;gap:16px}h2{font-size:20px;margin:0}p{font-size:14px;line-height:1.6}.muted,time{color:#a1a1aa;font-size:12px}
    .notice{display:flex;flex-direction:column;gap:8px;width:100%;text-align:left;margin-top:12px;overflow-wrap:anywhere}.notice.unread{border-left:3px solid #60a5fa}.notice strong{font-size:14px}.notice>span{font-size:12px;color:#a1a1aa}
  `]})
export class NotificationsComponent implements OnInit,OnDestroy {
  @ViewChild('inbox',{static:true}) dialog!:ElementRef<HTMLDialogElement>;
  items:Notice[]=[]; seen=new Set<string>(); userId=''; error=''; private stop$=new Subject<void>();
  constructor(private auth:AuthService,private http:HttpClient,public router:Router) {}
  get unread() {return this.items.filter(i=>!this.seen.has(i.id)).length;}
  ngOnInit() {
    this.auth.currentUser$.pipe(switchMap(user=>{
      this.userId=user?.id || '';this.items=[];this.seen=new Set();this.error='';this.dialog.nativeElement.close();
      if(!user) return of([] as Notice[]);
      try {const ids=JSON.parse(localStorage.getItem('codesentinel-read:'+user.id) || '[]');if(Array.isArray(ids)) this.seen=new Set(ids.filter(x=>typeof x==='string'));} catch {}
      return timer(0,30000).pipe(switchMap(()=>this.http.get<Notice[]>('/notifications').pipe(catchError(()=>{this.error='Updates could not refresh. They will retry automatically.';return of(null);})))) ;
    }),takeUntil(this.stop$)).subscribe(items=>{if(items){this.items=items;this.error='';}});
  }
  markAll() {this.items.forEach(i=>this.seen.add(i.id));this.persist();}
  private persist() {try {localStorage.setItem('codesentinel-read:'+this.userId,JSON.stringify([...this.seen].slice(-1000)));}catch{this.error='Read markers cannot be saved in this browser.';}}
  open(item:Notice) {this.seen.add(item.id);this.persist();this.dialog.nativeElement.close();void this.router.navigate([item.path],{queryParams:item.studentId?{commit:item.commitId,student:item.studentId}:undefined});}
  ngOnDestroy() {this.stop$.next();this.stop$.complete();}
}
