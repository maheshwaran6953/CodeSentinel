import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Database } from './database';
import { AccessGuard } from './security';
import { GitHub } from './github';
import { AuthController } from './auth';
import { RepositoryController } from './repositories';
import { WebhookController } from './webhook';
import { AnalysisQueue } from './queue';
import { Analysis } from './analysis';
import { Stylometry } from './stylometry';
import { Llm } from './llm';
import { QuizController } from './quiz';
import { FacultyController, StudentController } from './dashboard';

@Module({ imports:[JwtModule.register({})],controllers:[AuthController,RepositoryController,WebhookController,QuizController,StudentController,FacultyController],
  providers:[Database,GitHub,AnalysisQueue,Analysis,Stylometry,Llm,{provide:APP_GUARD,useClass:AccessGuard}] })
export class AppModule {}
