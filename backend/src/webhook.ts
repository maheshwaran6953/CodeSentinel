import { Controller, Headers, Post, Req, RawBodyRequest, UnauthorizedException, BadRequestException, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { Public, verifySignature } from './security';
import { required } from './config';
import { Database } from './database';
import { AnalysisQueue } from './queue';

@Controller('webhooks') @Public()
export class WebhookController {
  constructor(private db: Database, private queue: AnalysisQueue) {}
  @Post('github') @HttpCode(202)
  async github(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string, @Headers('x-github-delivery') delivery: string) {
    if (!verifySignature(req.rawBody, signature, required('GITHUB_WEBHOOK_SECRET'))) throw new UnauthorizedException('Invalid webhook signature');
    if (!delivery || !/^[a-zA-Z0-9-]{1,100}$/.test(delivery)) throw new BadRequestException('Missing or invalid delivery ID');
    if (event === 'ping') return { accepted: true, event };
    const payload = req.body;
    if (event === 'installation' && ['deleted','suspend'].includes(payload.action)) {
      await this.db.query('UPDATE repositories SET active=false WHERE installation_id=$1', [String(payload.installation?.id)]);
      return { accepted: true };
    }
    if (event === 'installation_repositories' && payload.action === 'removed') {
      for (const repo of payload.repositories_removed || []) await this.db.query('UPDATE repositories SET active=false WHERE github_id=$1 AND installation_id=$2', [String(repo.id), String(payload.installation?.id)]);
      return { accepted: true };
    }
    if (event !== 'push' && event !== 'pull_request') return { ignored: true };
    const [repo] = await this.db.query('SELECT * FROM repositories WHERE github_id=$1 AND installation_id=$2 AND active=true',
      [String(payload.repository?.id),String(payload.installation?.id)]);
    if (!repo) return { ignored: true, reason: 'Repository not linked or installation inactive' };
    await this.db.query('UPDATE repositories SET last_webhook_at=now() WHERE id=$1', [repo.id]);
    if (event === 'pull_request') {
      if (!['opened','synchronize','reopened'].includes(payload.action)) return { ignored: true };
      const number = payload.number;
      if (!Number.isSafeInteger(number) || number < 1) throw new BadRequestException('Invalid pull request number');
      await this.queue.enqueue('pull_request', `delivery-${delivery}`, { repositoryId: repo.id, number });
    } else if (!payload.deleted) {
      if (!/^[a-f\d]{40}$/.test(payload.after || '') || !/^[a-f\d]{40}$/.test(payload.before || '')) throw new BadRequestException('Invalid commit range');
      // Persist the range in Redis; the worker paginates GitHub, including payloads with truncated commit arrays.
      await this.queue.enqueue('push', `delivery-${delivery}`, { repositoryId: repo.id, before: payload.before, after: payload.after });
    }
    return { accepted: true };
  }
}
