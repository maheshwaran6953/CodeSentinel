import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { required, validateConfig } from './config';
import { Database } from './database';
import { AnalysisQueue } from './queue';

@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status === 404) { host.switchToHttp().getResponse().status(404).json({message:'Resource not found'}); return; }
    const response = error instanceof HttpException ? error.getResponse() : { message:'Service operation failed. Please retry or contact the administrator.' };
    host.switchToHttp().getResponse().status(status).json(typeof response==='string'?{message:response}:response);
  }
}
async function bootstrap() {
  validateConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule,{rawBody:true});
  app.useBodyParser('json',{limit:'5mb'});
  const express = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY === 'true') express.set('trust proxy',1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({origin:required('FRONTEND_URL'),credentials:true,methods:['GET','POST','OPTIONS']});
  app.use('/auth',rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
  app.use('/quizzes',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalFilters(new SafeErrors());
  express.get('/health', (_req: unknown,res: any)=>res.json({status:'ok'}));
  express.get('/health/ready',async (_req: unknown,res: any)=>{
    try { await app.get(Database).query('SELECT 1'); await (await app.get(AnalysisQueue).queue.client).ping(); res.json({status:'ready'}); }
    catch { res.status(503).json({status:'dependencies_unavailable'}); }
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000),'0.0.0.0');
}
bootstrap().catch(error=>{ console.error(error instanceof Error && error.message.startsWith('Missing required') ? error.message : 'Backend startup failed. Verify configuration, migrations and database/Redis availability.'); process.exitCode=1; });
