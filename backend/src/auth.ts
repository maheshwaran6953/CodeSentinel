import { Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import axios from 'axios';
import { Database } from './database';
import { GitHub } from './github';
import { AuthRequest, Public } from './security';
import { production, required } from './config';

class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(1000) password!: string;
  @IsOptional() @IsBoolean() remember?: boolean;
}
const cookieOptions = () => ({ httpOnly: true, secure: production, sameSite: (production ? 'none' : 'lax') as 'none' | 'lax', path: '/' });
@Controller('auth')
export class AuthController {
  constructor(private db: Database, private github: GitHub, private jwt: JwtService) {}
  private async session(userId: string, res: Response, remember = false) {
    const id = randomUUID(); const seconds = remember ? 7 * 86400 : 8 * 3600;
    await this.db.query('DELETE FROM sessions WHERE expires_at<now()');
    await this.db.query('INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [id,userId,new Date(Date.now()+seconds*1000)]);
    const token = this.jwt.sign({}, { subject: userId, jwtid: id, expiresIn: seconds,
      secret: required('JWT_SECRET'), algorithm: 'HS256', audience: 'codesentinel', issuer: 'codesentinel' });
    res.cookie('session', token, { ...cookieOptions(), ...(remember ? { maxAge: seconds*1000 } : {}) });
  }
  @Public() @Get('github')
  githubLogin(@Res() res: Response) {
    const state = randomBytes(32).toString('hex');
    res.cookie('oauth_state', state, { httpOnly: true, secure: production, sameSite: 'lax', path: '/auth/github/callback', maxAge: 600000 });
    res.redirect(`https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: required('GITHUB_CLIENT_ID'), redirect_uri: required('GITHUB_CALLBACK_URL'), state })}`);
  }
  @Public() @Get('github/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const saved = req.cookies?.oauth_state;
    res.clearCookie('oauth_state', { path: '/auth/github/callback' });
    try {
      if (typeof state !== 'string' || typeof saved !== 'string' || state.length !== saved.length ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(saved)) || typeof code !== 'string') throw new Error('Invalid OAuth state');
      const tokens = await this.github.exchange({ code, redirect_uri: required('GITHUB_CALLBACK_URL') });
      const profile = await this.github.api('/user', tokens.access_token);
      const [user] = await this.db.query(`INSERT INTO users(github_id,github_login,name,email,role) VALUES ($1,$2,$3,$4,'student')
        ON CONFLICT(github_id) DO UPDATE SET github_login=excluded.github_login,name=excluded.name RETURNING id`,
      [String(profile.id), profile.login, profile.name || profile.login, profile.email || '']);
      await this.github.saveTokens(user.id, tokens);
      await this.session(user.id, res);
      res.redirect(`${required('FRONTEND_URL')}/auth/callback`);
    } catch { res.redirect(`${required('FRONTEND_URL')}/login?error=github_authorization_failed`); }
  }
  @Public() @Post('login')
  async faculty(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.headers.origin !== required('FRONTEND_URL')) throw new ForbiddenException('Untrusted request origin');
    let profile: any;
    try {
      const { data } = await axios.post(`${required('SUPABASE_URL')}/auth/v1/token?grant_type=password`,
        { email: body.email, password: body.password }, { timeout: 15000, headers: { apikey: required('SUPABASE_ANON_KEY') } });
      profile = data.user;
    } catch { throw new UnauthorizedException('Invalid email or password'); }
    const allowed = (process.env.FACULTY_EMAILS || '').toLowerCase().split(',').map(e => e.trim());
    if (!profile?.email_confirmed_at || !allowed.includes(profile.email?.toLowerCase())) throw new ForbiddenException('Faculty account has not been authorized by the administrator');
    const [user] = await this.db.query(`INSERT INTO users(supabase_id,name,email,role) VALUES ($1,$2,$3,'faculty')
      ON CONFLICT(supabase_id) DO UPDATE SET email=excluded.email RETURNING id,name,email,role`,
    [profile.id, profile.user_metadata?.name || profile.email, profile.email]);
    await this.session(user.id, res, body.remember);
    return user;
  }
  @Get('me') me(@Req() req: AuthRequest) { return { ...req.user, githubId: req.user.github_id }; }
  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.query('DELETE FROM sessions WHERE id=$1', [req.sessionId]);
    res.clearCookie('session', cookieOptions()); return { success: true };
  }
  @Get('installation-url') installation() { return { url: `https://github.com/apps/${required('GITHUB_APP_SLUG')}/installations/new` }; }
}
