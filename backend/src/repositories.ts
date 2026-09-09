import { Body, Controller, Get, Post, Req, ConflictException, NotFoundException } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { Database } from './database';
import { GitHub } from './github';
import { AnalysisQueue } from './queue';
import { AuthRequest, Roles } from './security';

class LinkDto { @IsString() @Matches(/^\d+$/) repositoryId!: string; }
@Controller('repositories') @Roles('student')
export class RepositoryController {
  constructor(private db: Database, private github: GitHub, private queue: AnalysisQueue) {}
  @Get() list(@Req() req: AuthRequest) { return this.github.repositories(req.user.id); }
  @Post('link') async link(@Req() req: AuthRequest, @Body() body: LinkDto) {
    const repo = (await this.github.repositories(req.user.id)).find(r => r.id === body.repositoryId && !r.isArchived);
    if (!repo) throw new NotFoundException('Repository not authorized. Install the GitHub App for this repository and refresh.');
    const token = await this.github.installationToken(repo.installationId);
    // Verify current installation access, never trust a client supplied owner or installation ID.
    await this.github.api(`/repos/${repo.fullName}`, token);
    const [saved] = await this.db.query(`INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(github_id) DO UPDATE SET active=true,installation_id=excluded.installation_id,
      owner=excluded.owner,name=excluded.name,full_name=excluded.full_name,default_branch=excluded.default_branch
      WHERE repositories.student_id=excluded.student_id RETURNING id`,
    [repo.id,req.user.id,repo.installationId,repo.owner,repo.name,repo.fullName,repo.defaultBranch,repo.url]);
    if (!saved) throw new ConflictException('This repository is linked to another student');
    await this.queue.enqueue('sync', `sync-${saved.id}`, { repositoryId: saved.id });
    return { status: 'completed', message: 'Repository authorized through the GitHub App. History sync queued; awaiting signed webhook deliveries.' };
  }
}
