import 'dotenv/config';

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}
export const production = process.env.NODE_ENV === 'production';
export function validateConfig(): void {
  for (const name of ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'FRONTEND_URL',
    'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY',
    'GITHUB_APP_SLUG', 'GITHUB_CALLBACK_URL', 'GITHUB_WEBHOOK_SECRET']) required(name);
  if (required('JWT_SECRET').length < 32) throw new Error('JWT_SECRET must have at least 32 characters');
  if (!/^[a-f\d]{64}$/i.test(required('TOKEN_ENCRYPTION_KEY'))) throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters');
  const threshold = Number(process.env.VELOCITY_Z_THRESHOLD || 3);
  if (!Number.isFinite(threshold) || threshold<2 || threshold>10) throw new Error('VELOCITY_Z_THRESHOLD must be between 2 and 10');
  for (const name of ['FRONTEND_URL', 'GITHUB_CALLBACK_URL']) {
    const url = new URL(required(name));
    if (production && url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production`);
  }
}
