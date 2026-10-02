import { Body, Controller, Get, Post, Req, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { IsString, Matches, IsOptional, IsUUID } from 'class-validator';
import { Database } from './database';
import { GitHub } from './github';
import { AnalysisQueue } from './queue';
import { AuthRequest, Roles } from './security';

class LinkDto {
  @IsString() @Matches(/^\d+$/) repositoryId!: string;
  @IsOptional() @IsUUID() teamId?: string;
}
@Controller('repositories') @Roles('student')
export class RepositoryController {
  constructor(private db: Database, private github: GitHub, private queue: AnalysisQueue) {}
  @Get() list(@Req() req: AuthRequest) { return this.github.repositories(req.user.id); }
  @Post('link') async link(@Req() req: AuthRequest, @Body() body: LinkDto) {
    if (!body.teamId && (await this.db.query('SELECT id FROM roster_students WHERE user_id=$1',[req.user.id])).length)
      throw new ForbiddenException('Enrolled students must link an approved team repository. Create or join your team first.');
    if (body.teamId) await this.requireTeamLead(body.teamId,req.user.id);
    const repo = (await this.github.repositories(req.user.id)).find(r => r.id === body.repositoryId && !r.isArchived);
    if (!repo) throw new NotFoundException('Repository not authorized. Install the GitHub App for this repository and refresh.');
    const token = await this.github.installationToken(repo.installationId);
    // Verify current installation access, never trust a client supplied owner or installation ID.
    await this.github.api(`/repos/${repo.fullName}`, token);
    const saved = await this.db.source.transaction(async tx => {
      // Recheck after the provider request and serialize with changes to team membership.
      if (body.teamId) {
        await tx.query('SELECT id FROM project_teams WHERE id=$1 FOR UPDATE',[body.teamId]);
        await this.requireTeamLead(body.teamId,req.user.id,tx);
        if ((await tx.query('SELECT id FROM repositories WHERE team_id=$1 AND github_id<>$2',[body.teamId,repo.id])).length)
          throw new ConflictException('This team already has a linked repository. Its existing evidence must be preserved.');
      } else if ((await tx.query('SELECT id FROM roster_students WHERE user_id=$1',[req.user.id])).length) {
        throw new ForbiddenException('Enrolled students must link an approved team repository.');
      }
      const [row] = await tx.query(`INSERT INTO repositories(github_id,student_id,installation_id,owner,name,full_name,default_branch,url,team_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(github_id) DO UPDATE SET active=true,installation_id=excluded.installation_id,
        owner=excluded.owner,name=excluded.name,full_name=excluded.full_name,default_branch=excluded.default_branch,
        team_id=excluded.team_id
        WHERE (repositories.student_id=excluded.student_id OR (excluded.team_id IS NOT NULL AND repositories.team_id=excluded.team_id))
        AND (repositories.team_id IS NULL OR repositories.team_id=excluded.team_id) RETURNING id`,
      [repo.id,req.user.id,repo.installationId,repo.owner,repo.name,repo.fullName,repo.defaultBranch,repo.url,body.teamId || null]);
      if (!row) throw new ConflictException('This repository is already linked to another student or team. Its history cannot be reassigned.');
      return row;
    });
    await this.queue.enqueue('sync', `sync-${saved.id}`, { repositoryId: saved.id });
    return { status: 'completed', message: 'Repository authorized through the GitHub App. History sync queued; awaiting signed webhook deliveries.' };
  }
  private async requireTeamLead(teamId: string, userId: string, db: Pick<Database,'query'> = this.db) {
    const [team] = await db.query(`SELECT t.id FROM project_teams t
      JOIN roster_students r ON r.id=t.lead_roster_id
      JOIN team_members m ON m.team_id=t.id AND m.roster_id=r.id AND m.status='accepted'
      WHERE t.id=$1 AND r.user_id=$2 AND t.approved=true`,[teamId,userId]);
    if (!team) throw new ForbiddenException('Only the verified lead of an approved team can link its repository.');
  }
}
