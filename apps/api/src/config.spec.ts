import { productionConfigProblems } from './config';

describe('productionConfigProblems', () => {
  const good = {
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(48),
    GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
    DATABASE_URL: 'postgresql://x',
  };

  it('accepts a safe production config', () => {
    expect(productionConfigProblems(good)).toEqual([]);
  });

  it('ignores non-production environments', () => {
    expect(productionConfigProblems({ NODE_ENV: 'development' })).toEqual([]);
  });

  it('rejects weak secrets, missing Google client, and dev login', () => {
    const problems = productionConfigProblems({ ...good, JWT_SECRET: 'short', GOOGLE_CLIENT_ID: '', ALLOW_DEV_LOGIN: 'true' });
    expect(problems).toHaveLength(3);
  });
});
