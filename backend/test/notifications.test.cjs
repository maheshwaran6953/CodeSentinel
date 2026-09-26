require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {NotificationsController}=require('../dist/notifications');
const {StudentController}=require('../dist/dashboard');
test('activity inbox isolates students, exposes real stages and links each commit to its repository',async()=>{
  const pg=new PGlite({extensions:{pgcrypto}});
  try {
    await pg.exec(readFileSync('migrations/001_initial.sql','utf8'));
    const db={query:async(sql,args=[]) => (await pg.query(sql,args)).rows};
    const [a,b]=await db.query("INSERT INTO users(name,role) VALUES ('Student A','student'),('Student B','student') RETURNING id");
    for(const [i,user] of [a,b].entries()) {
      const [r]=await db.query("INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url) VALUES ($1,$2,'1','owner',$3,$4,'main',$5) RETURNING id",[String(i),user.id,'repo'+i,'owner/repo'+i,'https://github.com/owner/repo'+i]);
      await db.query("INSERT INTO commits(repository_id,student_id,sha,message,status,analyzed_at) VALUES ($1,$2,$3,'Actual change','completed',now())",[r.id,user.id,String(i).repeat(40)]);
    }
    const inbox=new NotificationsController(db);
    const student=await inbox.list({user:{...a,role:'student'}});
    assert.equal(student.length,3);
    assert.ok(student.every(n=>n.context==='owner/repo0' && !n.commitId));
    assert.ok(student.some(n=>n.title==='Analysis: completed'));
    const faculty=await inbox.list({user:{...a,role:'faculty'}});
    assert.equal(faculty.length,6);
    assert.ok(faculty.some(n=>n.context.includes('Student B') && n.commitId));
    const dashboard=await new StudentController(db).dashboard({user:a});
    assert.equal(dashboard.recent_commits[0].url,'https://github.com/owner/repo0/commit/'+'0'.repeat(40));
  } finally {await pg.close();}
});
