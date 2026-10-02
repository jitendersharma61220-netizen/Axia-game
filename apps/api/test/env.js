// Tests run against a dedicated database and Redis DB so they never touch dev data.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://axia:axia@localhost:5432/axia_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
process.env.JWT_SECRET = 'test-secret';
process.env.ALLOW_DEV_LOGIN = 'true';
process.env.ADMIN_EMAILS = 'admin@test.local';
process.env.GOOGLE_CLIENT_ID = '';
process.env.RATE_LIMIT_ALLOWLIST = '::ffff:127.0.0.1,127.0.0.1,::1';
process.env.SIGNUP_MODE = 'open';
