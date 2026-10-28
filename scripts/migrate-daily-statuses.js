'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const DAILY_TABLES = ['Daily1', 'Daily2', 'Daily3', 'Daily4'];
const CANONICAL_STATUSES = new Set([
  'حضور',
  'غياب',
  'حضور بعد غياب',
  'أذن',
  'تخفيف عمل',
  'اجازة',
  'دورة',
  'تكليف'
]);
const LEGACY_STATUS_MAP = Object.freeze({
  'استئذان': 'أذن',
  'إذن': 'أذن',
  'اذن': 'أذن',
  'تأخير': 'أذن',
  'تأخير+عقوبة': 'حضور بعد غياب',
  'طبية': 'اجازة',
  'رخصة': 'أذن',
  'إجازة': 'اجازة'
});

function getQuickCheckResult(database) {
  return database.pragma('quick_check', { simple: true });
}

function getStatusRows(database, table) {
  return database.prepare(`SELECT Status, COUNT(*) AS Count FROM ${table} GROUP BY Status`).all();
}

function getBackupFileName(date = new Date(), pid = process.pid) {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ].join('');
  return `database-before-status-migration-${timestamp}-${pid}.db`;
}

async function migrateDatabase(options) {
  const settings = options || {};
  const databasePath = path.resolve(String(settings.dbPath || '').trim());
  const backupDirectory = path.resolve(String(settings.backupDir || path.join(path.dirname(databasePath), 'Backups')));
  const hostName = String(settings.hostName || os.hostname()).trim().toUpperCase();

  if (!settings.dbPath) throw new Error('Database path is required.');
  if (hostName !== 'PC-SERVER') {
    throw new Error(`Run this migration on PC-SERVER only. Current host: ${hostName || 'unknown'}.`);
  }
  if (!fs.existsSync(databasePath)) throw new Error(`Database file does not exist: ${databasePath}`);

  const lockPath = `${databasePath}.api-lock`;
  if (fs.existsSync(lockPath)) {
    throw new Error(`The API server still owns the database lock: ${lockPath}. Stop the server before running this migration.`);
  }

  const database = new Database(databasePath, { fileMustExist: true, timeout: 15000 });
  try {
    if (getQuickCheckResult(database) !== 'ok') {
      throw new Error('SQLite integrity check failed before migration.');
    }

    const changes = [];
    const unknownStatuses = [];

    DAILY_TABLES.forEach((table) => {
      const tableExists = database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
      ).get(table);
      if (!tableExists) throw new Error(`Required daily table is missing: ${table}`);

      getStatusRows(database, table).forEach((row) => {
        if (row.Status === null) return;
        const rawStatus = String(row.Status);
        const normalizedStatus = rawStatus.trim();
        if (!normalizedStatus) return;

        let targetStatus = '';
        if (CANONICAL_STATUSES.has(normalizedStatus)) {
          targetStatus = normalizedStatus;
        } else {
          targetStatus = LEGACY_STATUS_MAP[normalizedStatus] || '';
        }

        if (!targetStatus) {
          unknownStatuses.push({ table, status: rawStatus, count: Number(row.Count) || 0 });
          return;
        }
        if (rawStatus !== targetStatus) {
          changes.push({
            table,
            sourceStatus: rawStatus,
            targetStatus,
            count: Number(row.Count) || 0
          });
        }
      });
    });

    if (unknownStatuses.length) {
      throw new Error(`Unmapped statuses found; no changes made: ${JSON.stringify(unknownStatuses)}`);
    }

    if (!changes.length) {
      return { changedRows: 0, changes: [], backupPath: null };
    }

    if (fs.existsSync(lockPath)) {
      throw new Error(`The API server acquired the database lock during preflight: ${lockPath}. No changes made.`);
    }

    fs.mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, getBackupFileName());
    if (fs.existsSync(backupPath)) throw new Error(`Backup already exists: ${backupPath}`);
    await database.backup(backupPath);

    const backupDatabase = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      if (getQuickCheckResult(backupDatabase) !== 'ok') {
        throw new Error(`Backup integrity check failed: ${backupPath}`);
      }
    } finally {
      backupDatabase.close();
    }

    if (fs.existsSync(lockPath)) {
      throw new Error(`The API server acquired the database lock before migration: ${lockPath}. Backup created; no changes made.`);
    }

    const updateStatus = {};
    DAILY_TABLES.forEach((table) => {
      updateStatus[table] = database.prepare(`UPDATE ${table} SET Status = ? WHERE Status = ?`);
    });

    const migrate = database.transaction(() => {
      let changedRows = 0;
      changes.forEach((change) => {
        const result = updateStatus[change.table].run(change.targetStatus, change.sourceStatus);
        changedRows += result.changes;
      });

      const remainingUnknownStatuses = [];
      DAILY_TABLES.forEach((table) => {
        getStatusRows(database, table).forEach((row) => {
          if (row.Status === null || !String(row.Status).trim()) return;
          if (!CANONICAL_STATUSES.has(String(row.Status))) {
            remainingUnknownStatuses.push({ table, status: String(row.Status), count: Number(row.Count) || 0 });
          }
        });
      });
      if (remainingUnknownStatuses.length) {
        throw new Error(`Non-canonical statuses remain; transaction rolled back: ${JSON.stringify(remainingUnknownStatuses)}`);
      }
      if (getQuickCheckResult(database) !== 'ok') {
        throw new Error('SQLite integrity check failed during migration; transaction rolled back.');
      }

      return changedRows;
    });

    const changedRows = migrate();
    return { changedRows, changes, backupPath };
  } finally {
    database.close();
  }
}

async function main() {
  const databasePath = process.argv[2];
  const backupDirectory = process.argv[3];
  if (!databasePath) {
    throw new Error('Usage: node scripts\\migrate-daily-statuses.js <database-path> [backup-directory]');
  }

  const result = await migrateDatabase({
    dbPath: databasePath,
    backupDir: backupDirectory,
    hostName: os.hostname()
  });

  if (!result.changedRows) {
    console.log('No legacy status values found. Database was not changed and no backup was needed.');
    return;
  }

  console.log(`Updated daily status rows: ${result.changedRows}`);
  result.changes.forEach((change) => {
    console.log(`${change.table}: ${JSON.stringify(change.sourceStatus)} -> ${change.targetStatus} (${change.count})`);
  });
  console.log(`Verified backup: ${result.backupPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Daily status migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { CANONICAL_STATUSES, LEGACY_STATUS_MAP, getBackupFileName, migrateDatabase };
