import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { NotificationsComponent } from './notifications.component';

describe('Durable notification inbox',()=>{
  const notice={id:'event-1',title:'Questions ready',context:'owner/repo',occurredAt:'2026-09-29T00:00:00Z',readAt:null,path:'/student/quiz-interrogation',quizId:'quiz-1',questionId:'question-1'};
  let users:BehaviorSubject<any>,http:HttpTestingController,router:any;
  beforeEach(async()=>{
    users=new BehaviorSubject({id:'student-1'});router={url:'/student/dashboard',navigate:jasmine.createSpy().and.resolveTo(true)};
    await TestBed.configureTestingModule({imports:[NotificationsComponent,HttpClientTestingModule],providers:[{provide:AuthService,useValue:{currentUser$:users}},{provide:Router,useValue:router}]}).compileComponents();
    http=TestBed.inject(HttpTestingController);
  });
  function start(){const f=TestBed.createComponent(NotificationsComponent);f.detectChanges();http.expectOne('/notifications/inbox?filter=all').flush({items:[structuredClone(notice)],unreadCount:12,asOf:'2026-09-29T01:00:00Z',nextCursor:'page2'});return f;}
  it('uses the server count and waits for persisted read state before navigating to the exact question',()=>{
    const f=start();expect(f.componentInstance.unread).toBe(12);
    f.componentInstance.open(f.componentInstance.items[0]);expect(router.navigate).not.toHaveBeenCalled();
    const req=http.expectOne('/notifications/event-1/read');expect(req.request.method).toBe('POST');req.flush({readAt:'2026-09-29T02:00:00Z'});
    expect(router.navigate).toHaveBeenCalledWith(['/student/quiz-interrogation'],{queryParams:{quiz:'quiz-1',question:'question-1'}});
    expect(f.componentInstance.unread).toBe(11);f.destroy();http.verify();
  });
  it('keeps a failed acknowledgement unread and visible',()=>{
    const f=start();f.componentInstance.open(f.componentInstance.items[0]);http.expectOne('/notifications/event-1/read').flush({}, {status:503,statusText:'Unavailable'});
    expect(f.componentInstance.items[0].readAt).toBeNull();expect(router.navigate).not.toHaveBeenCalled();expect(f.componentInstance.error).toContain('retry');f.destroy();http.verify();
  });
  it('bulk-read sends the refresh boundary and does not discard notifications after that boundary',()=>{
    const f=start();f.componentInstance.markAll();const req=http.expectOne('/notifications/read-all');expect(req.request.body).toEqual({before:'2026-09-29T01:00:00Z'});req.flush({saved:true});
    http.expectOne('/notifications/inbox?filter=all').flush({items:[],unreadCount:1,asOf:'2026-09-29T02:00:00Z',nextCursor:null});expect(f.componentInstance.unread).toBe(1);f.destroy();http.verify();
  });
  it('does not leak an in-flight previous-account inbox after logout',()=>{
    const f=TestBed.createComponent(NotificationsComponent);f.detectChanges();const req=http.expectOne('/notifications/inbox?filter=all');users.next(null);
    expect(req.cancelled).toBeTrue();expect(f.componentInstance.items).toEqual([]);expect(f.componentInstance.unread).toBe(0);f.destroy();http.verify();
  });
});
