require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,readdirSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {FacultyController,StudentController}=require('../dist/dashboard');

test('faculty routes and aggregates isolate assigned teams, including another project by the same student',{timeout:120000},async()=>{
  const pg=new PGlite({extensions:{pgcrypto}});
  try {
    for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) await pg.exec(readFileSync('migrations/'+file,'utf8'));
    const adapter=client=>({query:async(sql,args=[]) => (await client.query(sql,args)).rows});
    const db={...adapter(pg),source:{transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))}};
    const users={};
    for(const [name,role] of [['advisor','faculty'],['guide','faculty'],['otherGuide','faculty'],['unassigned','faculty'],['student','student'],['otherStudent','student']]) {
      [users[name]]=await db.query('INSERT INTO users(name,role) VALUES ($1,$2) RETURNING *',[name,role]);
    }
    const [klass]=await db.query("INSERT INTO project_classes(advisor_id,department,section,graduation_year,team_member_limit) VALUES ($1,'IT','B',2027,2) RETURNING *",[users.advisor.id]);
    const roster=[];
    for(const name of ['student','otherStudent']) {
      const [entry]=await db.query('INSERT INTO roster_students(class_id,register_number,name,user_id) VALUES ($1,$2,$2,$3) RETURNING *',[klass.id,name,users[name].id]);
      roster.push(entry);
    }
    const teams=[],repos=[];
    for(let index=0;index<2;index++) {
      const [team]=await db.query("INSERT INTO project_teams(class_id,name,project_title,lead_roster_id,approved,created_by,guide_id) VALUES ($1,$2,$2,$3,true,$4,$5) RETURNING *",[klass.id,'Team '+index,roster[index].id,users.advisor.id,users[index?'otherGuide':'guide'].id]);
      teams.push(team);
      await db.query("INSERT INTO team_members(team_id,roster_id,status,invited_by,joined_at) VALUES ($1,$2,'accepted',$3,now())",[team.id,roster[index].id,users.advisor.id]);
      const [repo]=await db.query("INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url,team_id) VALUES ($1,$2,'123','test',$1,$1,'main','https://github.com/test/project',$3) RETURNING *",['repository-'+index,users.student.id,team.id]);
      repos.push(repo);
    }
    const [personal]=await db.query("INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url) VALUES ('personal',$1,'123','test','personal','test/personal','main','https://github.com/test/personal') RETURNING *",[users.student.id]);
    const commits=[];
    for(const [index,repo] of [...repos,personal].entries()) {
      const [commit]=await db.query("INSERT INTO commits(repository_id,student_id,sha,status,flagged,committed_at,diff) VALUES ($1,$2,$3,'failed',true,now()+$4::int*interval '1 day','+test') RETURNING *",[repo.id,users.student.id,String(index).repeat(40),index]);
      commits.push(commit);
      await db.query("INSERT INTO quizzes(commit_id,student_id,trigger_reason,model) VALUES ($1,$2,'[]','test-only')",[commit.id,users.student.id]);
    }
    const [unknown]=await db.query("INSERT INTO commits(repository_id,student_id,sha,status,quiz_status,diff) VALUES ($1,null,$2,'excluded','pending','+test') RETURNING *",[repos[0].id,'f'.repeat(40)]);
    let queued=0;
    const faculty=new FacultyController(db,{enqueue:async()=>{queued++;}},{quotaStatus:{configured:true}});
    const req=name=>({user:users[name]});
    const list=await faculty.students(req('guide'));
    assert.equal(list.length,1);
    assert.equal(list[0].id,users.student.id);
    assert.equal(list[0].commits,1);
    assert.equal(list[0].flagged,1);
    assert.equal(list[0].repositories,1);
    assert.equal(list[0].pending_discussions,1);
    assert.equal(new Date(list[0].last_activity).getTime(),new Date(commits[0].committed_at).getTime(),'a later private commit must not leak through last_activity');
    const detail=await faculty.student(users.student.id,req('guide'));
    assert.deepEqual(detail.repositories.map(r=>r.id),[repos[0].id]);
    assert.deepEqual(detail.commits.map(c=>c.id),[commits[0].id]);
    await assert.rejects(faculty.student(users.otherStudent.id,req('guide')),e=>e.getStatus()===404);
    assert.equal((await faculty.students(req('unassigned'))).length,0);
    for(const hidden of [commits[1],commits[2]]) {
      await assert.rejects(faculty.evidence(hidden.id,req('guide')),e=>e.getStatus()===404);
      await assert.rejects(faculty.override(hidden.id,req('guide'),{action:'note',reason:'Unauthorized test-only request'}),e=>e.getStatus()===404);
      await assert.rejects(faculty.discussion(hidden.id,req('guide'),{action:'note',reason:'Unauthorized test-only request'}),e=>e.getStatus()===404);
      await assert.rejects(faculty.retry(hidden.id,req('guide')),e=>e.getStatus()===404);
    }
    assert.equal(queued,0);
    assert.equal((await faculty.evidence(commits[1].id,req('advisor'))).commit.id,commits[1].id);
    assert.equal((await faculty.student(users.student.id,req('advisor'))).commits.length,2,'advisor covers class teams but no unrelated personal repository');
    await faculty.override(unknown.id,req('guide'),{action:'note',reason:'Review attribution with team members.'});
    await assert.rejects(faculty.discussion(unknown.id,req('guide'),{action:'note',reason:'Discuss this unknown commit author.'}),e=>e.getStatus()===409);
    await assert.rejects(faculty.retry(unknown.id,req('guide')),e=>e.getStatus()===409);
    assert.equal((await faculty.evidence(unknown.id,req('guide'))).overrides.length,1);
    const studentDashboard=await new StudentController(db).dashboard(req('student'));
    assert.deepEqual(new Set(studentDashboard.repositories.map(r=>r.name)),new Set([repos[0].full_name,personal.full_name]),'linker ownership must not expose a team after membership ends');
    assert.equal(studentDashboard.total_commits,3,'student retains own historical contributions');
    const teammateDashboard=await new StudentController(db).dashboard(req('otherStudent'));
    assert.equal(teammateDashboard.repositories[0].name,repos[1].full_name);
    assert.equal(teammateDashboard.total_commits,0,'shared repository does not turn another author’s commits into the member’s contributions');
  } finally {await pg.close();}
});
