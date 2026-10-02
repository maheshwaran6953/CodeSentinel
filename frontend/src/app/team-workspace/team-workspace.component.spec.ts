import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from '../services/auth.service';
import { TeamWorkspaceComponent } from './team-workspace.component';
describe('Student project workspace',()=>{
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[TeamWorkspaceComponent,HttpClientTestingModule,RouterTestingModule],providers:[{provide:AuthService,useValue:{getCurrentUser:()=>({id:'student-1'})}}]}).compileComponents();});
  it('requires accepted membership for lead controls and excludes existing members from invitations',()=>{
    const f=TestBed.createComponent(TeamWorkspaceComponent),c=f.componentInstance;
    const team={class_id:'c',lead_roster_id:'r',members:[{roster_id:'r',user_id:'student-1',status:'invited'}]};
    expect(c.lead(team)).toBeFalse();team.members[0].status='accepted';expect(c.lead(team)).toBeTrue();
    c.data={classmates:[{id:'r',class_id:'c'},{id:'r2',class_id:'c'},{id:'other',class_id:'other'}]};expect(c.classmates(team)).toEqual([{id:'r2',class_id:'c'}]);f.destroy();
  });
  it('keeps roster claim pending until the server confirms advisor review',async()=>{
    const f=TestBed.createComponent(TeamWorkspaceComponent),c=f.componentInstance,http=TestBed.inject(HttpTestingController);
    c.claim={classId:'class-1',registerNumber:'001'};const done=c.submitClaim();const req=http.expectOne('/classes/claim');expect(req.request.body).toEqual(c.claim);req.flush({status:'pending'});
    await f.whenStable();http.expectOne('/teams/me').flush({classes:[],enrollments:[],teams:[],invitations:[],claims:[{register_number:'001',status:'pending'}],classmates:[]});await done;
    expect(c.data.enrollments.length).toBe(0);expect(c.message).toContain('advisor');f.destroy();http.verify();
  });
});
