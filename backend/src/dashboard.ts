import { Body, Controller, Get, Post, Param, ParseUUIDPipe, Req, NotFoundException, ConflictException } from '@nestjs/common';
import { IsIn, IsString, MinLength, MaxLength } from 'class-validator';
import { Database } from './database';
import { AuthRequest, Roles } from './security';
import { AnalysisQueue } from './queue';
import { publicEvidence } from './evidence';
import { Llm } from './llm';

class OverrideDto {
  @IsIn(['legitimate','needs_review','note']) action!: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}
@Controller('student') @Roles('student')
export class StudentController {
  constructor(private db: Database) {}
  @Get('dashboard') async dashboard(@Req() req: AuthRequest) {
    const repos = await this.db.query('SELECT * FROM repositories WHERE student_id=$1 ORDER BY linked_at DESC',[req.user.id]);
    const commits = await this.db.query('SELECT c.*,r.full_name FROM commits c JOIN repositories r ON r.id=c.repository_id WHERE c.student_id=$1 ORDER BY c.committed_at DESC NULLS LAST LIMIT 50',[req.user.id]);
    const [stats] = await this.db.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE flagged)::int AS flagged FROM commits WHERE student_id=$1`,[req.user.id]);
    const [pending] = await this.db.query("SELECT count(*)::int AS count FROM quizzes WHERE student_id=$1 AND status<>'completed'",[req.user.id]);
    const assessment = commits.length ? publicEvidence(commits[0]) : {status:'Insufficient evidence',baseline:{status:'learning'}};
    return { authenticity_score:null,avg_score:null,authenticity_level:'Learning',evidence_status:assessment.status,baseline_status:assessment.baseline.status,
      total_commits:stats.total,pending_quizzes:pending.count,flagged_commits:stats.flagged,
      repository:repos.length ? {name:repos[0].full_name,url:repos[0].url,linked_at:repos[0].linked_at,is_linked:repos[0].active,
        webhook_received_at:repos[0].last_webhook_at} : {name:'No repository linked',url:'',linked_at:'',is_linked:false},
      repositories:repos.map(r=>({name:r.full_name,is_linked:r.active,webhook_received_at:r.last_webhook_at})),
      recent_commits:commits.map(c=>({url:`https://github.com/${c.full_name}/commit/${c.sha}`,sha:c.sha,message:c.message || 'Awaiting analysis',date:c.committed_at,
        lines_added:c.additions || 0,lines_deleted:c.deletions || 0,score:null,evidence_status:publicEvidence(c).status,
        status:c.status==='completed' ? c.flagged?(c.signals?.evidence?.version==='longitudinal-v2'?'review_requested':'legacy_review'):'normal':c.status,baseline:publicEvidence(c).baseline.status})) };
  }
}
@Controller('faculty') @Roles('faculty')
export class FacultyController {
  constructor(private db: Database,private queue: AnalysisQueue,private llm:Llm) {}
  @Get('provider-status') providerStatus() {return this.llm.quotaStatus;}
  @Get('students') async students() {
    const rows = await this.db.query(`SELECT u.id,u.name,u.github_login,
      (SELECT count(*)::int FROM repositories r WHERE r.student_id=u.id AND active) AS repositories,
      (SELECT count(*)::int FROM commits c WHERE c.student_id=u.id) AS commits,
      (SELECT max(committed_at) FROM commits c WHERE c.student_id=u.id) AS last_activity,
      (SELECT count(*)::int FROM quizzes q WHERE q.student_id=u.id AND q.status<>'completed') AS pending_discussions,
      (SELECT signals FROM commits c WHERE c.student_id=u.id ORDER BY committed_at DESC NULLS LAST LIMIT 1) AS signals,
      (SELECT count(*)::int FROM commits c WHERE c.student_id=u.id AND flagged) AS flagged
      FROM users u WHERE role='student' ORDER BY u.name`);
    return rows.map(r=>({...r,signals:undefined,authenticity_score:null,evidence_status:publicEvidence(r).status}));
  }
  @Get('students/:id') async student(@Param('id',ParseUUIDPipe) id: string) {
    const [student] = await this.db.query("SELECT id,name,github_login,email FROM users WHERE id=$1 AND role='student'",[id]);
    if (!student) throw new NotFoundException('Student not found');
    const repositories = await this.db.query('SELECT * FROM repositories WHERE student_id=$1',[id]);
    const commits = await this.db.query(`SELECT c.id,c.sha,c.message,c.committed_at,c.status,c.error,c.additions,c.deletions,c.changed_files,
      c.signals,c.flagged,c.reasons,c.quiz_status,c.velocity,c.stylometry->>'maturity' AS baseline,
      r.full_name FROM commits c JOIN repositories r ON r.id=c.repository_id WHERE c.student_id=$1 ORDER BY c.committed_at DESC NULLS LAST`,[id]);
    return {student,repositories,commits:commits.map(c=>({...c,signals:undefined,baseline:publicEvidence(c).baseline.status,evidence:publicEvidence(c)}))};
  }
  @Get('commits/:id') async evidence(@Param('id',ParseUUIDPipe) id: string) {
    const [commit] = await this.db.query('SELECT * FROM commits WHERE id=$1',[id]);
    if (!commit) throw new NotFoundException('Commit not found');
    const questions = await this.db.query(`SELECT q.*,r.answer_text,r.result,r.is_draft,r.grading_status,r.grading_error,r.submitted_at
      FROM questions q JOIN quizzes z ON z.id=q.quiz_id LEFT JOIN responses r ON r.question_id=q.id WHERE z.commit_id=$1 ORDER BY q.ordinal`,[id]);
    const overrides = await this.db.query('SELECT o.*,u.name AS faculty_name FROM overrides o JOIN users u ON u.id=o.faculty_id WHERE commit_id=$1 ORDER BY o.created_at DESC',[id]);
    const scoreHistory = await this.db.query('SELECT * FROM score_history WHERE commit_id=$1 ORDER BY created_at',[id]);
    return {commit:{...commit,risk_score:null,authenticity_score:null,evidence:publicEvidence(commit)},questions,overrides,scoreHistory};
  }
  @Post('commits/:id/override') async override(@Param('id',ParseUUIDPipe) id: string,@Req() req: AuthRequest,@Body() body: OverrideDto) {
    const [commit] = await this.db.query('SELECT risk_score,authenticity_score,signals,reasons,flagged FROM commits WHERE id=$1',[id]);
    if (!commit) throw new NotFoundException('Commit not found');
    if (body.reason.trim().length<10) throw new ConflictException('Provide a meaningful review reason');
    const questions = await this.db.query(`SELECT q.id,q.question_text,q.rubric,r.answer_text,r.result FROM questions q JOIN quizzes z ON z.id=q.quiz_id LEFT JOIN responses r ON r.question_id=q.id WHERE z.commit_id=$1`,[id]);
    commit.questions = questions;
    await this.db.query('INSERT INTO overrides(commit_id,faculty_id,action,reason,original_analysis) VALUES ($1,$2,$3,$4,$5)',[id,req.user.id,body.action,body.reason,JSON.stringify(commit)]);
    return {saved:true};
  }
  @Post('commits/:id/discussion') async discussion(@Param('id',ParseUUIDPipe) id: string,@Req() req: AuthRequest,@Body() body: OverrideDto) {
    const [commit] = await this.db.query('SELECT * FROM commits WHERE id=$1',[id]);
    if (!commit) throw new NotFoundException('Commit not found');
    if ((await this.db.query('SELECT id FROM quizzes WHERE commit_id=$1',[id])).length) throw new ConflictException('A technical discussion already exists for this commit');
    if (!commit.diff) throw new ConflictException('No source diff is available for technical questions');
    await this.override(id,req,{action:'note',reason:body.reason});
    await this.db.query(`UPDATE commits SET signals=jsonb_set(coalesce(signals,'{}'::jsonb),'{discussionRequested}', 'true'::jsonb),quiz_status='pending' WHERE id=$1`,[id]);
    await this.queue.enqueue('quiz',`quiz-${id}`,{repositoryId:commit.repository_id,commitId:id});
    return {queued:true};
  }
  @Post('commits/:id/retry') async retry(@Param('id',ParseUUIDPipe) id: string) {
    const [commit] = await this.db.query('SELECT * FROM commits WHERE id=$1',[id]);
    if (!commit) throw new NotFoundException('Commit not found');
    if (commit.quiz_status==='failed' || commit.quiz_status==='pending') {
      await this.queue.enqueue('quiz',`quiz-${id}`,{repositoryId:commit.repository_id,commitId:id});
    } else if (['failed','partial','queued'].includes(commit.status)) {
      const existing = await this.queue.queue.getJob(`commit-${id}`);
      if (existing && await existing.getState()==='completed') await existing.remove();
      await this.queue.enqueue('commit',`commit-${id}`,{repositoryId:commit.repository_id,sha:commit.sha});
    } else throw new ConflictException('No failed work is available to retry');
    return {queued:true};
  }
}
