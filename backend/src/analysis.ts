import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { Database } from './database';
import { GitHub } from './github';
import { AnalysisQueue, createWorker } from './queue';
import { Stylometry, excluded, supported } from './stylometry';
import { combine, velocity, Metrics } from './scoring';
import { Llm } from './llm';
import { ancestorHistory, evidenceSummary } from './evidence';

@Injectable()
export class Analysis implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  constructor(private db: Database, private github: GitHub, private queue: AnalysisQueue,
    private ast: Stylometry, private llm: Llm) {}
  onModuleInit() { if (process.env.RUN_WORKER !== 'false') this.worker = createWorker(job => this.process(job)); }
  async onModuleDestroy() { await this.worker?.close(); }
  async process(job: Job) {
    const [repo] = await this.db.query('SELECT r.*,u.github_id AS student_github_id FROM repositories r JOIN users u ON u.id=r.student_id WHERE r.id=$1 AND r.active=true', [job.data.repositoryId]);
    if (!repo) return;
    if (job.name === 'quiz') return this.generateQuiz(job.data.commitId);
    const token = await this.github.installationToken(repo.installation_id);
    if (job.name === 'commit') return this.commit(repo, job.data.sha, token);
    let commits: any[];
    if (job.name === 'pull_request') {
      commits = await this.github.pages(`/repos/${repo.full_name}/pulls/${job.data.number}/commits`,token);
    } else if (job.name === 'push' && !/^0+$/.test(job.data.before)) {
      commits = await this.github.pages(`/repos/${repo.full_name}/compare/${job.data.before}...${job.data.after}`,token,'commits');
    } else {
      // Bounded initial backfill; subsequent pushes continuously extend each student's baseline.
      commits = await this.github.api(`/repos/${repo.full_name}/commits?sha=${encodeURIComponent(job.data.after || repo.default_branch)}&per_page=50`,token);
      commits.reverse();
    }
    for (const [index, commit] of commits.entries()) {
      const [saved] = await this.db.query(`INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,$2,$3)
        ON CONFLICT(repository_id,sha) DO UPDATE SET sha=excluded.sha RETURNING id,status`, [repo.id,repo.student_id,commit.sha]);
      if (saved.status === 'excluded') continue;
      if (saved.status !== 'completed') await this.db.query(`UPDATE commits SET signals=coalesce(signals,'{}'::jsonb) || $2::jsonb WHERE id=$1`,
        [saved.id,JSON.stringify({developmentEvent:{kind:job.name,before:job.data.before || null,after:job.data.after || null,index:index+1,commitCount:commits.length}})]);
      // Discovery runs inside BullMQ. Await each commit so retry/backoff cannot reorder a push.
      // A failed event resumes completed commits idempotently before continuing its sequence.
      await this.commit(repo,commit.sha,token);
    }
  }
  async source(repo: any, path: string, sha: string, token: string): Promise<string> {
    const data = await this.github.api(`/repos/${repo.full_name}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`,token);
    if (data.type !== 'file' || data.encoding !== 'base64' || data.size>300000) throw new Error('Source unavailable or too large');
    return Buffer.from(data.content,'base64').toString('utf8');
  }
  async commit(repo: any, sha: string, token: string) {
    const [record] = await this.db.query('SELECT * FROM commits WHERE repository_id=$1 AND sha=$2',[repo.id,sha]);
    if (['completed','excluded'].includes(record.status)) {
      if (record.quiz_status === 'pending' || record.quiz_status === 'failed') await this.generateQuiz(record.id);
      return;
    }
    await this.db.query("UPDATE commits SET status='processing',error=null WHERE id=$1",[record.id]);
    try {
      const data = await this.github.api(`/repos/${repo.full_name}/commits/${sha}?per_page=100`,token);
      const files = [...(data.files || [])];
      for (let page=2; files.length && files.length%100===0 && files.length<3000; page++) {
        const extra = await this.github.api(`/repos/${repo.full_name}/commits/${sha}?per_page=100&page=${page}`,token);
        if (!extra.files?.length) break;
        files.push(...extra.files);
      }
      const waitingParents = await this.db.query(`SELECT sha FROM commits WHERE repository_id=$1 AND sha=ANY($2::text[]) AND status NOT IN ('completed','partial','excluded')`,[repo.id,(data.parents || []).map((p: any)=>p.sha).filter(Boolean)]);
      if (waitingParents.length) throw new Error('Earlier commit analysis must complete first');
      const authorId = data.author?.id ? String(data.author.id) : null;
      const authored = authorId === repo.student_github_id;
      const merge = data.parents?.length>1 || /Co-authored-by:/i.test(data.commit.message);
      const committedAt = new Date(data.commit.committer.date);
      await this.db.query(`UPDATE commits SET author=$2,author_github_id=$3,message=$4,committed_at=$5,
        additions=$6,deletions=$7,changed_files=$8,signals=coalesce(signals,'{}'::jsonb) || $9::jsonb WHERE id=$1`,[record.id,data.commit.author.name,authorId,data.commit.message,committedAt,data.stats.additions,data.stats.deletions,files.length,JSON.stringify({developmentEvent:{...record.signals?.developmentEvent,parents:(data.parents || []).map((p: any)=>p.sha)}})]);
      if (!authored || merge) {
        await this.db.query("UPDATE commits SET status='excluded',reasons=$2,analyzed_at=now() WHERE id=$1",[record.id,JSON.stringify([!authored ? 'Commit author does not match the linked student GitHub identity' : 'Merge or co-authored commit: excluded from individual authorship assessment'])]);
        return;
      }
      let gitignore = '';
      try { gitignore = await this.source(repo,'.gitignore',sha,token); } catch { /* A repository need not have .gitignore. */ }
      const eligible = files.filter(f => !excluded(f.filename,'',gitignore));
      const sources: {path: string; source: string}[] = [];
      const notes: string[] = [];
      const evidence: any[] = [];
      let diff = '';
      for (const file of files) {
        let skip = !eligible.includes(file);
        let content = '';
        if (!skip && supported(file.filename) && file.status !== 'removed' && sources.length<60) {
          try {
            content = await this.source(repo,file.filename,sha,token);
            skip = excluded(file.filename,content,gitignore);
            if (!skip) sources.push({ path: file.filename, source: content });
          } catch { notes.push(`Source not parsed: ${file.filename} (unavailable, oversized, or API restriction)`); }
        }
        if (!skip && supported(file.filename) && file.patch && diff.length<24000) diff += `\nFile: ${file.filename}\n${file.patch}\n`;
        evidence.push({ path: file.filename, additions: file.additions, deletions: file.deletions, status: file.status,
          exclusionReason:skip ? 'Generated, ignored, vendor or sensitive file classifier' : null,previousPath:file.previous_filename || null,excluded: skip, supported: supported(file.filename), patchAvailable: !!file.patch });
      }
      if (sources.length>=60) notes.push('AST analysis limited to 60 changed source files');
      if (files.length>=3000) notes.push('GitHub commit file listing reached the 3000-file API limit');
      const own = await this.db.query(`SELECT committed_at,velocity FROM commits WHERE student_id=$1 AND committed_at<$2
        AND status IN ('completed','partial') AND velocity IS NOT NULL ORDER BY committed_at DESC LIMIT 30`,[repo.student_id,committedAt]);
      const measured = evidence.filter(f=>!f.excluded && f.supported);
      if (!measured.length) {
        await this.db.query("UPDATE commits SET status='excluded',files=$2,reasons=$3,analyzed_at=now() WHERE id=$1",
          [record.id,JSON.stringify(evidence),JSON.stringify(['No supported authored source changes; ignored/generated/vendor and unsupported files do not enter source velocity or stylometry'])]);
        return;
      }
      const metrics: Metrics = { additions: measured.reduce((n,f)=>n+f.additions,0), deletions: measured.reduce((n,f)=>n+f.deletions,0),
        files: measured.length, gapHours: own.length ? (committedAt.getTime()-new Date(own[0].committed_at).getTime())/3600000 : null };
      const speed = velocity(metrics,own.map(h=>h.velocity.metrics),Number(process.env.VELOCITY_Z_THRESHOLD || 3));
      const candidates = await this.db.query(`SELECT student_id,repository_id,sha,status,committed_at,features,stylometry,files,velocity,signals->'developmentEvent'->'parents' AS parents
        FROM commits WHERE repository_id=$1 AND student_id=$2 AND id<>$3
        AND status IN ('completed','partial','excluded')
        ORDER BY analyzed_at DESC LIMIT 100`,[repo.id,repo.student_id,record.id]);
      const history = ancestorHistory(candidates,data.parents?.length===1 ? data.parents[0].sha : undefined);
      const astHistory = history.map(h=>({...h,artifacts:h.stylometry?.files || []}));
      let style: any;
      try { style = await this.ast.analyze({ studentId: repo.student_id,files: sources,history:astHistory }); }
      catch { style = { risk: null, flagged: false, maturity: 'unavailable', error: 'AST/ML unavailable; faculty may retry analysis', features: {} }; notes.push(style.error); }
      if (style.files?.some((f: any)=>f.symbolLimitReached)) notes.push('Function/class extraction limit reached; granular coverage is incomplete');
      if (style.files?.some((f: any)=>f.status==='parse_error')) notes.push('Some changed source files contain tree-sitter parse errors');

      const [completedQuiz] = await this.db.query(`SELECT avg((r.result->>'score')::double precision) AS score
        FROM quizzes z JOIN questions q ON q.quiz_id=z.id JOIN responses r ON r.question_id=q.id
        WHERE z.commit_id=$1 AND z.status='completed'`,[record.id]);
      const score = combine(speed.risk,style.risk,completedQuiz?.score ?? null);
      const assessment = evidenceSummary(astHistory,style,speed,evidence,(data.parents || []).map((p: any)=>p.sha),completedQuiz?.score ?? null,notes);
      style.maturity = assessment.baseline.status;
      const reasons = assessment.reasons;
      const flagged = assessment.reviewRequested;
      const envelope = {...record.signals,...score,riskScore:null,authenticityScore:null,version:'2.0',
        interpretation:'Raw legacy signal transforms are internal diagnostics, not authorship probabilities',
        developmentEvent:{...record.signals?.developmentEvent,parents:(data.parents || []).map((p: any)=>p.sha)},evidence:assessment};
      const hasQuiz = (await this.db.query('SELECT id FROM quizzes WHERE commit_id=$1',[record.id])).length>0;
      const quizStatus = hasQuiz ? 'generated' : flagged ? (diff.trim() ? 'pending' : 'no_diff') : 'not_required';
      await this.db.source.transaction(async tx => {
        await tx.query(`UPDATE commits SET status=$2,files=$3,diff=$4,velocity=$5,stylometry=$6,features=$7,signals=$8,
          risk_score=$9,authenticity_score=$10,flagged=$11,reasons=$12,quiz_status=$13,analyzed_at=now(),error=$14 WHERE id=$1`,
        [record.id,style.error || notes.some(n=>n.startsWith('Source not parsed') || n.includes('parse errors')) ? 'partial' : 'completed',JSON.stringify(evidence),diff.slice(0,24000),JSON.stringify(speed),JSON.stringify({...style,notes}),JSON.stringify(style.features),JSON.stringify(envelope),null,null,flagged,JSON.stringify(reasons),quizStatus,notes.length ? notes.join('; ') : null]);
        await tx.query('INSERT INTO score_history(commit_id,risk_score,authenticity_score,signals,cause) VALUES ($1,$2,$3,$4,$5)',[record.id,null,null,JSON.stringify(envelope),'analysis']);
      });
      if (quizStatus === 'pending') await this.generateQuiz(record.id);
    } catch (error) {
      await this.db.query("UPDATE commits SET status='failed',error=$2 WHERE id=$1",[record.id,'Analysis failed; check GitHub access, database connectivity and worker configuration. Retry is available.']);
      throw new Error('Commit analysis failed');
    }
  }
  async generateQuiz(commitId: string) {
    const [commit] = await this.db.query('SELECT * FROM commits WHERE id=$1',[commitId]);
    if (!commit || (!commit.flagged && !commit.signals?.discussionRequested) || !commit.diff) return;
    if ((await this.db.query('SELECT id FROM quizzes WHERE commit_id=$1',[commitId])).length) return;
    try {
      const questions = await this.llm.questions(commit);
      await this.db.source.transaction(async tx => {
        const [quiz] = await tx.query(`INSERT INTO quizzes(commit_id,student_id,trigger_reason,model) VALUES ($1,$2,$3,$4)
          ON CONFLICT(commit_id) DO NOTHING RETURNING id`,[commit.id,commit.student_id,JSON.stringify(commit.reasons),this.llm.model]);
        if (quiz) await tx.query(`UPDATE commits SET signals=jsonb_set(coalesce(signals,'{}'::jsonb),'{questionGeneration}', $2::jsonb) WHERE id=$1`,[commit.id,JSON.stringify(questions[0]?.providerResponse || {status:'provider_audit_unavailable'})]);
        if (quiz) for (const [i,q] of questions.entries()) await tx.query('INSERT INTO questions(quiz_id,ordinal,question_text,rubric,code_snippet) VALUES ($1,$2,$3,$4,$5)',[quiz.id,i,q.questionText,q.rubric,commit.diff.slice(0,6000)]);
        await tx.query("UPDATE commits SET quiz_status='generated' WHERE id=$1",[commit.id]);
      });
    } catch {
      await this.db.query("UPDATE commits SET quiz_status='failed' WHERE id=$1",[commit.id]);
      throw new Error('Quiz generation failed; retry from faculty dashboard');
    }
  }
}
