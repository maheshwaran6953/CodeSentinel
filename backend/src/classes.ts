import { Body, Controller, Get, Post, Param, ParseUUIDPipe, Req, Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Database } from './database';
import { AuthRequest, Roles } from './security';

class CreateClass {
 @IsString() @MinLength(1) @MaxLength(60) department!:string;
 @IsString() @MinLength(1) @MaxLength(20) section!:string;
 @IsInt() @Min(2000) @Max(2200) graduationYear!:number;
 @IsInt() @Min(1) @Max(20) teamMemberLimit!:number;
}
class ClassSettings { @IsInt() @Min(1) @Max(20) teamMemberLimit!:number; }
class RosterRow {
 @IsString() @Matches(/^[A-Za-z0-9/-]{1,40}$/) registerNumber!:string;
 @IsString() @MinLength(1) @MaxLength(120) name!:string;
 @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/) githubLogin?:string;
}
class RosterImport { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(250) @ValidateNested({each:true}) @Type(()=>RosterRow) students!:RosterRow[]; }
class Claim { @IsUUID() classId!:string; @IsString() @MaxLength(40) registerNumber!:string; }
class Review { @IsIn(['approve','reject']) action!:'approve'|'reject'; }
class CreateTeam {
 @IsUUID() classId!:string;
 @IsString() @MinLength(1) @MaxLength(100) name!:string;
 @IsString() @MinLength(1) @MaxLength(200) projectTitle!:string;
}
class AdvisorTeam {
 @IsString() @MinLength(1) @MaxLength(100) name!:string;
 @IsString() @MinLength(1) @MaxLength(200) projectTitle!:string;
 @IsUUID() leadRosterId!:string;
 @IsArray() @ArrayMaxSize(19) @IsUUID('all',{each:true}) memberRosterIds!:string[];
 @IsOptional() @IsUUID() guideId?:string;
}
class TeamSettings {
 @IsOptional() @IsUUID() guideId?:string|null;
 @IsOptional() @IsBoolean() approved?:boolean;
 @IsOptional() @IsUUID() leadRosterId?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?:string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(200) projectTitle?:string;
}
class Invite { @IsUUID() rosterId!:string; }
type Queryable={query:(sql:string,args?:any[])=>Promise<any[]>};
const text=(s:string)=>s.trim().replace(/\s+/g,' ');

@Injectable()
export class AcademicAccess {
 constructor(readonly db:Database) {}
 async classFor(id:string,userId:string,manage=false,tx:Queryable=this.db) {
  const [c]=await tx.query(`SELECT c.*,c.advisor_id=$2 AS can_manage FROM project_classes c WHERE c.id=$1
   AND (c.advisor_id=$2 OR ($3::boolean=false AND EXISTS(SELECT 1 FROM project_teams t WHERE t.class_id=c.id AND t.guide_id=$2)))`,[id,userId,manage]);
  if(!c)throw new NotFoundException('Class not found or access not assigned');return c;
 }
 async teamFor(id:string,req:AuthRequest,tx:Queryable=this.db,lock=false) {
  const [t]=await tx.query(`SELECT t.*,c.advisor_id,c.team_member_limit FROM project_teams t JOIN project_classes c ON c.id=t.class_id
   WHERE t.id=$1 ${lock?'FOR UPDATE OF c,t':''}`,[id]);
  if(!t)throw new NotFoundException('Team not found');
  const [member]=await tx.query(`SELECT m.*,s.user_id FROM team_members m JOIN roster_students s ON s.id=m.roster_id
   WHERE m.team_id=$1 AND s.user_id=$2 AND m.status IN ('invited','accepted')`,[id,req.user.id]);
  if(req.user.role==='faculty' ? t.advisor_id!==req.user.id && t.guide_id!==req.user.id : !member)throw new NotFoundException('Team not found');
  return {...t,member,is_advisor:req.user.role==='faculty' && t.advisor_id===req.user.id,
   is_lead:req.user.role==='student' && member?.status==='accepted' && member.roster_id===t.lead_roster_id};
 }
 async facultyRepository(userId:string,repoId:string) {
  const [r]=await this.db.query('SELECT faculty_can_access_repository($1,$2) AS allowed',[userId,repoId]);
  if(!r?.allowed)throw new NotFoundException('Evidence not found or access not assigned');
 }
 async facultyStudent(userId:string,studentId:string) {
  const [r]=await this.db.query('SELECT faculty_can_access_student($1,$2) AS allowed',[userId,studentId]);
  if(!r?.allowed)throw new NotFoundException('Student not found or access not assigned');
 }
 async audit(tx:Queryable,req:AuthRequest,classId:string,teamId:string|null,action:string,details:any={}) {
  await tx.query('INSERT INTO academic_audit(actor_id,class_id,team_id,action,details) VALUES ($1,$2,$3,$4,$5)',[req.user.id,classId,teamId,action,JSON.stringify(details)]);
 }
 async notify(tx:Queryable,kind:string,classId:string,teamId:string|null,studentId:string|null,recipients:string[]) {
  await tx.query('SELECT emit_academic_notification(gen_random_uuid()::text,$1,$2,$3,$4,$5::uuid[])',[kind,classId,teamId,studentId,[...new Set(recipients.filter(Boolean))]]);
 }
 async write<T>(run:(tx:Queryable)=>Promise<T>):Promise<T> {
  try{return await this.db.source.transaction(tx=>run(tx));}
  catch(e:any){if(['23505','23514','23503'].includes(e?.code || e?.driverError?.code))throw new ConflictException('Details conflict with an existing record, class membership or team limit. Refresh and check your selections.');throw e;}
 }
 async teams(ids:string[],tx:Queryable=this.db) {
  if(!ids.length)return [];
  const rows=await tx.query(`SELECT t.*,c.team_member_limit,c.advisor_id,u.name AS guide_name FROM project_teams t
   JOIN project_classes c ON c.id=t.class_id LEFT JOIN users u ON u.id=t.guide_id WHERE t.id=ANY($1::uuid[]) ORDER BY t.name`,[ids]);
  for(const t of rows) {
   t.members=await tx.query(`SELECT m.roster_id,m.status,m.joined_at,m.invited_at,s.register_number,s.name,s.user_id,u.github_login
    FROM team_members m JOIN roster_students s ON s.id=m.roster_id LEFT JOIN users u ON u.id=s.user_id
    WHERE m.team_id=$1 AND m.status<>'left' ORDER BY s.register_number`,[t.id]);
   [t.repository]=await tx.query('SELECT id,full_name,url,active FROM repositories WHERE team_id=$1',[t.id]);
  }return rows;
 }
 async validateGuide(id:string|null|undefined,tx:Queryable) {
  if(id && !(await tx.query("SELECT id FROM users WHERE id=$1 AND role='faculty'",[id])).length)throw new BadRequestException('Choose an existing faculty account. A guide can be assigned later.');
 }
}

@Controller('classes')
export class ClassesController {
 constructor(private db:Database,private access:AcademicAccess) {}
 @Get() @Roles('faculty') async list(@Req() req:AuthRequest) {
  const classes=await this.db.query(`SELECT c.*,c.advisor_id=$1 AS can_manage,
   (SELECT count(*)::int FROM roster_students s WHERE s.class_id=c.id AND (c.advisor_id=$1 OR EXISTS(SELECT 1 FROM team_members m JOIN project_teams t ON t.id=m.team_id WHERE m.roster_id=s.id AND m.status<>'left' AND t.guide_id=$1))) AS student_count,
   (SELECT count(*)::int FROM project_teams t WHERE t.class_id=c.id AND (c.advisor_id=$1 OR t.guide_id=$1)) AS team_count
   FROM project_classes c WHERE c.advisor_id=$1 OR EXISTS(SELECT 1 FROM project_teams t WHERE t.class_id=c.id AND t.guide_id=$1)
   ORDER BY c.graduation_year DESC,c.department,c.section`,[req.user.id]);
  return {classes,faculty:await this.db.query("SELECT id,name FROM users WHERE role='faculty' ORDER BY name")};
 }
 @Post() @Roles('faculty') async create(@Req() req:AuthRequest,@Body() body:CreateClass) {
  if(!text(body.department) || !text(body.section))throw new BadRequestException('Department and section are required');
  return this.access.write(async tx=>{
   const [c]=await tx.query('INSERT INTO project_classes(advisor_id,department,section,graduation_year,team_member_limit) VALUES ($1,$2,$3,$4,$5) RETURNING *',[req.user.id,text(body.department).toUpperCase(),text(body.section).toUpperCase(),body.graduationYear,body.teamMemberLimit]);
   await this.access.audit(tx,req,c.id,null,'class_created',{graduationYear:body.graduationYear,teamMemberLimit:body.teamMemberLimit});return c;
  });
 }
 @Post('claim') @Roles('student') async claim(@Req() req:AuthRequest,@Body() body:Claim) {
  return this.access.write(async tx=>{
   if((await tx.query('SELECT id FROM roster_students WHERE user_id=$1',[req.user.id])).length)throw new ConflictException('Your account is already linked to a student profile');
   const [s]=await tx.query(`SELECT s.*,c.advisor_id FROM roster_students s JOIN project_classes c ON c.id=s.class_id
    WHERE s.class_id=$1 AND s.register_number=$2 FOR UPDATE OF s`,[body.classId,body.registerNumber.trim().toUpperCase()]);
   if(!s || s.user_id)throw new BadRequestException('This profile cannot be requested. Check the class and register number with your advisor.');
   const [claim]=await tx.query('INSERT INTO roster_claims(roster_id,user_id) VALUES ($1,$2) RETURNING id,status',[s.id,req.user.id]);
   await this.access.audit(tx,req,s.class_id,null,'roster_claimed',{claimId:claim.id,rosterId:s.id});
   await this.access.notify(tx,'roster_claimed',s.class_id,null,req.user.id,[s.advisor_id,req.user.id]);return claim;
  });
 }
 @Get(':id') @Roles('faculty') async detail(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string) {
  const c=await this.access.classFor(id,req.user.id);
  const roster=await this.db.query(`SELECT s.*,u.github_login,m.team_id FROM roster_students s LEFT JOIN users u ON u.id=s.user_id
   LEFT JOIN team_members m ON m.roster_id=s.id AND m.status<>'left' LEFT JOIN project_teams t ON t.id=m.team_id
   WHERE s.class_id=$1 AND ($2::boolean OR t.guide_id=$3) ORDER BY s.register_number`,[id,c.can_manage,req.user.id]);
  const teamIds=await this.db.query('SELECT id FROM project_teams WHERE class_id=$1 AND ($2::boolean OR guide_id=$3)',[id,c.can_manage,req.user.id]);
  const claims=c.can_manage?await this.db.query(`SELECT q.id,q.status,q.user_id,s.register_number,s.name,u.github_login FROM roster_claims q
   JOIN roster_students s ON s.id=q.roster_id JOIN users u ON u.id=q.user_id WHERE s.class_id=$1 AND q.status='pending' ORDER BY q.created_at`,[id]):[];
  const audit=await this.db.query(`SELECT a.action,a.details,a.created_at,u.name AS actor_name FROM academic_audit a JOIN users u ON u.id=a.actor_id
   WHERE a.class_id=$1 AND ($2::boolean OR a.team_id IN(SELECT id FROM project_teams WHERE guide_id=$3)) ORDER BY a.created_at DESC LIMIT 50`,[id,c.can_manage,req.user.id]);
  return {class:c,roster,teams:await this.access.teams(teamIds.map(t=>t.id)),claims,audit,faculty:c.can_manage?await this.db.query("SELECT id,name FROM users WHERE role='faculty' ORDER BY name"):[]};
 }
 @Post(':id/roster') @Roles('faculty') async import(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:RosterImport) {
  await this.access.classFor(id,req.user.id,true);
  return this.access.write(async tx=>{
   const seen=new Set<string>();
   for(const row of body.students){const n=row.registerNumber.trim().toUpperCase();if(seen.has(n)||!text(row.name))throw new BadRequestException('Each row needs a name and a unique register number');seen.add(n);}
   if((await tx.query('SELECT id FROM roster_students WHERE class_id=$1 AND register_number=ANY($2::text[])',[id,[...seen]])).length)throw new ConflictException('One or more register numbers already exist. Remove them from this import; existing profiles will not be overwritten.');
   for(const row of body.students)await tx.query('INSERT INTO roster_students(class_id,register_number,name,github_login_hint) VALUES ($1,$2,$3,$4)',[id,row.registerNumber.trim().toUpperCase(),text(row.name),row.githubLogin || null]);
   await this.access.audit(tx,req,id,null,'roster_imported',{count:body.students.length});return {created:body.students.length};
  });
 }
 @Post(':id/settings') @Roles('faculty') async settings(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:ClassSettings) {
  await this.access.classFor(id,req.user.id,true);
  return this.access.write(async tx=>{
   await tx.query('SELECT id FROM project_classes WHERE id=$1 FOR UPDATE',[id]);
   const [n]=await tx.query(`SELECT count(*)::int AS n FROM team_members m JOIN project_teams t ON t.id=m.team_id
    WHERE t.class_id=$1 AND m.status<>'left' GROUP BY t.id ORDER BY count(*) DESC LIMIT 1`,[id]);
   if(n?.n>body.teamMemberLimit)throw new ConflictException('The new limit is below an existing team size, including reserved invitations');
   await tx.query('UPDATE project_classes SET team_member_limit=$2 WHERE id=$1',[id,body.teamMemberLimit]);
   await this.access.audit(tx,req,id,null,'team_limit_changed',{teamMemberLimit:body.teamMemberLimit});return {saved:true};
  });
 }
 @Post(':id/roster/:rosterId') @Roles('faculty') async editStudent(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Param('rosterId',ParseUUIDPipe) rosterId:string,@Body() body:RosterRow) {
  await this.access.classFor(id,req.user.id,true);
  if(!text(body.name))throw new BadRequestException('Student name is required');
  return this.access.write(async tx=>{
   const [before]=await tx.query('SELECT register_number,name,github_login_hint FROM roster_students WHERE id=$1 AND class_id=$2 FOR UPDATE',[rosterId,id]);
   if(!before)throw new NotFoundException('Student profile not found');
   await tx.query('UPDATE roster_students SET register_number=$2,name=$3,github_login_hint=$4 WHERE id=$1',[rosterId,body.registerNumber.trim().toUpperCase(),text(body.name),body.githubLogin || null]);
   await this.access.audit(tx,req,id,null,'roster_updated',{rosterId,before,after:body});return {saved:true};
  });
 }
 @Post(':id/claims/:claimId/review') @Roles('faculty') async review(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Param('claimId',ParseUUIDPipe) claimId:string,@Body() body:Review) {
  await this.access.classFor(id,req.user.id,true);
  return this.access.write(async tx=>{
   // Lock the common roster before competing claims, so approvals serialize.
   const [s]=await tx.query('SELECT s.id,s.user_id FROM roster_students s JOIN roster_claims q ON q.roster_id=s.id WHERE q.id=$1 AND s.class_id=$2 FOR UPDATE OF s',[claimId,id]);
   const [q]=s?await tx.query('SELECT q.*,$2::uuid AS linked_user FROM roster_claims q WHERE q.id=$1 FOR UPDATE',[claimId,s.user_id]):[];
   if(!q || q.status!=='pending')throw new ConflictException('This request is no longer pending');
   if(body.action==='approve'){
    if(q.linked_user || (await tx.query('SELECT id FROM roster_students WHERE user_id=$1',[q.user_id])).length)throw new ConflictException('A student profile or account is already linked');
    await tx.query('UPDATE roster_students SET user_id=$2 WHERE id=$1',[q.roster_id,q.user_id]);
    // Competing claims are never silently granted to another GitHub account.
    const rejected=await tx.query("UPDATE roster_claims SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE roster_id=$1 AND id<>$3 AND status='pending' RETURNING id,user_id",[q.roster_id,req.user.id,claimId]);
    for(const other of rejected){await this.access.notify(tx,'roster_rejected',id,null,other.user_id,[other.user_id]);await this.access.audit(tx,req,id,null,'competing_claim_rejected',{claimId:other.id,userId:other.user_id});}
   }
   await tx.query('UPDATE roster_claims SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1',[claimId,body.action==='approve'?'approved':'rejected',req.user.id]);
   await this.access.audit(tx,req,id,null,'roster_claim_'+body.action,{claimId,userId:q.user_id});
   await this.access.notify(tx,body.action==='approve'?'roster_verified':'roster_rejected',id,null,q.user_id,[q.user_id,req.user.id]);return {saved:true};
  });
 }
 @Post(':id/teams') @Roles('faculty') async createTeam(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:AdvisorTeam) {
  const c=await this.access.classFor(id,req.user.id,true);
  return this.access.write(async tx=>{
   await tx.query('SELECT id FROM project_classes WHERE id=$1 FOR UPDATE',[id]);
   await this.access.validateGuide(body.guideId,tx);
   const ids=[...new Set([body.leadRosterId,...body.memberRosterIds])];
   if(ids.length>c.team_member_limit)throw new ConflictException('Team member limit reached');
   const members=await tx.query('SELECT * FROM roster_students WHERE class_id=$1 AND id=ANY($2::uuid[])',[id,ids]);
   if(members.length!==ids.length)throw new BadRequestException('Select students from this class');
   if(!text(body.name)||!text(body.projectTitle))throw new BadRequestException('Team and project names are required');
   const [t]=await tx.query('INSERT INTO project_teams(class_id,name,project_title,guide_id,lead_roster_id,approved,created_by) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *',[id,text(body.name),text(body.projectTitle),body.guideId || null,body.leadRosterId,req.user.id]);
   for(const s of members){await tx.query('INSERT INTO team_members(team_id,roster_id,invited_by) VALUES ($1,$2,$3)',[t.id,s.id,req.user.id]);if(s.user_id)await this.access.notify(tx,'team_invited',id,t.id,s.user_id,[s.user_id]);}
   await this.access.audit(tx,req,id,t.id,'team_created',{rosterIds:ids,guideId:body.guideId || null});
   await this.access.notify(tx,'team_updated',id,t.id,null,[req.user.id,body.guideId || '']);return t;
  });
 }
}

@Controller('teams') @Roles('student','faculty')
export class TeamsController {
 constructor(private db:Database,private access:AcademicAccess) {}
 @Get('me') @Roles('student') async me(@Req() req:AuthRequest) {
  const enrollments=await this.db.query('SELECT id,class_id,register_number,name FROM roster_students WHERE user_id=$1',[req.user.id]);
  const memberships=await this.db.query(`SELECT m.team_id,m.status FROM team_members m JOIN roster_students s ON s.id=m.roster_id WHERE s.user_id=$1 AND m.status<>'left'`,[req.user.id]);
  const all=await this.access.teams(memberships.map(m=>m.team_id));
  return {classes:await this.db.query('SELECT id,department,section,graduation_year FROM project_classes ORDER BY graduation_year DESC,department,section'),enrollments,
   teams:all.filter(t=>memberships.some(m=>m.team_id===t.id && m.status==='accepted')),invitations:all.filter(t=>memberships.some(m=>m.team_id===t.id && m.status==='invited')),
   classmates:await this.db.query('SELECT id,class_id,register_number,name FROM roster_students WHERE class_id=ANY($1::uuid[]) ORDER BY register_number',[enrollments.map(s=>s.class_id)]),
   claims:await this.db.query('SELECT q.id,s.class_id,s.register_number,q.status FROM roster_claims q JOIN roster_students s ON s.id=q.roster_id WHERE q.user_id=$1 ORDER BY q.created_at DESC',[req.user.id])};
 }
 @Post() @Roles('student') async create(@Req() req:AuthRequest,@Body() body:CreateTeam) {
  return this.access.write(async tx=>{
   const [s]=await tx.query('SELECT s.*,c.advisor_id FROM roster_students s JOIN project_classes c ON c.id=s.class_id WHERE s.class_id=$1 AND s.user_id=$2 FOR UPDATE OF c,s',[body.classId,req.user.id]);
   if(!s)throw new ForbiddenException('Your advisor must verify your student profile first');
   if(!text(body.name)||!text(body.projectTitle))throw new BadRequestException('Team and project names are required');
   const [t]=await tx.query('INSERT INTO project_teams(class_id,name,project_title,lead_roster_id,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',[body.classId,text(body.name),text(body.projectTitle),s.id,req.user.id]);
   await tx.query("INSERT INTO team_members(team_id,roster_id,invited_by,status,joined_at) VALUES ($1,$2,$3,'accepted',now())",[t.id,s.id,req.user.id]);
   await this.access.audit(tx,req,s.class_id,t.id,'team_created',{pendingApproval:true});
   await this.access.notify(tx,'team_updated',s.class_id,t.id,req.user.id,[s.advisor_id,req.user.id]);return t;
  });
 }
 @Get(':id') async detail(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string) {
  const permitted=await this.access.teamFor(id,req);const [team]=await this.access.teams([id]);
  const commits=permitted.member?.status==='invited'?[]:await this.db.query(`SELECT c.id,c.sha,c.message,c.author,c.author_github_id,c.student_id,c.committed_at,c.status,r.full_name
   FROM commits c JOIN repositories r ON r.id=c.repository_id WHERE r.team_id=$1 ORDER BY c.committed_at DESC NULLS LAST LIMIT 100`,[id]);
  return {team,members:team.members,repository:team.repository || null,commits:commits.map(c=>({...c,url:`https://github.com/${c.full_name}/commit/${c.sha}`}))};
 }
 @Post(':id/settings') @Roles('faculty') async settings(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:TeamSettings) {
  return this.access.write(async tx=>{
   const t=await this.access.teamFor(id,req,tx,true);if(!t.is_advisor)throw new ForbiddenException('Only the class advisor can manage team assignments');
   await this.access.validateGuide(body.guideId,tx);
   if(body.leadRosterId && !(await tx.query("SELECT id FROM team_members WHERE team_id=$1 AND roster_id=$2 AND status IN ('invited','accepted')",[id,body.leadRosterId])).length)throw new BadRequestException('Select an existing team member as lead');
   if((body.name!==undefined&&!text(body.name))||(body.projectTitle!==undefined&&!text(body.projectTitle)))throw new BadRequestException('Names cannot be blank');
   await tx.query('UPDATE project_teams SET name=$2,project_title=$3,guide_id=$4,lead_roster_id=$5,approved=$6 WHERE id=$1',[id,body.name!==undefined?text(body.name):t.name,body.projectTitle!==undefined?text(body.projectTitle):t.project_title,body.guideId!==undefined?body.guideId:t.guide_id,body.leadRosterId || t.lead_roster_id,body.approved ?? t.approved]);
   await this.access.audit(tx,req,t.class_id,id,'team_settings_changed',{before:{guideId:t.guide_id,leadRosterId:t.lead_roster_id,approved:t.approved},after:body});
   const members=await tx.query("SELECT s.user_id FROM team_members m JOIN roster_students s ON s.id=m.roster_id WHERE m.team_id=$1 AND m.status<>'left' AND s.user_id IS NOT NULL",[id]);
   await this.access.notify(tx,body.approved===true?'team_approved':body.guideId!==undefined?'guide_assigned':'team_updated',t.class_id,id,null,[req.user.id,(body.guideId!==undefined?body.guideId:t.guide_id) || '',...members.map(s=>s.user_id)]);return {saved:true};
  });
 }
 @Post(':id/invitations') async invite(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body() body:Invite) {
  return this.access.write(async tx=>{
   const t=await this.access.teamFor(id,req,tx,true);if(!t.is_advisor&&!t.is_lead)throw new ForbiddenException('Only the advisor or accepted team lead can invite');
   const [s]=await tx.query('SELECT * FROM roster_students WHERE id=$1 AND class_id=$2',[body.rosterId,t.class_id]);
   if(!s)throw new BadRequestException('Choose a student from your class');
   await tx.query('INSERT INTO team_members(team_id,roster_id,invited_by) VALUES ($1,$2,$3)',[id,s.id,req.user.id]);
   await this.access.audit(tx,req,t.class_id,id,'team_invited',{rosterId:s.id});
   await this.access.notify(tx,'team_invited',t.class_id,id,s.user_id,[t.advisor_id,...(s.user_id?[s.user_id]:[])]);return {saved:true};
  });
 }
 @Post(':id/accept') @Roles('student') async accept(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string) {
  return this.access.write(async tx=>{
   const t=await this.access.teamFor(id,req,tx,true);if(!t.member)throw new NotFoundException('Invitation not found');
   if(t.member.status==='accepted')return {saved:true};
   await tx.query("UPDATE team_members SET status='accepted',joined_at=now() WHERE id=$1 AND status='invited'",[t.member.id]);
   await this.access.audit(tx,req,t.class_id,id,'team_joined',{rosterId:t.member.roster_id});
   const [lead]=await tx.query('SELECT user_id FROM roster_students WHERE id=$1',[t.lead_roster_id]);
   await this.access.notify(tx,'team_joined',t.class_id,id,null,[req.user.id,t.advisor_id,t.guide_id,...(lead?.user_id?[lead.user_id]:[])]);return {saved:true};
  });
 }
 @Post(':id/members/:rosterId/remove') async remove(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Param('rosterId',ParseUUIDPipe) rosterId:string) {
  return this.access.write(async tx=>{
   const t=await this.access.teamFor(id,req,tx,true);
   const selfInvite=t.member?.roster_id===rosterId && t.member.status==='invited';
   if(!t.is_advisor&&!selfInvite)throw new ForbiddenException('Ask the advisor to change accepted team membership');
   if(t.lead_roster_id===rosterId)throw new ConflictException('The advisor must assign another team lead before removing this member');
   const [m]=await tx.query("UPDATE team_members SET status='left',left_at=now() WHERE team_id=$1 AND roster_id=$2 AND status<>'left' RETURNING id",[id,rosterId]);
   if(!m)throw new NotFoundException('Active membership not found');
   const [s]=await tx.query('SELECT user_id FROM roster_students WHERE id=$1',[rosterId]);
   await this.access.audit(tx,req,t.class_id,id,'team_member_removed',{rosterId});
   await this.access.notify(tx,'team_member_removed',t.class_id,id,s?.user_id || null,[t.advisor_id,...(s?.user_id?[s.user_id]:[])]);return {saved:true};
  });
 }
}
