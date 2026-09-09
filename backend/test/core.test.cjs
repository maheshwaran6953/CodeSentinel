require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { verifySignature, encrypt, decrypt, AccessGuard } = require('../dist/security');
const { velocity, combine } = require('../dist/scoring');
const { excluded, supported } = require('../dist/stylometry');
const { WebhookController } = require('../dist/webhook');
const { validateGrade } = require('../dist/llm');
const { redisConnection } = require('../dist/queue');

test('webhook HMAC covers exact bytes and rejects malformed/tampered/missing signatures', () => {
  const raw = Buffer.from('{"message":"héllo"}'); const secret='unit-test-webhook';
  const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(verifySignature(raw,sig,secret),true);
  for (const invalid of [undefined,'sha1=123','sha256=x','sha256='+'0'.repeat(64)]) assert.equal(verifySignature(raw,invalid,secret),false);
  assert.equal(verifySignature(Buffer.concat([raw,Buffer.from(' ')]),sig,secret),false);
});
test('encrypted GitHub tokens authenticate ciphertext and round trip', () => {
  process.env.TOKEN_ENCRYPTION_KEY='ab'.repeat(32);
  const encrypted=encrypt('unit-test-token'); assert.equal(decrypt(encrypted),'unit-test-token');
  const bytes=Buffer.from(encrypted,'base64'); bytes[30]^=1;
  assert.throws(()=>decrypt(bytes.toString('base64')));
});
test('velocity waits for personal history, flags deviation, and adapts to high-volume authors', () => {
  const typical={additions:100,deletions:20,files:3,gapHours:12};
  assert.equal(velocity(typical,[]).risk,null);
  assert.equal(velocity(typical,Array(8).fill(typical)).flagged,false);
  const large={...typical,additions:2000};
  assert.equal(velocity(large,Array(8).fill(typical)).flagged,true);
  assert.equal(velocity(large,Array(8).fill(large)).flagged,false);
  assert.equal(velocity(large,Array(7).fill(typical)).flagged,false);
});
test('combined risk preserves missing signals and applies documented weights',()=>{
  assert.equal(combine(null,null,null).authenticityScore,null);
  assert.equal(combine(60,null,null).riskScore,60);
  assert.equal(combine(100,50,100).riskScore,50);
  assert.equal(combine(100,50,100).authenticityScore,50);
});
test('generated, vendored, ignored and unsafe paths do not enter authorship evidence',()=>{
  for(const file of ['node_modules/lib/a.js','dist/a.js','package-lock.json','src/a.min.js','migrations/a.py','../secret.py']) assert.equal(excluded(file),true);
  assert.equal(excluded('src/a.ts','// @generated\nlet x=1'),true);
  assert.equal(excluded('cache/a.py','','cache/'),true);
  assert.equal(excluded('src/app.ts'),false); assert.equal(supported('a.tsx'),true); assert.equal(supported('a.png'),false);
});
test('webhook queues signed push ranges and leaves expensive retrieval to the worker',async()=>{
  process.env.GITHUB_WEBHOOK_SECRET='test-secret';
  const jobs=[];
  const db={query:async(sql)=>sql.startsWith('SELECT')?[{id:'repo-id'}]:[]};
  const queue={enqueue:async(...args)=>jobs.push(args)};
  const controller=new WebhookController(db,queue);
  const body={repository:{id:1},installation:{id:2},before:'a'.repeat(40),after:'b'.repeat(40)};
  const rawBody=Buffer.from(JSON.stringify(body)); const sig='sha256='+createHmac('sha256','test-secret').update(rawBody).digest('hex');
  await controller.github({body,rawBody},sig,'push','delivery-1');
  assert.equal(jobs.length,1); assert.equal(jobs[0][0],'push'); assert.equal(jobs[0][1],'delivery-delivery-1');
  assert.equal(jobs[0][2].after,body.after);
  await assert.rejects(controller.github({body,rawBody},'bad','push','delivery-2'));
  assert.equal(jobs.length,1);
});
test('Redis TLS URL preserves encoded credentials and rejects REST URLs',()=>{
  process.env.REDIS_URL='rediss://default:p%40ss@example.com:6380/2'; const c=redisConnection();
  assert.equal(c.password,'p@ss');assert.equal(c.db,2);assert.deepEqual(c.tls,{});
  process.env.REDIS_URL='https://example.com';assert.throws(redisConnection);
});
test('role guard rejects a student on faculty endpoint even with a valid session',async()=>{
  process.env.FRONTEND_URL='http://localhost:4200'; process.env.JWT_SECRET='x'.repeat(32);
  const reflector={getAllAndOverride:key=>key==='public'?false:['faculty']};
  const guard=new AccessGuard(reflector,{verify:()=>({sub:'user',jti:'session'})},{query:async()=>[{id:'user',role:'student'}]});
  const req={method:'GET',headers:{},cookies:{session:'signed'}};
  const context={getHandler:()=>{},getClass:()=>{},switchToHttp:()=>({getRequest:()=>req})};
  await assert.rejects(guard.canActivate(context),e=>e.getStatus()===403);
  req.method='POST';req.headers.origin='https://attacker.invalid';
  await assert.rejects(guard.canActivate(context),e=>e.getStatus()===403);
});
test('grading validates rubric and calculates score independently of LLM overall score',()=>{
  const grade={technicalCorrectness:80,relevance:80,reasoningQuality:80,designUnderstanding:80,tradeoffs:80,explanation:'Specific technical reasoning',confidence:0.8,score:100};
  assert.equal(validateGrade(grade).score,80);
  assert.throws(()=>validateGrade({...grade,relevance:101}));
  assert.throws(()=>validateGrade({...grade,explanation:''}));
});
