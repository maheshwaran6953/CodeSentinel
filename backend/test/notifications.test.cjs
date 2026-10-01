require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {NotificationsController,sendReminders}=require('../dist/notifications');
const {QuizController}=require('../dist/quiz');
const {workflow}=require('./workflow.cjs');
async function setup(run) {
 const pg=new PGlite({extensions:{pgcrypto}});
 try {
  for(const f of ['001_initial.sql','002_durable_notifications.sql','003_groq_capacity.sql'])await pg.exec(readFileSync('migrations/'+f,'utf8'));
  const adapter=x=>({query:async(sql,args=[]) => (await x.query(sql,args)).rows});
  const db={...adapter(pg),source:{transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))}};
  const [a,b,f]=await db.query("INSERT INTO users(name,role) VALUES ('A','student'),('B','student'),('F','faculty') RETURNING *");
  const [r]=await db.query("INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url) VALUES ('1',$1,'1','owner','repo','owner/repo','main','https://github.com/owner/repo') RETURNING *",[a.id]);
  const [c]=await db.query("INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,$2,$3) RETURNING *",[r.id,a.id,'a'.repeat(40)]);
  await run({db,pg,a,b,f,r,c,api:new NotificationsController(db)});
 }finally{await pg.close();}
}
test('durable notifications are transactional, isolated, deduplicated and server-read across instances',async()=>setup(async({db,pg,a,b,f,c,api})=>{
 assert.equal((await api.list({user:a},{})).unreadCount,2);
 assert.equal((await api.list({user:b},{})).items.length,0);
 const first=(await api.list({user:a},{})).items[0];
 await assert.rejects(api.read({user:b},first.id),e=>e.getStatus()===404);
 await api.read({user:a},first.id);await api.read({user:a},first.id);
 assert.equal((await new NotificationsController(db).list({user:a},{filter:'unread'})).items.length,1);
 assert.equal((await api.list({user:f},{})).unreadCount,2,'faculty read state is independent');
 await assert.rejects(db.source.transaction(async tx=>{await tx.query("UPDATE commits SET status='completed' WHERE id=$1",[c.id]);throw Error('rollback');}));
 assert.equal((await api.list({user:a},{})).items.length,2,'rolled-back business write emits nothing');
 await db.query("UPDATE commits SET status='completed' WHERE id=$1",[c.id]);await db.query("UPDATE commits SET status='completed' WHERE id=$1",[c.id]);
 assert.equal((await api.list({user:a},{})).items.length,3,'same state/redelivery does not emit twice');
 const [rls]=await db.query("SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('notification_events','notification_recipients') AND relrowsecurity");assert.equal(rls.n,2);
}));
test('cursor paging is stable at equal timestamps; bulk-read excludes newer events',async()=>setup(async({db,a,r,api})=>{
 for(let n=0;n<35;n++)await db.query('SELECT emit_notification($1,$2,$3)',['page'+n,'commit_received',r.id]);
 const first=await api.list({user:a},{});assert.equal(first.items.length,30);assert.ok(first.nextCursor);
 const second=await api.list({user:a},{cursor:first.nextCursor});assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,37);
 await assert.rejects(api.list({user:a},{cursor:'broken'}),e=>e.getStatus()===400);
 await db.query("SELECT pg_sleep(0.02)");await db.query("SELECT emit_notification('new-arrival','commit_received',$1)",[r.id]);
 await api.readAll({user:a},{before:first.asOf});assert.equal((await api.list({user:a},{filter:'unread'})).items.length,1);
}));
test('reminders deduplicate, stop after completion/review and deep links enforce ownership',async()=>setup(async({db,a,b,f,c,api})=>{
 const [z]=await db.query("INSERT INTO quizzes(commit_id,student_id,trigger_reason,model,created_at) VALUES ($1,$2,'[]','test-only',now()-interval '5 days') RETURNING *",[c.id,a.id]);
 await db.query("INSERT INTO questions(quiz_id,ordinal,question_text,rubric) VALUES ($1,0,'Explain this code path','Test-only rubric')",[z.id]);
 await sendReminders(db,48,24);await sendReminders(db,48,24);
 assert.equal((await api.list({user:a},{})).items.filter(n=>n.kind==='student_reminder').length,1);
 assert.equal((await api.list({user:f},{})).items.filter(n=>n.kind==='student_reminder').length,0);
 const quiz=new QuizController(db,{});assert.equal((await quiz.active({user:a},z.id)).id,z.id);await assert.rejects(quiz.active({user:b},z.id),e=>e.getStatus()===404);
 await db.query("UPDATE quizzes SET status='completed',completed_at=now()-interval '3 days' WHERE id=$1",[z.id]);
 assert.equal((await quiz.active({user:a},z.id)).status,'completed');
 await sendReminders(db,48,24);assert.equal((await api.list({user:f},{})).items.filter(n=>n.kind==='faculty_reminder').length,1);
 await db.query("INSERT INTO overrides(commit_id,faculty_id,action,reason,original_analysis) VALUES ($1,$2,'note','Test review','{}')",[c.id,f.id]);
 await db.query("UPDATE notification_events SET created_at=now()-interval '2 days' WHERE kind IN ('faculty_reminder','student_reminder')");
 await sendReminders(db,48,24);
 const [n]=await db.query("SELECT count(*)::int AS n FROM notification_events WHERE kind IN ('faculty_reminder','student_reminder')");assert.equal(n.n,2);
}));
test('the existing real-AST workflow remains functional with transactional notification triggers',{timeout:240000},async()=>setup(async({db})=>{await workflow(db);}));

test('saved answers retry in the existing worker after capacity returns without changing the submission',async()=>setup(async({db,a,c})=>{
 const [z]=await db.query("INSERT INTO quizzes(commit_id,student_id,trigger_reason,model) VALUES ($1,$2,'[]','test-only') RETURNING *",[c.id,a.id]);
 const [q]=await db.query("INSERT INTO questions(quiz_id,ordinal,question_text,rubric) VALUES ($1,0,'Explain the code path','Test-only rubric') RETURNING *",[z.id]);
 let available=false,calls=0;
 const llm={grade:async()=>{calls++;if(!available){const e=new Error('Capacity');Object.assign(e,{retryable:true,retryAt:Date.now()+60000});throw e;}return {score:75,explanation:'Test-only grading transport',audit:{testOnly:true}};}};
 const api=new QuizController(db,llm),answer={answerText:'The exact submitted technical explanation.'};
 await assert.rejects(api.answer(q.id,{user:a},answer));
 const [saved]=await db.query('SELECT * FROM responses WHERE question_id=$1',[q.id]);
 assert.equal(saved.grading_status,'pending');assert.equal(saved.answer_text,answer.answerText);assert.ok(saved.grading_retry_at);
 await assert.rejects(api.answer(q.id,{user:a},{answerText:'A different answer must never replace saved work.'}));
 // Time travel is confined to this isolated automated test database.
 await db.query("UPDATE responses SET grading_retry_at=now()-interval '1 minute' WHERE question_id=$1",[q.id]);
 available=true;const {Analysis}=require('../dist/analysis');await new Analysis(db,{}, {},{},llm).recoverLlm();
 const [done]=await db.query('SELECT * FROM responses WHERE question_id=$1',[q.id]);assert.equal(done.grading_status,'graded');assert.equal(done.answer_text,answer.answerText);assert.equal(calls,2);
 await new Analysis(db,{}, {},{},llm).recoverLlm();assert.equal(calls,2);
}));
