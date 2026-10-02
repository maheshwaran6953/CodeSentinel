import { Body, Controller, Get, Post, Param, ParseUUIDPipe, Query, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, IsISO8601 } from 'class-validator';
import { Database } from './database';
import { AuthRequest, Roles } from './security';

class InboxQuery {
  @IsOptional() @IsIn(['all','unread']) filter?: string;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
}
class ReadThroughDto { @IsISO8601() before!: string; }
const titles:Record<string,string>={roster_claimed:'Student account verification requested',roster_verified:'Student account verified',roster_rejected:'Account verification needs attention',team_invited:'Team invitation',team_joined:'Team invitation accepted',team_member_removed:'Team membership updated',team_approved:'Project team approved',guide_assigned:'Project guide assigned',team_updated:'Project team updated',repository_linked:'Repository linked',repository_restored:'Repository access restored',repository_access_removed:'Repository access removed',commit_received:'Commit received',analysis_completed:'Analysis completed',analysis_partial:'Analysis partially completed',analysis_failed:'Analysis needs attention',analysis_excluded:'Commit excluded from individual analysis',discussion_requested:'Technical discussion requested',discussion_generation_failed:'Question generation needs attention',discussion_context_unavailable:'Discussion context unavailable',discussion_ready:'Technical questions ready',discussion_completed:'Technical discussion completed',answer_submitted:'Answer submitted',grading_completed:'Answer grading completed',grading_failed:'Grading needs attention',faculty_review_recorded:'Faculty review recorded',student_reminder:'Reminder: technical discussion awaiting your response',faculty_reminder:'Reminder: completed discussion awaiting review'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
@Controller('notifications') @Roles('student','faculty')
export class NotificationsController {
  constructor(private db: Database) {}
  @Get('count') async count(@Req() req:AuthRequest) {const [row]=await this.db.query('SELECT count(*)::int AS unread FROM notification_recipients n JOIN notification_events e ON e.id=n.event_id WHERE n.user_id=$1 AND n.read_at IS NULL AND notification_visible(e.id,$1)',[req.user.id]);return {unreadCount:row.unread};}
  // Rolling-deployment compatibility for the previous frontend.
  @Get() async legacy(@Req() req:AuthRequest) {return (await this.list(req,{})).items;}
  @Get('inbox') async list(@Req() req:AuthRequest,@Query() query:InboxQuery={}) {
    let cursor:{at:string;id:string}|null=null;
    if(query.cursor) {
      try {cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));if(!cursor || !uuid.test(cursor.id) || !Number.isFinite(Date.parse(cursor.at)))throw Error();}
      catch {throw new BadRequestException('Invalid notification cursor');}
    }
    const unread=query.filter==='unread';
    const [counts]=await this.db.query(`SELECT count(*) FILTER(WHERE read_at IS NULL)::int AS unread,clock_timestamp() AS now FROM notification_recipients n JOIN notification_events e ON e.id=n.event_id WHERE n.user_id=$1 AND notification_visible(e.id,$1)`,[req.user.id]);
    const rows=await this.db.query(`SELECT e.*,n.read_at,r.full_name,u.name AS student_name,q.ordinal,cl.department,cl.section,cl.graduation_year,t.name AS team_name
      FROM notification_recipients n JOIN notification_events e ON e.id=n.event_id
      LEFT JOIN repositories r ON r.id=e.repository_id LEFT JOIN users u ON u.id=e.student_id
      LEFT JOIN project_classes cl ON cl.id=e.class_id LEFT JOIN project_teams t ON t.id=e.team_id
      LEFT JOIN questions q ON q.id=e.question_id
      WHERE n.user_id=$1 AND notification_visible(e.id,$1) AND (NOT $2::boolean OR n.read_at IS NULL)
      AND ($3::timestamptz IS NULL OR (e.created_at,e.id)<($3::timestamptz,$4::uuid))
      ORDER BY e.created_at DESC,e.id DESC LIMIT 31`,[req.user.id,unread,cursor?.at || null,cursor?.id || null]);
    const page=rows.slice(0,30),last=page[page.length-1],faculty=req.user.role==='faculty';
    return {unreadCount:counts.unread,asOf:new Date(counts.now).toISOString(),nextCursor:rows.length>30?Buffer.from(JSON.stringify({at:new Date(last.created_at).toISOString(),id:last.id})).toString('base64url'):null,
      items:page.map(r=>({id:r.id,kind:r.kind,title:(titles[r.kind] || 'Project update')+(r.ordinal!=null?` (question ${r.ordinal+1})`:''),context:faculty?`${r.student_name} · ${r.full_name}`:r.full_name,
        occurredAt:r.created_at,readAt:r.read_at,path:!r.repository_id?(faculty?'/faculty/classes':'/student/team'):faculty?'/faculty/cohort':r.quiz_id?'/student/quiz-interrogation':r.commit_id?'/student/dashboard':'/student/repository-linking',
        classId:r.repository_id?undefined:r.class_id,teamId:r.repository_id?undefined:r.team_id,commitId:r.commit_id,quizId:r.quiz_id,questionId:r.question_id,studentId:faculty?r.student_id:undefined}))};
  }
  @Post('read-all') async readAll(@Req() req:AuthRequest,@Body() body:ReadThroughDto) {
    await this.db.query(`UPDATE notification_recipients n SET read_at=clock_timestamp() FROM notification_events e
      WHERE e.id=n.event_id AND n.user_id=$1 AND n.read_at IS NULL AND e.created_at<=$2::timestamptz AND notification_visible(e.id,$1)`,[req.user.id,body.before]);
    return {saved:true};
  }
  @Post(':id/read') async read(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string) {
    const rows=await this.db.query('UPDATE notification_recipients n SET read_at=coalesce(n.read_at,clock_timestamp()) FROM notification_events e WHERE n.event_id=e.id AND n.user_id=$1 AND n.event_id=$2 AND notification_visible(e.id,$1) RETURNING n.read_at',[req.user.id,id]);
    if(!rows.length)throw new NotFoundException('Notification not found');return {readAt:rows[0].read_at};
  }
}

export async function sendReminders(db:Database,delayHours:number,intervalHours:number) {
  return db.source.transaction(async tx=>{
    // Serialize overlapping scheduler deliveries. Row locks serialize completion/review races.
    await tx.query('SELECT pg_advisory_xact_lock(783242)');
    const rows=await tx.query(`SELECT z.*,c.repository_id FROM quizzes z JOIN commits c ON c.id=z.commit_id
      WHERE (z.status<>'completed' AND z.created_at<now()-($1::int*interval '1 hour'))
      OR (z.status='completed' AND z.completed_at<now()-($1::int*interval '1 hour'))
      ORDER BY z.id FOR UPDATE OF z`,[delayHours]);
    for(const z of rows) {
      const completed=z.status==='completed';
      if(completed && (await tx.query('SELECT id FROM overrides WHERE commit_id=$1 AND created_at>=$2 LIMIT 1',[z.commit_id,z.completed_at])).length)continue;
      const kind=completed?'faculty_reminder':'student_reminder';
      await tx.query(`SELECT emit_notification($1||':'||floor(extract(epoch FROM now())/($2::int*3600))::text,$3,$4,$5,$6,NULL,NULL,$7)
        WHERE NOT EXISTS (SELECT 1 FROM notification_events WHERE quiz_id=$6 AND kind=$3 AND created_at>now()-($2::int*interval '1 hour'))`,
        [z.id+':'+kind,intervalHours,kind,z.repository_id,z.commit_id,z.id,completed?'faculty':'student']);
    }
  });
}
