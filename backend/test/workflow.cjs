// Shared service-contract scenario. GitHub and Groq are explicit test fixtures;
// production services never use these. Database queries and AST extraction are real.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Analysis } = require('../dist/analysis');
const { Stylometry } = require('../dist/stylometry');
const { QuizController } = require('../dist/quiz');
const { StudentController,FacultyController } = require('../dist/dashboard');

async function workflow(db, queueTransport) {
  const [student] = await db.query("INSERT INTO users(github_id,github_login,name,role) VALUES ($1,'test-student','Test student','student') RETURNING *",[randomUUID()]);
  const [faculty] = await db.query("INSERT INTO users(name,role) VALUES ('Test faculty','faculty') RETURNING *");
  const [repo] = await db.query(`INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url)
    VALUES ($1,$2,'123','owner','project','owner/project','main','https://github.com/owner/project') RETURNING *`,[randomUUID(),student.id]);
  repo.student_github_id=student.github_id;
  const source=Array.from({length:12},(_,i)=>`def parse_node_${i}(input_value):\n    for child_node in input_value:\n        if child_node:\n            print(child_node)\n    return input_value\n`).join('\n');
  let generationCalls=0,gradeCalls=0;
  const llm={model:'test-fixture',questions:async()=>{generationCalls++;return [
    {questionText:'What terminates the loop over input_value in parse_node_0?',rubric:'Explain iterable exhaustion and how each child is visited.'},
    {questionText:'Why does parse_node_0 check child_node before printing?',rubric:'Explain truthiness and consequences for zero or empty children.'}
  ];},grade:async()=>{gradeCalls++;return {score:80,explanation:'Fixture grade used only in contract tests.',feedback:'Fixture grade',status:'passed',confidence:0.8};}};
  const github={api:async(path)=>{
    if(path.includes('/contents/.gitignore')) return {type:'file',encoding:'base64',size:6,content:Buffer.from('dist/').toString('base64')};
    if(path.includes('/contents/')) return {type:'file',encoding:'base64',size:source.length,content:Buffer.from(source).toString('base64')};
    const number=parseInt(path.split('/commits/')[1].slice(0,8),16);
    return {author:{id:student.github_id},parents:[{}],commit:{author:{name:'Student'},committer:{date:new Date(Date.UTC(2026,0,number+1)).toISOString()},message:`Change parser ${number}`},
      stats:{additions:number===9?3000:100,deletions:10},files:[{filename:'parser.py',status:'modified',additions:number===9?3000:100,deletions:10,patch:'+ '+source.replace(/\n/g,'\n+ ')}]};
  },installationToken:async()=>'fixture-token'};
  const analysis=new Analysis(db,github,queueTransport || {},new Stylometry(),llm);
  const run = queueTransport ? (data)=>queueTransport.run(analysis,data) : data=>analysis.commit(repo,data.sha,'fixture-token');
  let flagged;
  for(let n=0;n<10;n++) {
    const sha=n.toString(16).padStart(8,'0')+'a'.repeat(32);
    const [c]=await db.query('INSERT INTO commits(repository_id,student_id,sha) VALUES ($1,$2,$3) RETURNING id',[repo.id,student.id,sha]);
    await run({repositoryId:repo.id,sha});
    if(n===9) flagged=c.id;
  }
  const [commit]=await db.query('SELECT * FROM commits WHERE id=$1',[flagged]);
  assert.equal(commit.status,'completed');assert.equal(commit.flagged,true);assert.equal(commit.quiz_status,'generated');
  assert.equal(commit.velocity.historyCount,9);assert.ok(commit.features.py.vector.length>10);
  await analysis.generateQuiz(flagged);assert.equal(generationCalls,1,'Quiz generation is idempotent');
  const quiz=new QuizController(db,llm);
  const req={user:student};const session=await quiz.active(req);assert.equal(session.totalQuestions,2);
  await assert.rejects(quiz.draft(session.questions[0].id,{user:faculty},{answerText:'Unauthorized draft attempt'}));
  await quiz.draft(session.questions[0].id,req,{answerText:'My work-in-progress explanation.'});
  const answer={answerText:'Iteration ends when the iterator is exhausted; the branch filters false values.'};
  for(const q of session.questions) await quiz.answer(q.id,req,answer);
  await quiz.answer(session.questions[0].id,req,{answerText:'Different text must not change a graded answer.'});
  assert.equal(gradeCalls,2);assert.equal(await quiz.active(req),null);
  const dashboard=await new StudentController(db).dashboard(req);assert.equal(dashboard.total_commits,10);assert.equal(dashboard.pending_quizzes,0);
  const facultyApi=new FacultyController(db,queueTransport || {});
  const before=await facultyApi.evidence(flagged);assert.equal(before.scoreHistory.length,2);
  // A repaired partial AST analysis must retain the already completed quiz signal.
  await db.query("UPDATE commits SET status='partial' WHERE id=$1",[flagged]);
  await analysis.commit(repo,commit.sha,'fixture-token');
  const [reanalyzed]=await db.query('SELECT signals,quiz_status FROM commits WHERE id=$1',[flagged]);
  assert.equal(reanalyzed.signals.signals.quiz,20);
  assert.equal(reanalyzed.quiz_status,'generated');
  await facultyApi.override(flagged,{user:faculty},{action:'legitimate',reason:'Documented framework migration discussed with the student.'});
  const after=await facultyApi.evidence(flagged);assert.equal(after.overrides.length,1);
  assert.equal(after.commit.risk_score,before.commit.risk_score);assert.equal(after.commit.flagged,true);
  assert.equal(after.questions[0].answer_text,answer.answerText);
  return {studentId:student.id,facultyId:faculty.id,repositoryId:repo.id};
}
module.exports={workflow};
