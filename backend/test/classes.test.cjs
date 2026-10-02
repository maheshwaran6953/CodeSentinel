require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,readdirSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {AcademicAccess,ClassesController,TeamsController}=require('../dist/classes');
async function setup(run){
 const pg=new PGlite({extensions:{pgcrypto}});
 try{
  for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync('migrations/'+f,'utf8'));
  const adapter=p=>({query:async(sql,args=[]) => (await p.query(sql,args)).rows});
  const db={...adapter(pg),source:{transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))}};
  const users=await db.query("INSERT INTO users(name,role,github_id,github_login) VALUES ('Advisor','faculty',NULL,NULL),('Guide','faculty',NULL,NULL),('Other faculty','faculty',NULL,NULL),('One','student','101','one'),('Two','student','102','two'),('Three','student','103','three') RETURNING *");
  const [advisor,guide,other,one,two,three]=users.map(user=>({user}));
  const access=new AcademicAccess(db),classes=new ClassesController(db,access),teams=new TeamsController(db,access);
  const c=await classes.create(advisor,{department:'IT',section:'B',graduationYear:2027,teamMemberLimit:2});
  await classes.import(advisor,c.id,{students:[{registerNumber:'T001',name:'One'},{registerNumber:'T002',name:'Two'},{registerNumber:'T003',name:'Three'}]});
  const roster=(await classes.detail(advisor,c.id)).roster;
  const claim=async(req,index)=>{const q=await classes.claim(req,{classId:c.id,registerNumber:roster[index].register_number});await classes.review(advisor,c.id,q.id,{action:'approve'});};
  await run({db,classes,teams,c,advisor,guide,other,one,two,three,roster,claim});
 }finally{await pg.close();}
}
test('roster import is atomic and register numbers alone cannot bind a GitHub account',async()=>setup(async({db,classes,c,advisor,guide,one,two,roster})=>{
 await assert.rejects(classes.import(guide,c.id,{students:[{registerNumber:'T004',name:'Unauthorized'}]}),e=>e.getStatus()===404);
 await assert.rejects(classes.import(advisor,c.id,{students:[{registerNumber:'T004',name:'New'},{registerNumber:'T001',name:'Duplicate'}]}),e=>e.getStatus()===409);
 assert.equal((await classes.detail(advisor,c.id)).roster.length,3);
 const q1=await classes.claim(one,{classId:c.id,registerNumber:'T001'}),q2=await classes.claim(two,{classId:c.id,registerNumber:'T001'});
 assert.equal((await db.query('SELECT user_id FROM roster_students WHERE id=$1',[roster[0].id]))[0].user_id,null);
 await assert.rejects(classes.review(guide,c.id,q1.id,{action:'approve'}),e=>e.getStatus()===404);
 await classes.review(advisor,c.id,q1.id,{action:'approve'});
 assert.equal((await db.query('SELECT status FROM roster_claims WHERE id=$1',[q2.id]))[0].status,'rejected');
 assert.equal((await db.query('SELECT user_id FROM roster_students WHERE id=$1',[roster[0].id]))[0].user_id,one.user.id);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM notification_events e JOIN notification_recipients r ON r.event_id=e.id WHERE e.kind='roster_rejected' AND r.user_id=$1",[two.user.id]))[0].n,1);
 await classes.editStudent(advisor,c.id,roster[0].id,{registerNumber:'T001',name:'Corrected name'});
 const corrected=(await db.query('SELECT * FROM roster_students WHERE id=$1',[roster[0].id]))[0];assert.equal(corrected.name,'Corrected name');assert.equal(corrected.user_id,one.user.id);
}));
test('student-led team reserves invitations, needs approval, and preserves separate verified identities',async()=>setup(async({db,classes,teams,c,advisor,guide,one,two,three,roster,claim})=>{
 await assert.rejects(teams.create(one,{classId:c.id,name:'Team',projectTitle:'Project'}),e=>e.getStatus()===403);
 await claim(one,0);await claim(two,1);await claim(three,2);
 const team=await teams.create(one,{classId:c.id,name:'Team',projectTitle:'Project'});assert.equal(team.approved,false);
 await teams.invite(one,team.id,{rosterId:roster[1].id});
 await assert.rejects(teams.invite(one,team.id,{rosterId:roster[2].id}),e=>e.getStatus()===409);
 await assert.rejects(teams.create(two,{classId:c.id,name:'Second',projectTitle:'Project'}),e=>e.getStatus()===409);
 await assert.rejects(teams.accept(three,team.id),e=>e.getStatus()===404);
 await teams.accept(two,team.id);await teams.accept(two,team.id);
 assert.equal((await teams.me(two)).teams.length,1);
 await teams.settings(advisor,team.id,{approved:true,guideId:guide.user.id});
 assert.equal((await classes.detail(guide,c.id)).teams.length,1);
 await assert.rejects(teams.settings(guide,team.id,{approved:false}),e=>e.getStatus()===403);
 await assert.rejects(classes.settings(advisor,c.id,{teamMemberLimit:1}),e=>e.getStatus()===409);
 await classes.settings(advisor,c.id,{teamMemberLimit:3});await teams.invite(one,team.id,{rosterId:roster[2].id});
 await teams.remove(three,team.id,roster[2].id);
 assert.equal((await teams.me(three)).invitations.length,0);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM notification_events e JOIN notification_recipients r ON r.event_id=e.id WHERE e.kind='team_joined' AND r.user_id=$1",[one.user.id]))[0].n,1);
}));
test('advisor can provision unclaimed teams and later assign a guide without inventing accounts',async()=>setup(async({db,classes,teams,c,advisor,guide,other,one,two,roster,claim})=>{
 const team=await classes.createTeam(advisor,c.id,{name:'Allocated team',projectTitle:'Proposed project',leadRosterId:roster[0].id,memberRosterIds:[roster[1].id]});
 assert.equal(team.approved,true);assert.equal(team.guide_id,null);
 assert.equal((await classes.list(guide)).classes.length,0);
 await claim(one,0);await claim(two,1);
 assert.equal((await teams.me(one)).invitations.length,1);
 await teams.accept(one,team.id);await teams.accept(two,team.id);
 await teams.settings(advisor,team.id,{guideId:guide.user.id});
 assert.equal((await classes.detail(guide,c.id)).roster.length,2);
 await assert.rejects(classes.detail(other,c.id),e=>e.getStatus()===404);
 await assert.rejects(teams.remove(one,team.id,roster[1].id),e=>e.getStatus()===403);
 await teams.remove(advisor,team.id,roster[1].id);
 assert.equal((await db.query('SELECT status FROM team_members WHERE team_id=$1 AND roster_id=$2',[team.id,roster[1].id]))[0].status,'left');
 assert.equal((await teams.me(two)).teams.length,0);
 await teams.settings(advisor,team.id,{guideId:other.user.id});
 await assert.rejects(teams.detail(guide,team.id),e=>e.getStatus()===404);
 assert.equal((await teams.detail(other,team.id)).team.guide_id,other.user.id);
 assert.ok((await db.query("SELECT id FROM academic_audit WHERE action='team_member_removed' AND team_id=$1",[team.id])).length);
}));
