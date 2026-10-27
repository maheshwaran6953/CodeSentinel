const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

const migration=()=>readFileSync('migrations/006_secure_migration_tracking.sql','utf8');
const tracker="CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())";

test('migration tracking security preserves owner records, revokes browser access and safely repeats',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;");
  await pg.exec(tracker);
  await pg.query('INSERT INTO schema_migrations(name,applied_at) VALUES ($1,$2)',['001_initial.sql','2026-01-01T00:00:00Z']);
  await pg.exec('GRANT SELECT ON schema_migrations TO anon,authenticated');
  const before=(await pg.query('SELECT * FROM schema_migrations ORDER BY name')).rows;
  const privileges=async()=> (await pg.query("SELECT has_table_privilege('anon','public.schema_migrations','SELECT') AS anon_select,has_table_privilege('authenticated','public.schema_migrations','SELECT') AS authenticated_select")).rows[0];
  assert.deepEqual(await privileges(),{anon_select:true,authenticated_select:true});
  await pg.exec(migration());await pg.exec(migration());
  assert.equal((await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.schema_migrations'::regclass")).rows[0].relrowsecurity,true);
  assert.deepEqual(await privileges(),{anon_select:false,authenticated_select:false});
  assert.deepEqual((await pg.query('SELECT * FROM schema_migrations ORDER BY name')).rows,before);
  for(const role of ['anon','authenticated']) {
   await pg.exec('SET ROLE '+role);
   try {await assert.rejects(pg.query('SELECT name FROM public.schema_migrations'),e=>e.code==='42501');}
   finally {await pg.exec('RESET ROLE');}
  }
  // The existing runner must still record the just-applied migration as table owner.
  await pg.query('INSERT INTO schema_migrations(name) VALUES ($1)',['006_secure_migration_tracking.sql']);
  assert.deepEqual((await pg.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r=>r.name),['001_initial.sql','006_secure_migration_tracking.sql']);
 } finally {await pg.close();}
});

test('migration tracking security safely skips isolated databases with no runner tracker',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec(migration());await pg.exec(migration());
  assert.equal((await pg.query("SELECT to_regclass('public.schema_migrations') AS tracker")).rows[0].tracker,null);
 } finally {await pg.close();}
});

test('migration tracking security supports local PostgreSQL without Supabase browser roles',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec(tracker);
  await pg.query('INSERT INTO schema_migrations(name) VALUES ($1)',['001_initial.sql']);
  await pg.exec(migration());
  assert.equal((await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.schema_migrations'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,1);
 } finally {await pg.close();}
});
