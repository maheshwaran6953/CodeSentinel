require('reflect-metadata');
const {test}=require('node:test');
const {readFileSync,readdirSync}=require('node:fs');
const {resolve}=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const {workflow}=require('./workflow.cjs');

test('PostgreSQL schema and complete analysis/quiz/override service contracts with real tree-sitter', {timeout:240000}, async()=>{
  process.env.PYTHON_EXECUTABLE ||= process.platform==='win32'?resolve('.venv/Scripts/python.exe'):'python';
  const pg=new PGlite({extensions:{pgcrypto}});
  try {
    for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())await pg.exec(readFileSync('migrations/'+f,'utf8'));
    const adapter=client=>({query:async(sql,args=[]) => (await client.query(sql,args)).rows});
    const db={...adapter(pg),source:{transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))}};
    await workflow(db);
  } finally {await pg.close();}
});
