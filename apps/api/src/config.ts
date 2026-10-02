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
  /** Day boundaries (daily attempts, daily leaderboards) follow Indian time. */
  timeZone: 'Asia/Kolkata',
  authCookie: 'axia_token',
};
