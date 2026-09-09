import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { JwtService } from '@nestjs/jwt';
import { Database } from './database';
import { decrypt, encrypt } from './security';
import { required } from './config';

@Injectable()
export class GitHub {
  constructor(private db: Database, private jwt: JwtService) {}
  async api(path: string, token: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<any> {
    try {
      return (await axios({ url: `https://api.github.com${path}`, method, data, timeout: 20000,
        maxContentLength: 8 * 1024 * 1024,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
      })).data;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401) throw new UnauthorizedException('GitHub authorization expired; sign in again');
      throw new ServiceUnavailableException(status === 403 || status === 429 ? 'GitHub rate limit or permission restriction; retry later' : 'GitHub repository unavailable or access denied');
    }
  }
  async pages(path: string, token: string, field?: string): Promise<any[]> {
    const all: any[] = [];
    for (let page = 1; ; page++) {
      const data = await this.api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token);
      const items = field ? data[field] : data;
      all.push(...items);
      if (items.length < 100) return all;
      if (page >= 100) throw new ServiceUnavailableException('GitHub result exceeds supported pagination limit');
    }
  }
  async exchange(params: Record<string, string>): Promise<any> {
    try {
      const { data } = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: required('GITHUB_CLIENT_ID'), client_secret: required('GITHUB_CLIENT_SECRET'), ...params
      }, { timeout: 15000, headers: { Accept: 'application/json' } });
      if (!data.access_token) throw new Error('No access token');
      return data;
    } catch { throw new UnauthorizedException('GitHub authorization failed; please sign in again'); }
  }
  async saveTokens(userId: string, tokens: any) {
    await this.db.query(`UPDATE users SET github_token=$2,github_refresh_token=$3,github_token_expires_at=$4 WHERE id=$1`,
      [userId, encrypt(tokens.access_token), tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null]);
  }
  async userToken(userId: string): Promise<string> {
    // Lock the user row to avoid consuming a rotating refresh token twice.
    return this.db.source.transaction(async tx => {
      const [user] = await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (!user?.github_token) throw new UnauthorizedException('Sign in with GitHub first');
      if (user.github_token_expires_at && new Date(user.github_token_expires_at).getTime() < Date.now() + 60000) {
        if (!user.github_refresh_token) throw new UnauthorizedException('Sign in with GitHub again');
        const tokens = await this.exchange({ grant_type: 'refresh_token', refresh_token: decrypt(user.github_refresh_token) });
        await tx.query('UPDATE users SET github_token=$2,github_refresh_token=$3,github_token_expires_at=$4 WHERE id=$1',
          [userId, encrypt(tokens.access_token), encrypt(tokens.refresh_token), new Date(Date.now() + tokens.expires_in * 1000)]);
        return tokens.access_token;
      }
      return decrypt(user.github_token);
    });
  }
  async installationToken(installationId: string): Promise<string> {
    const token = this.jwt.sign({ iat: Math.floor(Date.now()/1000)-60 }, {
      privateKey: required('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n'), algorithm: 'RS256',
      issuer: required('GITHUB_APP_ID'), expiresIn: 540
    });
    const result = await this.api(`/app/installations/${installationId}/access_tokens`, token, 'POST');
    return result.token;
  }
  async repositories(userId: string) {
    const token = await this.userToken(userId);
    const installations = await this.pages('/user/installations', token, 'installations');
    const repos: any[] = [];
    for (const installation of installations.filter(i => String(i.app_id) === required('GITHUB_APP_ID') && !i.suspended_at)) {
      const available = await this.pages(`/user/installations/${installation.id}/repositories`, token, 'repositories');
      repos.push(...available.map(repo => ({ id: String(repo.id), installationId: String(installation.id),
        name: repo.name, owner: repo.owner.login, fullName: repo.full_name, description: repo.description || '',
        language: repo.language || 'Unknown', stars: repo.stargazers_count, forks: repo.forks_count,
        url: repo.html_url, lastUpdated: repo.updated_at, branches: null, isPrivate: repo.private,
        isArchived: repo.archived, defaultBranch: repo.default_branch })));
    }
    return repos;
  }
}
