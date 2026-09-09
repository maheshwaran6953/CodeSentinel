import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { required } from './config';

export const QUEUE_NAME = 'commit-analysis';
export function redisConnection() {
  const url = new URL(required('REDIS_URL'));
  if (!['redis:','rediss:'].includes(url.protocol)) throw new Error('REDIS_URL must be a Redis TCP URL, not an Upstash REST URL');
  return { host: url.hostname, port: Number(url.port || 6379), username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined, db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}), connectTimeout: 10000 };
}
@Injectable()
export class AnalysisQueue implements OnModuleDestroy {
  private logger = new Logger(AnalysisQueue.name);
  readonly queue = new Queue(QUEUE_NAME, { connection: { ...redisConnection(), maxRetriesPerRequest: 1 },
    defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 7*86400, count: 10000 }, removeOnFail: { age: 30*86400 } } });
  constructor() { this.queue.on('error', () => this.logger.error('Redis queue unavailable')); }
  async enqueue(name: string, id: string, data: unknown) {
    const existing = await this.queue.getJob(id);
    if (existing && await existing.getState() === 'failed') { await existing.retry(); return existing; }
    return this.queue.add(name, data, { jobId: id });
  }
  async onModuleDestroy() { await this.queue.close(); }
}
export function createWorker(handler: (job: Job) => Promise<unknown>) {
  const worker = new Worker(QUEUE_NAME, handler, { connection: { ...redisConnection(), maxRetriesPerRequest: null }, concurrency: 1 });
  const logger = new Logger('AnalysisWorker');
  worker.on('failed', job => logger.error(`Job ${job?.id} failed (attempt ${job?.attemptsMade}); see stored analysis status`));
  worker.on('error', () => logger.error('Worker Redis connection failed'));
  return worker;
}
