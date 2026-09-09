import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataSource } from './database';

async function migrate() {
  const db = await dataSource().initialize();
  try {
    await db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(783241)");
      await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
      for (const file of readdirSync(resolve('migrations')).filter(f => f.endsWith('.sql')).sort()) {
        if ((await tx.query('SELECT name FROM schema_migrations WHERE name=$1', [file])).length) continue;
        await tx.query(readFileSync(resolve('migrations', file), 'utf8'));
        await tx.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        console.log(`Applied ${file}`);
      }
    });
  } finally { await db.destroy(); }
}
migrate().catch(() => { console.error('Migration failed. Verify DATABASE_URL, TLS configuration and database permissions.'); process.exitCode = 1; });
