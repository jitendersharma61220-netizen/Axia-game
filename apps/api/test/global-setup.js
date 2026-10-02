const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async () => {
  require('./env');
  // Creates the test database if needed and applies all migrations.
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
};
