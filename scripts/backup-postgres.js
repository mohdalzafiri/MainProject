'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createPostgresConfig, validatePostgresConfig } = require('../database/providers');
const { removeSync } = require('../utils/fsCompat');

const config = createPostgresConfig();
validatePostgresConfig(config);

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const backupDirectory = path.resolve(process.env.PG_BACKUP_DIR || path.join(__dirname, '..', 'Backups'));
const backupPath = path.join(backupDirectory, `postgres-${date}-${time}.dump`);
const temporaryPath = `${backupPath}.tmp-${process.pid}`;
fs.mkdirSync(backupDirectory, { recursive: true });

const args = ['--format=custom', '--no-owner', '--no-privileges', '--file', temporaryPath];
if (config.connectionString) {
  args.push('--dbname', config.connectionString);
} else {
  args.push('--host', config.host, '--port', String(config.port), '--username', config.user, '--dbname', config.database);
}

try {
  const result = spawnSync('pg_dump', args, { env: process.env, stdio: 'inherit', shell: false });
  if (result.error) {
    throw new Error(`Unable to run pg_dump. Install PostgreSQL client tools and add pg_dump to PATH. ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump failed with exit code ${result.status}`);
  }
  if (!fs.existsSync(temporaryPath) || fs.statSync(temporaryPath).size === 0) {
    throw new Error('pg_dump completed without creating a valid backup file.');
  }
  fs.renameSync(temporaryPath, backupPath);
  console.log(`PostgreSQL backup created: ${backupPath}`);
} finally {
  removeSync(temporaryPath, { force: true });
}