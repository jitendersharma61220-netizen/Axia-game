function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  get port() {
    return Number(process.env.PORT ?? 4000);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  get jwtSecret() {
    return required('JWT_SECRET');
  },
  get redisUrl() {
    return process.env.REDIS_URL ?? 'redis://localhost:6379';
  },
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? '';
  },
  get allowDevLogin() {
    return process.env.ALLOW_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';
  },
  get adminEmails() {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get webOrigin() {
    return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  },
  /** IPs exempt from rate limits (comma-separated). Used by tests; leave empty in production. */
  get rateLimitAllowlist() {
    return new Set((process.env.RATE_LIMIT_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  },
  /** `invite`: new users need an invite code or a friend's challenge link (closed beta). */
  get signupMode(): 'open' | 'invite' {
    return process.env.SIGNUP_MODE === 'invite' ? 'invite' : 'open';
  },
  /** Day boundaries (daily attempts, daily leaderboards) follow Indian time. */
  timeZone: 'Asia/Kolkata',
  authCookie: 'axia_token',
};

/**
 * Refuses to boot a production server with unsafe settings. Returns the list
 * of problems (empty = OK) so it can be unit-tested; main.ts throws on any.
 */
export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (!env.GOOGLE_CLIENT_ID) problems.push('GOOGLE_CLIENT_ID is required');
  if (env.ALLOW_DEV_LOGIN === 'true') problems.push('ALLOW_DEV_LOGIN must not be true in production');
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is required');
  return problems;
}
