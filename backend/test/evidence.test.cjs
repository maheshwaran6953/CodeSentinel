const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ancestorHistory,baseline,continuity,evidenceSummary,publicEvidence}=require('../dist/evidence');
const {velocity}=require('../dist/scoring');
require('reflect-metadata');
const {Analysis}=require('../dist/analysis');

// Synthetic coverage fixtures only; they are not training/validation data.
const file=(path='src/a.py',version=0)=>({path,status:'parsed',language:'py',fingerprint:path+version,
  nodes:1000,lines:180,functionCount:8,nodeDistribution:{function_definition:8,if_statement:8,for_statement:8,import_statement:1},
  symbols:[{name:'parse_value',fingerprint:'same-function'}],imports:['import json'],calls:['parse_value'],vector:Array(17).fill(1)});
const history=()=>Array.from({length:12},(_,i)=>({sha:'sha'+i,repository_id:'r',committed_at:new Date(Date.UTC(2026,0,1+i*2)).toISOString(),
  velocity:{metrics:{additions:20,deletions:5}},artifacts:['a','b','c'].map(n=>file(`src/${n}.py`,i)),files:[]}));
const style=()=>({files:[file()],languages:[{language:'py',distance:0,threshold:3,changedFeatures:[],modelStatus:'unavailable'}]});
const changedFiles=[{path:'src/a.py',supported:true,status:'modified',excluded:false}];

test('repeated snapshots and compressed tiny commits cannot establish a baseline',()=>{
  const h=history().slice(0,8).map((r,i)=>({...r,committed_at:new Date(1700000000000+i*1000).toISOString(),
    artifacts:[file('src/a.py',0)],velocity:{metrics:{additions:8,deletions:0}}}));
  const b=baseline(h);
  assert.equal(b.status,'learning');assert.equal(b.observed.sourceLines,180);
  assert.equal(b.observed.meaningfulCommits,0);assert.ok(b.missing.length>3);
  assert.equal(evidenceSummary(h,style(),{flagged:true},changedFiles,['sha7']).reviewRequested,false);
});
test('large feature changes alone never trigger review, even with established history',()=>{
  const speed=velocity({additions:5000,deletions:50,files:4,gapHours:24},Array(12).fill({additions:20,deletions:5,files:1,gapHours:24}));
  assert.equal(speed.flagged,true);
  const e=evidenceSummary(history(),style(),speed,changedFiles,['sha11']);
  assert.equal(e.baseline.status,'established');assert.equal(e.abstained,false);
  assert.equal(e.reviewRequested,false);assert.equal(e.model.authorshipProbability,null);
  assert.equal(e.continuity.status,'structural_links_observed');
});
test('review routing needs corroborating file evidence and coverage; it never emits a probability',()=>{
  const s=style();s.files=[{...file('new/module.py'),imports:['import unfamiliar_library'],symbols:[],calls:[],
    comparison:{distance:4,changedFeatures:['snake_ratio','function_length']}}];
  const f=[{path:'new/module.py',supported:true,excluded:false,status:'added'}];
  const e=evidenceSummary(history(),s,{flagged:false},f,['sha11']);
  assert.equal(e.reviewRequested,true);assert.deepEqual(e.surfacedFiles,['new/module.py']);
  assert.equal(e.uncertainty.confidence,'not_quantified');
  assert.equal(evidenceSummary(history(),s,{flagged:true},f,['missing-parent']).reviewRequested,false);
  assert.equal(evidenceSummary(history(),s,{flagged:true},f,['sha11'],null,['Source unavailable']).reviewRequested,false);
});
test('continuity retains exact references, tests and moved functions without claiming semantics',()=>{
  const s=style();s.files=[file('new/location.py')];
  const e=continuity(history(),s,[{path:'tests/test_feature.py',status:'added',additions:40,deletions:0}],['sha11']);
  assert.equal(e.observations[0].unchangedOrMovedSymbols[0],'parse_value');
  assert.equal(e.tests.length,1);assert.ok(e.historicalReferences.includes('sha11'));
});
test('legacy numeric output is not interpreted as current evidence or probability',()=>{
  const e=publicEvidence({authenticity_score:7.2,risk_score:92.8,signals:{version:'1.0'}});
  assert.equal(e.abstained,true);assert.equal(e.version,'legacy');assert.equal(e.model.authorshipProbability,null);
});
test('a multi-commit push waits for each individual commit and stops at a failure',async()=>{
  const visited=[];
  const db={query:async sql=>sql.startsWith('SELECT r.')?[{id:'repo',installation_id:'1',full_name:'test/repo'}]:sql.startsWith('INSERT')?[{id:'id',status:'queued'}]:[]};
  const github={installationToken:async()=>'',pages:async()=>[{sha:'one'},{sha:'two'},{sha:'three'}]};
  const analysis=new Analysis(db,github,{}, {}, {});
  analysis.commit=async(_,sha)=>{visited.push(sha);if(sha==='two')throw new Error('test failure');};
  await assert.rejects(analysis.process({name:'push',data:{repositoryId:'repo',before:'a',after:'b'}}));
  assert.deepEqual(visited,['one','two']);
});

test('continuity follows parents and excludes unrelated branches regardless of timestamps',()=>{
  const rows=[{sha:'a',parents:[]},{sha:'b',parents:['a']},{sha:'other',parents:['a']},{sha:'c',parents:['b']}];
  assert.deepEqual(ancestorHistory(rows,'c').map(r=>r.sha),['a','b','c']);
  assert.deepEqual(ancestorHistory(rows,'unknown'),[]);
});

test('a novel inconsistent module remains visible among consistent files',()=>{
  const s=style();
  s.files=[...Array.from({length:9},(_,i)=>file('src/existing'+i+'.py')),
    {...file('new/module.py'),imports:['import different_framework'],symbols:[],calls:[],comparison:{distance:5,changedFeatures:['snake_ratio','function_length']}}];
  const files=s.files.map(f=>({path:f.path,supported:true,status:'added',excluded:false}));
  const e=evidenceSummary(history(),s,{flagged:false},files,['sha11']);
  assert.equal(e.reviewRequested,true);assert.deepEqual(e.surfacedFiles,['new/module.py']);
  assert.equal(e.continuity.relatedFiles,9);
});
