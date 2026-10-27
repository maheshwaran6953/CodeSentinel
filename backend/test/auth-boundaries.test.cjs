// Isolated provider transport and embedded database only; never load local credentials.
process.env.DOTENV_CONFIG_PATH=require('node:path').join(__dirname,'nonexistent-test-environment');
process.env.NODE_ENV='test';
require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const axios=require('axios');
const {JwtService}=require('@nestjs/jwt');
const {AuthController}=require('../dist/auth');
const {AccessGuard}=require('../dist/security');

async function setup(t,run) {
 const values={FRONTEND_URL:'http://localhost:4200',SUPABASE_URL:'https://provider.invalid',SUPABASE_ANON_KEY:'isolated-test-key',JWT_SECRET:'isolated-auth-test-secret-at-least-32-characters',FACULTY_EMAILS:'faculty@example.test'};
 const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
 const pg=new PGlite({extensions:{pgcrypto}});
 try {
  await pg.exec(readFileSync('migrations/001_initial.sql','utf8'));
  const db={query:async(sql,args=[]) => (await pg.query(sql,args)).rows};
  const [faculty]=await db.query("INSERT INTO users(supabase_id,name,email,role) VALUES ('11111111-1111-4111-8111-111111111111','Existing faculty','faculty@example.test','faculty') RETURNING *");
  const jwt=new JwtService(),api=new AuthController(db,{},jwt);
  const profile={id:faculty.supabase_id,email:faculty.email,email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{name:'Provider faculty'}};
  const cookies=[],res={cookie:(name,value,options)=>cookies.push({name,value,options})};
  await run({db,faculty,jwt,api,profile,cookies,res,req:{headers:{origin:values.FRONTEND_URL}},body:{email:faculty.email,password:'test-only-password'}});
 } finally {
  await pg.close();for(const key of Object.keys(values)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
 }
}

test('existing faculty profile cannot bypass fresh-login allowlist or email confirmation; rejection writes no session',async t=>setup(t,async({db,faculty,api,profile,cookies,res,req,body})=>{
 let providerCalls=0;
 t.mock.method(axios,'post',async()=>{providerCalls++;return {data:{user:profile}};});
 process.env.FACULTY_EMAILS='other-faculty@example.test';
 await assert.rejects(api.faculty(body,req,res),e=>e.getStatus()===403);
 process.env.FACULTY_EMAILS='';
 await assert.rejects(api.faculty(body,req,res),e=>e.getStatus()===403);
 process.env.FACULTY_EMAILS=faculty.email;profile.email_confirmed_at=null;
 await assert.rejects(api.faculty(body,req,res),e=>e.getStatus()===403);
 assert.equal(providerCalls,3);assert.equal(cookies.length,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions'))[0].n,0);
 assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1',[faculty.id]))[0],faculty,'denial must neither demote nor replace the existing profile');
}));

test('allowlisted faculty login creates one usable secure session; later fresh login still checks current allowlist',async t=>setup(t,async({db,faculty,jwt,api,profile,cookies,res,req,body})=>{
 process.env.FACULTY_EMAILS=' other@example.test, FACULTY@EXAMPLE.TEST ';
 const provider=t.mock.method(axios,'post',async()=>({data:{user:profile}}));
 const user=await api.faculty({...body,remember:true},req,res);
 assert.equal(user.id,faculty.id);assert.equal(user.role,'faculty');assert.equal(cookies.length,1);
 assert.equal(cookies[0].name,'session');assert.equal(cookies[0].options.httpOnly,true);assert.equal(cookies[0].options.path,'/');assert.equal(cookies[0].options.maxAge,7*86400*1000);
 const request={method:'GET',headers:{},cookies:{session:cookies[0].value}};
 const reflector={getAllAndOverride:key=>key==='public'?false:['faculty']};
 const guard=new AccessGuard(reflector,jwt,db);
 assert.equal(await guard.canActivate({getHandler:()=>{},getClass:()=>{},switchToHttp:()=>({getRequest:()=>request})}),true);
 assert.equal(request.user.id,faculty.id);assert.equal(request.user.role,'faculty');
 process.env.FACULTY_EMAILS='other@example.test';
 await assert.rejects(api.faculty(body,req,res),e=>e.getStatus()===403);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions'))[0].n,1);assert.equal(cookies.length,1);
 await assert.rejects(api.faculty(body,{headers:{origin:'https://untrusted.invalid'}},res),e=>e.getStatus()===403);
 assert.equal(provider.mock.callCount(),2,'untrusted origin never sends credentials to the provider');
}));
