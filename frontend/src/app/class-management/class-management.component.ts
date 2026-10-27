import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { parseRoster, RosterInput } from './roster-import';

@Component({selector:'app-class-management',standalone:true,imports:[CommonModule,FormsModule,RouterModule],templateUrl:'./class-management.component.html',styleUrls:['./workspace.css']})
export class ClassManagementComponent implements OnInit, OnDestroy {
  classes:any[]=[]; faculty:any[]=[]; detail:any=null; error=''; message=''; busy=false;
  listLoading=false; detailLoading=false; activityLoading=false; activityError='';
  selectedId=''; activity:any=null; create={department:'IT',section:'B',graduationYear:2027,teamMemberLimit:2};
  rosterText=''; preview:RosterInput[]=[]; single={registerNumber:'',name:'',githubLogin:''};
  editingId=''; edit={registerNumber:'',name:'',githubLogin:''};
  team={name:'',projectTitle:'',leadRosterId:'',memberRosterIds:[] as string[],guideId:''};
  limit=2; private stop$=new Subject<void>(); private destroyed=false; private selection=0; private listRequest=0; private activityRequest=0;
  constructor(private http:HttpClient,private route:ActivatedRoute){}
  ngOnInit(){void this.refresh();this.route.queryParamMap.pipe(takeUntil(this.stop$)).subscribe(params=>{const id=params.get('classId');if(id)void this.select(id);const team=params.get('teamId');if(team)void this.openTeam(team);});}
  ngOnDestroy(){this.destroyed=true;this.stop$.next();this.stop$.complete();}
  private request<T>(method:'get'|'post',url:string,body?:unknown){return firstValueFrom(this.http.request<T>(method,url,{body}).pipe(takeUntil(this.stop$)));}
  async refresh(){const token=++this.listRequest;this.listLoading=true;this.error='';try{const r:any=await this.request('get','/classes');if(this.destroyed||token!==this.listRequest)return;this.classes=r.classes;this.faculty=r.faculty;}catch(e:any){if(token===this.listRequest)this.fail(e);}finally{if(token===this.listRequest)this.listLoading=false;}}
  async select(id:string,afterSave=false){if(this.busy&&!afterSave)return;this.selectedId=id;this.detail=null;this.editingId='';this.closeActivity();this.preview=[];this.rosterText='';this.error='';this.message='';const token=++this.selection;this.detailLoading=!!id;if(!id)return;try{const r:any=await this.request('get',`/classes/${id}`);if(this.destroyed||token!==this.selection)return;this.detail=r;this.faculty=r.faculty;this.limit=r.class.team_member_limit;this.team={name:'',projectTitle:'',leadRosterId:'',memberRosterIds:[],guideId:''};}catch(e:any){if(token===this.selection)this.fail(e);}finally{if(token===this.selection)this.detailLoading=false;}}
  async mutate(url:string,body:unknown,message:string){if(this.busy)return;this.busy=true;this.error='';this.message='';try{await this.request('post',url,body);if(this.destroyed)return;await this.refresh();if(this.selectedId)await this.select(this.selectedId,true);this.message=message;}catch(e:any){this.fail(e);}finally{this.busy=false;}}
  async createClass(){await this.mutate('/classes',this.create,'Class created. Select it to add its roster.');}
  previewImport(){this.error='';this.preview=[];try{this.preview=parseRoster(this.rosterText);}catch(e:any){this.error=e.message;}}
  async readFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;if(file.size>250000){this.error='Choose a CSV or text file smaller than 250 KB.';return;}this.rosterText=await file.text();this.previewImport();input.value='';}
  async importRoster(){if(!this.preview.length)return;await this.mutate(`/classes/${this.selectedId}/roster`,{students:this.preview},'Roster saved. Students must verify account links before participating.');}
  async addStudent(){await this.mutate(`/classes/${this.selectedId}/roster`,{students:[{registerNumber:this.single.registerNumber.trim(),name:this.single.name.trim(),...(this.single.githubLogin.trim()?{githubLogin:this.single.githubLogin.trim().replace(/^@/,'')}:{})}]},'Student profile added.');if(!this.error)this.single={registerNumber:'',name:'',githubLogin:''};}
  editStudent(student:any){this.editingId=student.id;this.edit={registerNumber:student.register_number,name:student.name,githubLogin:student.github_login_hint||''};}
  async saveStudent(){await this.mutate(`/classes/${this.selectedId}/roster/${this.editingId}`,{registerNumber:this.edit.registerNumber.trim(),name:this.edit.name.trim(),...(this.edit.githubLogin.trim()?{githubLogin:this.edit.githubLogin.trim().replace(/^@/,'')}:{})},'Student details corrected. Verified account identity is unchanged.');if(!this.error)this.editingId='';}
  saveLimit(){return this.mutate(`/classes/${this.selectedId}/settings`,{teamMemberLimit:this.limit},'Team capacity updated. Existing oversized teams are not silently changed.');}
  review(id:string,action:'approve'|'reject'){return this.mutate(`/classes/${this.selectedId}/claims/${id}/review`,{action},`Account link ${action==='approve'?'approved':'rejected'}.`);}
  get available(){return (this.detail?.roster||[]).filter((r:any)=>!r.team_id);}
  get linkedStudents(){return (this.detail?.roster||[]).filter((s:any)=>!!s.user_id).length;}
  get pendingClaims(){return (this.detail?.claims||[]).filter((c:any)=>c.status==='pending').length;}
  get acceptedStudents(){return new Set((this.detail?.teams||[]).flatMap((t:any)=>t.members.filter((m:any)=>m.status==='accepted').map((m:any)=>m.roster_id))).size;}
  acceptedMembers(team:any){return team.members.filter((m:any)=>m.status==='accepted').length;}
  pendingMembers(team:any){return team.members.filter((m:any)=>m.status==='invited').length;}
  get selectedSeats(){return this.team.memberRosterIds.length+(this.team.leadRosterId?1:0);}
  toggleMember(id:string,checked:boolean){this.team.memberRosterIds=checked?[...this.team.memberRosterIds,id]:this.team.memberRosterIds.filter(value=>value!==id);}
  changeLead(){this.team.memberRosterIds=this.team.memberRosterIds.filter(id=>id!==this.team.leadRosterId);}
  createTeam(){return this.mutate(`/classes/${this.selectedId}/teams`,{...this.team,guideId:this.team.guideId||undefined},'Team created. Members join after accepting their invitations.');}
  saveTeam(team:any,patch:any){return this.mutate(`/teams/${team.id}/settings`,patch,'Team settings saved.');}
  remove(team:any,member:any){if(!window.confirm(`Remove ${member.name} from ${team.name}? Historical evidence will remain.`))return;return this.mutate(`/teams/${team.id}/members/${member.roster_id}/remove`,{},'Membership ended. Historical evidence is preserved.');}
  invite(team:any,rosterId:string){if(!rosterId)return;return this.mutate(`/teams/${team.id}/invitations`,{rosterId},'Invitation sent. The student must accept before participating.');}
  closeActivity(){this.activityRequest++;this.activity=null;this.activityError='';this.activityLoading=false;}
  async openTeam(id:string){const token=++this.activityRequest;this.activityError='';this.activityLoading=true;this.activity=null;try{const r=await this.request('get',`/teams/${id}`);if(!this.destroyed&&token===this.activityRequest)this.activity=r;}catch(e:any){if(!this.destroyed&&token===this.activityRequest)this.activityError=typeof e.error?.message==='string'?e.error.message:'Team activity could not load. Open the team again to retry.';}finally{if(token===this.activityRequest)this.activityLoading=false;}}
  private fail(e:any){if(!this.destroyed)this.error=typeof e.error?.message==='string'?e.error.message:'This request could not be completed. Refresh and try again.';}
}
