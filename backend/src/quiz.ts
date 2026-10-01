import { Body, Controller, Get, Post, Param, ParseUUIDPipe, Query, Req, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Database } from './database';
import { AuthRequest, Roles } from './security';
import { Llm } from './llm';
import { publicEvidence } from './evidence';

function publicGrade(result: any) {
  if (!result) return result;
  const {audit, ...grade} = result;
  return grade;
}
class AnswerDto { @IsString() @MaxLength(1000) answerText!: string; }
@Controller('quizzes') @Roles('student')
export class QuizController {
  constructor(private db: Database, private llm: Llm) {}
  @Get('active') async active(@Req() req: AuthRequest,@Query('quiz') quizId?:string) {
    if(quizId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(quizId))throw new BadRequestException('Invalid discussion ID');
    const [quiz] = await this.db.query(`SELECT q.*,c.sha,c.message,c.committed_at,r.full_name FROM quizzes q JOIN commits c ON c.id=q.commit_id
      JOIN repositories r ON r.id=c.repository_id WHERE q.student_id=$1 AND (($2::uuid IS NULL AND q.status<>'completed') OR q.id=$2::uuid) ORDER BY q.created_at LIMIT 1`,[req.user.id,quizId || null]);
    if (!quiz) {if(quizId)throw new NotFoundException('Discussion not found');return null;}
    const questions = await this.db.query('SELECT id,question_text,code_snippet FROM questions WHERE quiz_id=$1 ORDER BY ordinal',[quiz.id]);
    const answers = await this.db.query(`SELECT r.* FROM responses r JOIN questions q ON q.id=r.question_id WHERE q.quiz_id=$1 AND r.student_id=$2`,[quiz.id,req.user.id]);
    const answerMap = Object.fromEntries(answers.map(a => [a.question_id,{ questionId:a.question_id,answerText:a.answer_text,result:publicGrade(a.result),submittedAt:a.submitted_at,isDraft:a.is_draft,gradingStatus:a.grading_status,gradingError:a.grading_error,gradingRetryAt:a.grading_retry_at }]));
    return { id:quiz.id,title:'Integrity Quiz Interrogation',totalQuestions:questions.length,
      currentQuestionIndex: Math.max(0,questions.findIndex(q=>!answerMap[q.id]?.result)),status:quiz.status==='completed'?'completed':'in_progress',answers:answerMap,
      questions:questions.map(q=>({id:q.id,questionText:q.question_text,codeSnippet:q.code_snippet,commitSha:quiz.sha,
        commitMessage:quiz.message,commitRepo:quiz.full_name,commitTimeAgo:quiz.committed_at,minCharCount:20,maxCharCount:1000})) };
  }
  private async question(id: string, userId: string) {
    const [question] = await this.db.query(`SELECT q.*,z.commit_id,c.diff FROM questions q JOIN quizzes z ON z.id=q.quiz_id
      JOIN commits c ON c.id=z.commit_id WHERE q.id=$1 AND z.student_id=$2`,[id,userId]);
    if (!question) throw new NotFoundException('Question unavailable'); return question;
  }
  @Post('questions/:id/draft') async draft(@Param('id',ParseUUIDPipe) id: string,@Req() req: AuthRequest,@Body() body: AnswerDto) {
    await this.question(id,req.user.id);
    const saved = await this.db.query(`INSERT INTO responses(question_id,student_id,answer_text) VALUES ($1,$2,$3)
      ON CONFLICT(question_id) DO UPDATE SET answer_text=excluded.answer_text,updated_at=now()
      WHERE responses.is_draft=true RETURNING question_id`,[id,req.user.id,body.answerText]);
    if (!saved.length) throw new ConflictException('Submitted answers cannot be edited; retry grades the saved response');
    return true;
  }
  @Post('questions/:id/answer') async answer(@Param('id',ParseUUIDPipe) id: string,@Req() req: AuthRequest,@Body() body: AnswerDto) {
    const question = await this.question(id,req.user.id);
    if (body.answerText.trim().length<20) throw new ConflictException('Please provide at least 20 characters of technical explanation');
    const [existing] = await this.db.query('SELECT * FROM responses WHERE question_id=$1',[id]);
    if (existing && !existing.is_draft && existing.answer_text !== body.answerText) throw new ConflictException('A different answer was already submitted. Reload to view the exact saved response before retrying.');
    if (existing?.result) return { ...publicGrade(existing.result), submittedAnswer: existing.answer_text };
    const claim = await this.db.query(`INSERT INTO responses(question_id,student_id,answer_text,is_draft,grading_status,submitted_at,grading_attempts)
      VALUES ($1,$2,$3,false,'grading',now(),1) ON CONFLICT(question_id) DO UPDATE SET
      answer_text=CASE WHEN responses.is_draft THEN excluded.answer_text ELSE responses.answer_text END,
      is_draft=false,grading_status='grading',grading_error=null,grading_retry_at=null,grading_attempts=CASE WHEN responses.grading_status='failed' THEN 1 ELSE responses.grading_attempts+1 END,submitted_at=coalesce(responses.submitted_at,now()),updated_at=now()
      WHERE responses.result IS NULL AND (responses.is_draft OR responses.answer_text=excluded.answer_text) AND (responses.grading_status<>'grading' OR responses.updated_at<now()-interval '2 minutes') RETURNING answer_text,grading_attempts`,
    [id,req.user.id,body.answerText]);
    if (!claim.length) throw new ConflictException('This answer is being graded; retry shortly');
    try {
      const result = await this.llm.grade(question,claim[0].answer_text);
      await this.db.source.transaction(async tx => {
        // Serialize quiz completion across submissions to different questions.
        await tx.query('SELECT id FROM quizzes WHERE id=$1 FOR UPDATE',[question.quiz_id]);
        await tx.query("UPDATE responses SET result=$2,grading_status='graded',grading_retry_at=null,grading_error=null,updated_at=now() WHERE question_id=$1",[id,JSON.stringify(result)]);
        const grades = await tx.query('SELECT r.result FROM questions q LEFT JOIN responses r ON r.question_id=q.id WHERE q.quiz_id=$1',[question.quiz_id]);
        if (grades.every((g: any)=>g.result)) {
          const avg = grades.reduce((sum: number,g: any)=>sum+g.result.score,0)/grades.length;
          const [commit] = await tx.query('SELECT * FROM commits WHERE id=$1 FOR UPDATE',[question.commit_id]);
          const technicalUnderstanding = {status:'llm_assessed',rubricPoints:avg,interpretation:'Supporting LLM assessment, not ground truth; faculty review required'};
          const score = {...commit.signals,riskScore:null,authenticityScore:null,version:'2.0',
            evidence:{...publicEvidence(commit),technicalUnderstanding}};
          await tx.query("UPDATE quizzes SET status='completed',completed_at=now() WHERE id=$1",[question.quiz_id]);
          await tx.query('UPDATE commits SET risk_score=$2,authenticity_score=$3,signals=$4 WHERE id=$1',[commit.id,score.riskScore,score.authenticityScore,JSON.stringify(score)]);
          await tx.query('INSERT INTO score_history(commit_id,risk_score,authenticity_score,signals,cause) VALUES ($1,$2,$3,$4,$5)',[commit.id,score.riskScore,score.authenticityScore,JSON.stringify(score),'quiz_completed']);
        }
      });
      return { ...publicGrade(result), submittedAnswer: claim[0].answer_text };
    } catch (error) {
      const retry=(error as any)?.retryable && ((error as any)?.capacityDeferred || claim[0].grading_attempts<5);
      const retryAt=retry?new Date(Math.max(Date.now()+30000,(error as any).retryAt || 0)):null;
      const audit = (error as any)?.providerAudit;
      if (audit) await this.db.query(`UPDATE commits SET signals=jsonb_set(coalesce(signals,'{}'::jsonb),'{gradingAttempts}',coalesce(signals->'gradingAttempts','[]'::jsonb) || $2::jsonb) WHERE id=$1`,
        [question.commit_id,JSON.stringify([{questionId:id,submittedAnswer:claim[0].answer_text,rubric:question.rubric,question:question.question_text,status:'failed',...audit}])]);
      await this.db.query("UPDATE responses SET grading_status=$2,grading_error=$3,grading_retry_at=$4,grading_attempts=greatest(0,grading_attempts-$5),updated_at=now() WHERE question_id=$1 AND result IS NULL",
        [id,retry?'pending':'failed',retry?'Waiting for API capacity or provider recovery. Saved answer will retry automatically.':'Automatic grading stopped or unavailable. Original answer saved; retry manually.',retryAt,(error as any)?.capacityDeferred?1:0]);
      throw error;
    }
  }
}
