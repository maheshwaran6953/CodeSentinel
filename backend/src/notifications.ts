import { Controller, Get, Req } from '@nestjs/common';
import { Database } from './database';
import { AuthRequest, Roles } from './security';

// Reconstruct reminders from persisted workflow facts, never from synthetic events.
// This is a bounded current activity inbox, not an exhaustive transition audit.
@Controller('notifications') @Roles('student','faculty')
export class NotificationsController {
  constructor(private db: Database) {}
  @Get() async list(@Req() req: AuthRequest) {
    const faculty=req.user.role==='faculty';
    const rows=await this.db.query(`WITH visible AS (
      SELECT c.*,r.full_name,u.name AS student_name FROM commits c
      JOIN repositories r ON r.id=c.repository_id JOIN users u ON u.id=c.student_id
      WHERE ($2::boolean OR c.student_id=$1)
      ORDER BY c.created_at DESC LIMIT 200
    ), events AS (
      SELECT 'commit:'||id AS id,student_id,id AS commit_id,full_name,student_name,
        'Commit received' AS title,created_at AS occurred_at,'history' AS destination FROM visible
      UNION ALL SELECT 'analysis:'||id||':'||status,student_id,id,full_name,student_name,
        'Analysis: '||status,coalesce(analyzed_at,created_at),'history' FROM visible WHERE status<>'queued'
      UNION ALL SELECT 'generation:'||id||':'||quiz_status,student_id,id,full_name,student_name,
        'Discussion generation: '||quiz_status,coalesce(analyzed_at,created_at),'history' FROM visible WHERE quiz_status IN ('pending','failed')
      UNION ALL SELECT 'quiz:'||z.id, c.student_id,c.id,c.full_name,c.student_name,
        CASE WHEN z.status='completed' THEN 'Discussion completed' ELSE 'Technical discussion awaiting answers' END,
        coalesce(z.completed_at,z.created_at),CASE WHEN z.status='completed' THEN 'history' ELSE 'quiz' END
        FROM quizzes z JOIN visible c ON c.id=z.commit_id
      UNION ALL SELECT 'answer:'||q.id||':'||r.grading_status,c.student_id,c.id,c.full_name,c.student_name,
        'Question '||(q.ordinal+1)||': '||r.grading_status,r.updated_at,'quiz'
        FROM responses r JOIN questions q ON q.id=r.question_id JOIN quizzes z ON z.id=q.quiz_id JOIN visible c ON c.id=z.commit_id WHERE NOT r.is_draft
      UNION ALL SELECT 'review:'||o.id,c.student_id,c.id,c.full_name,c.student_name,
        'Faculty review recorded',o.created_at,'history' FROM overrides o JOIN visible c ON c.id=o.commit_id
      UNION ALL SELECT 'repository:'||r.id||':'||r.active,r.student_id,NULL::uuid,r.full_name,u.name,
        CASE WHEN r.active THEN 'Repository authorized' ELSE 'Repository access needs attention' END,
        r.linked_at,'repository' FROM repositories r JOIN users u ON u.id=r.student_id WHERE ($2::boolean OR r.student_id=$1)
    ) SELECT * FROM events ORDER BY occurred_at DESC,id LIMIT 100`,[req.user.id,faculty]);
    return rows.map(r=>({id:r.id+(r.title==='Discussion completed'?':completed':''),title:r.title,
      context:faculty?`${r.student_name} · ${r.full_name}`:r.full_name,occurredAt:r.occurred_at,
      path:faculty?'/faculty/cohort':r.destination==='repository'?'/student/repository-linking':r.destination==='quiz'?'/student/quiz-interrogation':'/student/dashboard',
      commitId:faculty?r.commit_id:undefined,studentId:faculty?r.student_id:undefined}));
  }
}
