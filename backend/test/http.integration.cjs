const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomBytes,randomUUID,generateKeyPairSync,createHmac}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {Client}=require('pg');
const {JwtService}=require('@nestjs/jwt');

test('actual NestJS HTTP startup, session roles, DTOs, CSRF and raw-body webhook validation',{
  timeout:90000,skip:!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL
},async()=>{
  const secret=randomBytes(32).toString('hex');
  const env={...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,REDIS_URL:process.env.TEST_REDIS_URL,
    DATABASE_SSL:'false',NODE_ENV:'test',PORT:'3301',RUN_WORKER:'false',FRONTEND_URL:'http://localhost:4200',
    JWT_SECRET:secret,TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('hex'),GITHUB_WEBHOOK_SECRET:secret,
    GITHUB_APP_ID:'1',GITHUB_APP_SLUG:'test-fixture',GITHUB_CLIENT_ID:'test-fixture',GITHUB_CLIENT_SECRET:'test-fixture',
    GITHUB_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),
    GITHUB_CALLBACK_URL:'http://localhost:3301/auth/github/callback'};
  const child=spawn(process.execPath,['dist/main.js'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let startup='';child.stdout.on('data',d=>startup+=d);child.stderr.on('data',d=>startup+=d);
  const db=new Client({connectionString:env.DATABASE_URL});
  try {
    await db.connect();
    let ready=false;
    for(let i=0;i<80;i++) {
      try {ready=(await fetch('http://localhost:3301/health/ready')).ok;} catch {}
      if(ready) break;
      if(child.exitCode!==null) throw new Error('Backend exited during startup: '+startup.slice(-2000));
      await delay(250);
    }
    assert.equal(ready,true,'API reached ready state');
    const call=(path,options={})=>fetch('http://localhost:3301'+path,options);
    assert.equal((await call('/auth/me')).status,401);
    const {rows:[student]}=await db.query("INSERT INTO users(name,role) VALUES ('HTTP test student','student') RETURNING id");
    const jti=randomUUID();await db.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[jti,student.id]);
    const token=new JwtService().sign({}, {secret,subject:student.id,jwtid:jti,expiresIn:3600,algorithm:'HS256',issuer:'codesentinel',audience:'codesentinel'});
    const headers={cookie:'session='+token,origin:env.FRONTEND_URL,'content-type':'application/json'};
    const me=await call('/auth/me',{headers});assert.equal(me.status,200);assert.equal((await me.json()).role,'student');
    assert.equal((await call('/faculty/students',{headers})).status,403);
    assert.equal((await call('/repositories/link',{method:'POST',headers,body:JSON.stringify({repositoryId:'1',studentId:'forged'})})).status,400);
    assert.equal((await call('/auth/logout',{method:'POST',headers:{...headers,origin:'https://attacker.invalid'},body:'{}'})).status,403);
    const raw=JSON.stringify({padding:'x'.repeat(120000)});
    const webhookHeaders={'content-type':'application/json','x-github-event':'ping','x-github-delivery':randomUUID(),
      'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')};
    assert.equal((await call('/webhooks/github',{method:'POST',headers:webhookHeaders,body:raw})).status,202);
    assert.equal((await call('/webhooks/github',{method:'POST',headers:webhookHeaders,body:raw+' '})).status,401);
    assert.equal((await call('/auth/logout',{method:'POST',headers,body:'{}'})).status,201);
    assert.equal((await call('/auth/me',{headers})).status,401);
    await db.query('DELETE FROM users WHERE id=$1',[student.id]);
  } finally {child.kill();await db.end();}
});
