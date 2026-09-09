require('reflect-metadata');
const {test}=require('node:test');
const {randomUUID}=require('node:crypto');
const {Database}=require('../dist/database');
const {AnalysisQueue,createWorker}=require('../dist/queue');
const {QueueEvents}=require('bullmq');
const {redisConnection,QUEUE_NAME}=require('../dist/queue');
const {workflow}=require('./workflow.cjs');

test('real PostgreSQL + Redis + BullMQ + AST workflow (GitHub/Groq fixture transport)',{
  timeout:240000,skip:!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL
},async()=>{
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
  process.env.REDIS_URL=process.env.TEST_REDIS_URL;
  const db=new Database();await db.onModuleInit();
  const queue=new AnalysisQueue();
  const events=new QueueEvents(QUEUE_NAME,{connection:redisConnection()});await events.waitUntilReady();
  let worker;
  try {
    await workflow(db,{run:async(analysis,data)=>{
      worker ||= createWorker(job=>analysis.process(job));
      const id='integration-'+randomUUID();
      const job=await queue.enqueue('commit',id,data);
      const duplicate=await queue.enqueue('commit',id,data);
      require('node:assert/strict').equal(duplicate.id,job.id);
      await job.waitUntilFinished(events,120000);
      await job.remove();
    }});
  } finally {await worker?.close();await events.close();await queue.onModuleDestroy();await db.onModuleDestroy();}
});
