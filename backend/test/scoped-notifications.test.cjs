process.env.DOTENV_CONFIG_PATH=require('node:path').join(__dirname,'nonexistent-test-environment');
require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,readdirSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {NotificationsController}=require('../dist/notifications');

async function setup(run) {
 const pg=new PGlite({extensions:{pgcrypto}});
 try {
  for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync('migrations/'+f,'utf8'));
  const adapter=client=>({query:async(sql,args=[]) => (await client.query(sql,args)).rows});
  const db={...adapter(pg),source:{transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))}};
  const [lead,member,advisor,guide,other]=await db.query("INSERT INTO users(name,role) VALUES ('Lead','student'),('Member','student'),('Advisor','faculty'),('Guide','faculty'),('Other guide','faculty') RETURNING *");
  const [cl]=await db.query("INSERT INTO project_classes(advisor_id,department,section,graduation_year) VALUES ($1,'IT','B',2027) RETURNING *",[advisor.id]);
  const roster=await db.query("INSERT INTO roster_students(class_id,register_number,name,user_id) VALUES ($1,'test-1','Lead',$2),($1,'test-2','Member',$3) RETURNING *",[cl.id,lead.id,member.id]);
  const [team]=await db.query("INSERT INTO project_teams(class_id,name,project_title,guide_id,lead_roster_id,created_by,approved) VALUES ($1,'Test team','Test project',$2,$3,$4,true) RETURNING *",[cl.id,guide.id,roster[0].id,advisor.id]);
  await db.query("INSERT INTO team_members(team_id,roster_id,status,invited_by,joined_at) VALUES ($1,$2,'accepted',$4,now()),($1,$3,'accepted',$4,now())",[team.id,roster[0].id,roster[1].id,advisor.id]);
  const [repo]=await db.query("INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url,team_id) VALUES ('1',$1,'1','owner','repo','owner/repo','main','https://github.com/owner/repo',$2) RETURNING *",[lead.id,team.id]);
  await run({db,lead,member,advisor,guide,other,cl,team,repo,api:new NotificationsController(db)});
 }finally{await pg.close();}
}

test('notification list/count/read immediately revoke a reassigned guide without deleting delivery history',()=>setup(async({db,advisor,guide,other,team,api})=>{
 const before=await api.list({user:guide},{});assert.equal(before.items.length,1);
 assert.equal((await api.list({user:other},{})).items.length,0);
 await db.query('UPDATE project_teams SET guide_id=$1 WHERE id=$2',[other.id,team.id]);
 assert.equal((await api.count({user:guide})).unreadCount,0);
 assert.equal((await api.list({user:guide},{})).items.length,0);
 await assert.rejects(api.read({user:guide},before.items[0].id),e=>e.getStatus()===404);
 await api.readAll({user:guide},{before:new Date().toISOString()});
 const [delivery]=await db.query('SELECT read_at FROM notification_recipients WHERE user_id=$1',[guide.id]);assert.equal(delivery.read_at,null);
 assert.equal((await api.list({user:advisor},{})).items.length,1);
 assert.equal((await api.list({user:other},{})).items.length,0,'new assignment does not invent historic delivery');
}));

test('unknown commit author is not attributed or delivered to the repository lead',()=>setup(async({db,lead,member,guide,repo,api})=>{
 const [commit]=await db.query("INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,NULL,$2) RETURNING *",[repo.id,'a'.repeat(40)]);
 const [event]=await db.query('SELECT * FROM notification_events WHERE commit_id=$1',[commit.id]);assert.equal(event.student_id,null);
 assert.equal((await api.list({user:lead},{})).items.length,1);
 assert.equal((await api.list({user:member},{})).items.length,1);
 const notices=(await api.list({user:guide},{})).items;assert.equal(notices.length,2);
 assert.equal(notices.find(n=>n.commitId===commit.id).studentId,null);
}));

test('personal quizzes and submitted answers notify the actual contributor, advisor and assigned guide only',()=>setup(async({db,lead,member,advisor,guide,other,repo,api})=>{
 const [commit]=await db.query("INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,$2,$3) RETURNING *",[repo.id,member.id,'b'.repeat(40)]);
 const [quiz]=await db.query("INSERT INTO quizzes(commit_id,student_id,trigger_reason,model) VALUES ($1,$2,'[]','test-only') RETURNING *",[commit.id,member.id]);
 const [q]=await db.query("INSERT INTO questions(quiz_id,ordinal,question_text,rubric) VALUES ($1,0,'Test question','Test rubric') RETURNING *",[quiz.id]);
 await db.query("INSERT INTO responses(question_id,student_id,answer_text,is_draft,grading_status) VALUES ($1,$2,'Private technical answer',false,'pending')",[q.id,member.id]);
 for(const user of [member,advisor,guide])assert.equal((await api.list({user},{})).items.filter(n=>n.quizId===quiz.id).length,2);
 for(const user of [lead,other])assert.equal((await api.list({user},{})).items.filter(n=>n.quizId===quiz.id).length,0);
}));

test('academic events have usable links, explicit deduplicated recipients and current team access',()=>setup(async({db,lead,member,advisor,guide,other,cl,team,api})=>{
 const args=['invite-test','team_invited',cl.id,team.id,member.id,[member.id,advisor.id,guide.id,other.id,member.id]];
 await db.query('SELECT emit_academic_notification($1,$2,$3,$4,$5,$6)',args);
 await db.query('SELECT emit_academic_notification($1,$2,$3,$4,$5,$6)',args);
 const notice=(await api.list({user:member},{})).items.find(n=>n.kind==='team_invited');
 assert.ok(notice);assert.equal(notice.path,'/student/team');assert.equal(notice.teamId,team.id);assert.equal(notice.classId,cl.id);
 assert.equal((await api.list({user:advisor},{})).items.find(n=>n.kind==='team_invited').path,'/faculty/classes');
 assert.equal((await api.list({user:other},{})).items.length,0);
 assert.equal((await api.list({user:lead},{})).items.some(n=>n.kind==='team_invited'),false);
 await db.query("UPDATE team_members SET status='left',left_at=now() WHERE team_id=$1 AND roster_id IN (SELECT id FROM roster_students WHERE user_id=$2)",[team.id,member.id]);
 assert.equal((await api.list({user:member},{})).items.length,1,'former member retains their own notice, not shared repository notices');
 await api.read({user:member},notice.id);assert.equal((await api.count({user:member})).unreadCount,0);
}));

test('same-team members cannot read, draft, submit or acknowledge another member’s private discussion',()=>setup(async({db,lead,member,repo,api})=>{
 const {QuizController}=require('../dist/quiz');let providerCalls=0;
 const quizzes=new QuizController(db,{grade:async()=>{providerCalls++;throw Error('Unexpected provider request');}});
 const [commit]=await db.query("INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,$2,$3) RETURNING *",[repo.id,member.id,'c'.repeat(40)]);
 const [quiz]=await db.query("INSERT INTO quizzes(commit_id,student_id,trigger_reason,model) VALUES ($1,$2,'[]','test-only') RETURNING *",[commit.id,member.id]);
 const [question]=await db.query("INSERT INTO questions(quiz_id,ordinal,question_text,rubric) VALUES ($1,0,'Explain the test-only change','Private rubric') RETURNING *",[quiz.id]);
 const answer={answerText:'The contributor’s private technical explanation.'};
 await quizzes.draft(question.id,{user:member},answer);
 assert.equal(await quizzes.active({user:lead}),null);
 await assert.rejects(quizzes.active({user:lead},quiz.id),e=>e.getStatus()===404);
 await assert.rejects(quizzes.draft(question.id,{user:lead},answer),e=>e.getStatus()===404);
 await assert.rejects(quizzes.answer(question.id,{user:lead},answer),e=>e.getStatus()===404);
 const own=await quizzes.active({user:member},quiz.id);assert.equal(own.answers[question.id].answerText,answer.answerText);
 assert.equal(own.questions[0].rubric,undefined);
 const notice=(await api.list({user:member},{})).items.find(n=>n.quizId===quiz.id);
 assert.ok(notice);await assert.rejects(api.read({user:lead},notice.id),e=>e.getStatus()===404);
 assert.equal((await api.list({user:lead},{})).items.some(n=>n.quizId===quiz.id),false);
 assert.equal(providerCalls,0);
}));

test('failed grading retry preserves the exact answer and audit; concurrent and completed retries do not regrade',()=>setup(async({db,member,repo})=>{
 const {QuizController}=require('../dist/quiz');
 const [commit]=await db.query("INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,$2,$3) RETURNING *",[repo.id,member.id,'d'.repeat(40)]);
 const [quiz]=await db.query("INSERT INTO quizzes(commit_id,student_id,trigger_reason,model) VALUES ($1,$2,'[]','test-only') RETURNING *",[commit.id,member.id]);
 const [question]=await db.query("INSERT INTO questions(quiz_id,ordinal,question_text,rubric) VALUES ($1,0,'Explain the test-only change','Private rubric') RETURNING *",[quiz.id]);
 const answer={answerText:'This exact saved explanation describes the original implementation.'};
 const grade={score:75,explanation:'Test-only transport rationale',confidence:0.6,audit:{provider:'test-only',rawResponse:'test-only raw model output',rubric:'Private rubric'}};
 let release,entered;const pending=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const observed=[];
 const llm={grade:async(q,value)=>{observed.push(value);if(observed.length===1)throw Error('Test-only nonretryable provider failure');entered();return pending;}};
 const api=new QuizController(db,llm),request={user:member};
 await assert.rejects(api.answer(question.id,request,answer));
 const [saved]=await db.query('SELECT * FROM responses WHERE question_id=$1',[question.id]);assert.equal(saved.grading_status,'failed');assert.equal(saved.answer_text,answer.answerText);
 await assert.rejects(api.answer(question.id,request,{answerText:'A visibly different value must never be silently graded.'}),e=>e.getStatus()===409);
 await assert.rejects(api.draft(question.id,request,{answerText:'A replacement draft must not overwrite the submitted answer.'}),e=>e.getStatus()===409);
 const retry=api.answer(question.id,request,answer);await started;
 await assert.rejects(api.answer(question.id,request,answer),e=>e.getStatus()===409);
 release(grade);const result=await retry;
 assert.equal(result.submittedAnswer,answer.answerText);assert.equal(result.audit,undefined);
 const [stored]=await db.query('SELECT * FROM responses WHERE question_id=$1',[question.id]);assert.deepEqual(stored.result,grade);assert.equal(stored.answer_text,saved.answer_text);assert.deepEqual(stored.submitted_at,saved.submitted_at);
 assert.equal((await api.active(request,quiz.id)).answers[question.id].result.audit,undefined,'raw provider audit stays faculty-only');
 assert.deepEqual(await api.answer(question.id,request,answer),result);
 assert.deepEqual(observed,[answer.answerText,answer.answerText]);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM score_history WHERE commit_id=$1 AND cause='quiz_completed'",[commit.id]))[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM notification_events WHERE question_id=$1 AND kind='answer_submitted'",[question.id]))[0].n,1);
}));
