import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { Database } from './database';
import { required } from './config';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);
export interface Actor { id: string; name: string; email: string; role: 'student' | 'faculty'; github_id?: string; github_login?: string }
export interface AuthRequest extends Request { user: Actor; sessionId: string }
export function verifySignature(raw: Buffer | undefined, signature: string | undefined, secret: string): boolean {
  if (!raw || !signature || !/^sha256=[a-f\d]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function decrypt(value: string): string {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'hex'), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private db: Database) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride('public', [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin !== required('FRONTEND_URL')) {
      throw new ForbiddenException('Untrusted request origin');
    }
    let token: { sub: string; jti: string };
    try { token = this.jwt.verify(req.cookies?.session, { secret: required('JWT_SECRET'), algorithms: ['HS256'], audience: 'codesentinel', issuer: 'codesentinel' }); }
    catch { throw new UnauthorizedException('Please sign in'); }
    const [user] = await this.db.query(`SELECT u.id,u.name,u.email,u.role,u.github_id,u.github_login FROM users u
      JOIN sessions s ON s.user_id=u.id WHERE s.id=$1 AND u.id=$2 AND s.expires_at>now()`, [token.jti, token.sub]);
    if (!user) throw new UnauthorizedException('Session expired');
    req.user = user; req.sessionId = token.jti;
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException('This action is not permitted for your role');
    return true;
  }
}
