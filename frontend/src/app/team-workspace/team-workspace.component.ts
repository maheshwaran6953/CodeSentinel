import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Component({selector:'app-team-workspace',standalone:true,imports:[CommonModule,FormsModule,RouterModule],templateUrl:'./team-workspace.component.html',styleUrls:['../class-management/workspace.css']})
export class TeamWorkspaceComponent implements OnInit,OnDestroy {
  data:any=null; activity:any=null; error=''; message=''; busy=false; loading=false;
  activityLoading=false; activityError='';
  claim={classId:'',registerNumber:''}; project={classId:'',name:'',projectTitle:''};
  private stop$=new Subject<void>();private destroyed=false;private activityRequest=0;private loadRequest=0;
  constructor(private http:HttpClient,public auth:AuthService,private route:ActivatedRoute){}
  ngOnInit(){void this.load();this.route.queryParamMap.pipe(takeUntil(this.stop$)).subscribe(p=>{const id=p.get('teamId');if(id)void this.openTeam(id);});}
  ngOnDestroy(){this.destroyed=true;this.stop$.next();this.stop$.complete();}
  private request<T>(method:'get'|'post',url:string,body?:unknown){return firstValueFrom(this.http.request<T>(method,url,{body}).pipe(takeUntil(this.stop$)));}
  async load(){const token=++this.loadRequest;this.loading=true;this.error='';try{const r:any=await this.request('get','/teams/me');if(this.destroyed||token!==this.loadRequest)return;this.data=r;if(r.enrollments.length===1)this.project.classId=r.enrollments[0].class_id;}catch(e:any){if(token===this.loadRequest)this.fail(e);}finally{if(token===this.loadRequest)this.loading=false;}}
  async mutate(url:string,body:unknown,message:string){if(this.busy)return;this.busy=true;this.error='';this.message='';try{await this.request('post',url,body);if(this.destroyed)return;this.closeActivity();await this.load();this.message=message;}catch(e:any){this.fail(e);}finally{this.busy=false;}}
  submitClaim(){return this.mutate('/classes/claim',this.claim,'Account link requested. Your advisor must verify your identity before approving.');}
  createTeam(){return this.mutate('/teams',this.project,'Team created. Invite your teammate and wait for advisor approval before linking a repository.');}
  accept(team:any){return this.mutate(`/teams/${team.id}/accept`,{},'Team invitation accepted.');}
  decline(team:any){const member=team.members.find((m:any)=>m.user_id===this.auth.getCurrentUser()?.id);if(!member)return;return this.mutate(`/teams/${team.id}/members/${member.roster_id}/remove`,{},'Invitation declined.');}
  lead(team:any){return team.members.some((m:any)=>m.roster_id===team.lead_roster_id&&m.user_id===this.auth.getCurrentUser()?.id&&m.status==='accepted');}
  acceptedMembers(team:any){return team.members.filter((m:any)=>m.status==='accepted').length;}
  pendingMembers(team:any){return team.members.filter((m:any)=>m.status==='invited').length;}
  get pendingClaims(){return (this.data?.claims||[]).filter((c:any)=>c.status==='pending').length;}
  classmates(team:any){return (this.data?.classmates||[]).filter((s:any)=>s.class_id===team.class_id&&!team.members.some((m:any)=>m.roster_id===s.id));}
  invite(team:any,rosterId:string){if(rosterId)return this.mutate(`/teams/${team.id}/invitations`,{rosterId},'Invitation sent. GitHub repository access must be granted separately on GitHub.');return;}
  closeActivity(){this.activityRequest++;this.activity=null;this.activityError='';this.activityLoading=false;}
  async openTeam(id:string){this.activity=null;this.activityError='';this.activityLoading=true;const token=++this.activityRequest;try{const r=await this.request('get',`/teams/${id}`);if(!this.destroyed&&token===this.activityRequest)this.activity=r;}catch(e:any){if(!this.destroyed&&token===this.activityRequest)this.activityError=typeof e.error?.message==='string'?e.error.message:'Team activity could not load. Open the team again to retry.';}finally{if(token===this.activityRequest)this.activityLoading=false;}}
  classLabel(id:string){const c=this.data?.classes.find((value:any)=>value.id===id);return c?`${c.department} · ${c.section} · ${c.graduation_year}`:'Your enrolled class';}
  private fail(e:any){if(!this.destroyed)this.error=typeof e.error?.message==='string'?e.error.message:'This request could not be completed. Please refresh and retry.';}
}
