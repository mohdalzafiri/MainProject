const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function assertIntegrity(database) {
  const results = database.pragma('quick_check');
  const messages = results.map((row) => String(row.quick_check || '')).filter(Boolean);
  if (messages.length !== 1 || messages[0].toLowerCase() !== 'ok') {
    throw new Error(`Database integrity check failed: ${messages.join('; ') || 'unknown result'}`);
  }
}

function removeExpiredBackups(backupDirectory, retentionCount) {
  const backupFiles = fs.readdirSync(backupDirectory)
    .filter((name) => /^database-\d{4}-\d{2}-\d{2}\.db$/i.test(name))
    .sort((left, right) => right.localeCompare(left));

  backupFiles.slice(retentionCount).forEach((name) => {
    fs.rmSync(path.join(backupDirectory, name), { force: true });
  });
}

function removeStaleTemporaryBackups(backupDirectory) {
  fs.readdirSync(backupDirectory)
    .filter((name) => /^database-\d{4}-\d{2}-\d{2}\.db\.tmp-\d+$/i.test(name))
    .forEach((name) => {
      fs.rmSync(path.join(backupDirectory, name), { force: true });
    });
}

async function run() {
  const sourcePath = process.env.DATABASE_SOURCE_PATH;
  const backupDirectory = process.env.DATABASE_BACKUP_DIRECTORY;
  const dateKey = process.env.DATABASE_BACKUP_DATE;
  const configuredRetention = Number(process.env.DATABASE_BACKUP_RETENTION_COUNT || 30);
  const retentionCount = Number.isInteger(configuredRetention) && configuredRetention > 0 ? configuredRetention : 30;

  if (!sourcePath || !backupDirectory || !dateKey) {
    throw new Error('Database maintenance configuration is incomplete.');
  }

  fs.mkdirSync(backupDirectory, { recursive: true });
  removeStaleTemporaryBackups(backupDirectory);
  const backupPath = path.join(backupDirectory, `database-${dateKey}.db`);
  const temporaryPath = `${backupPath}.tmp-${process.pid}`;
  const sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true, timeout: 15000 });

  try {
    assertIntegrity(sourceDb);

    if (!fs.existsSync(backupPath)) {
      fs.rmSync(temporaryPath, { force: true });
      await sourceDb.backup(temporaryPath);
      const backupDb = new Database(temporaryPath, { readonly: true, fileMustExist: true });
      try {
        assertIntegrity(backupDb);
      } finally {
        backupDb.close();
      }
      fs.renameSync(temporaryPath, backupPath);
      console.log(`Created verified daily database backup: ${backupPath}`);
    } else {
      const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
      try {
        assertIntegrity(backupDb);
      } finally {
        backupDb.close();
      }
      console.log(`Daily database backup already exists and is valid: ${backupPath}`);
    }

    removeExpiredBackups(backupDirectory, retentionCount);
  } finally {
    sourceDb.close();
    fs.rmSync(temporaryPath, { force: true });
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});