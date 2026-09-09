import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { required } from './config';

export function dataSource(): DataSource {
  return new DataSource({ type: 'postgres', url: required('DATABASE_URL'),
    ssl: process.env.DATABASE_SSL === 'true' ? {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_CA_FILE ? { ca: readFileSync(process.env.DATABASE_CA_FILE, 'utf8') } : {})
    } : false,
    synchronize: false, extra: { max: 8, connectionTimeoutMillis: 10000, statement_timeout: 30000 }
  });
}
@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  readonly source = dataSource();
  async onModuleInit() {
    await this.source.initialize();
    await this.query('SELECT id FROM users LIMIT 0');
  }
  query(sql: string, args: unknown[] = []): Promise<any[]> { return this.source.query(sql, args); }
  async onModuleDestroy() { if (this.source.isInitialized) await this.source.destroy(); }
}
