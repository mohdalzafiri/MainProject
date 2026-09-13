const path = require('path');
const { fork } = require('child_process');
const { dbClient, dbPath, logSystem } = require('../database');

const DEFAULT_RETENTION_COUNT = 30;
const DEFAULT_BACKUP_HOUR = 2;
let maintenanceTimer = null;
let maintenancePromise = null;
let completedDate = '';

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getBackupDirectory() {
  return path.resolve(process.env.DB_BACKUP_DIR || path.join(path.dirname(dbPath), 'Backups'));
}

async function runDailyDatabaseMaintenance() {
  if (dbClient === 'postgres') {
    console.log('PostgreSQL maintenance is external. Configure scheduled pg_dump backups on PC-SERVER.');
    return;
  }

  const dateKey = formatLocalDate();
  if (completedDate === dateKey) return;
  if (maintenancePromise) return maintenancePromise;

  maintenancePromise = new Promise((resolve) => {
    const worker = fork(path.join(__dirname, '..', 'scripts', 'database-maintenance-worker.js'), [], {
      env: {
        ...process.env,
        DATABASE_SOURCE_PATH: dbPath,
        DATABASE_BACKUP_DIRECTORY: getBackupDirectory(),
        DATABASE_BACKUP_DATE: dateKey,
        DATABASE_BACKUP_RETENTION_COUNT: String(process.env.DB_BACKUP_RETENTION_COUNT || DEFAULT_RETENTION_COUNT)
      },
      silent: true
    });
    let output = '';
    let errorOutput = '';

    worker.stdout.on('data', (chunk) => { output += chunk.toString(); });
    worker.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    worker.once('exit', async (code) => {
      const message = (code === 0 ? output : errorOutput || output).trim();
      if (code === 0) {
        completedDate = dateKey;
        console.log(message);
        (await logSystem({
          userName: 'system',
          role: 'system',
          action: 'Backup',
          page: 'Database',
          details: message
        }));
      } else {
        console.error(`Database maintenance failed: ${message || `worker exited with code ${code}`}`);
        try {
          (await logSystem({
            userName: 'system',
            role: 'system',
            action: 'Backup Failed',
            page: 'Database',
            details: message || `worker exited with code ${code}`
          }));
        } catch {
          // The database may be unavailable or damaged.
        }
      }
      maintenancePromise = null;
      resolve();
    });
  });

  return maintenancePromise;
}

function startDatabaseMaintenance() {
  if (dbClient === 'postgres') {
    console.log('SQLite backup worker disabled for PostgreSQL. Use npm run db:backup:postgres from a secured host.');
    return;
  }

  const configuredHour = Number(process.env.DB_BACKUP_HOUR);
  const backupHour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23
    ? configuredHour
    : DEFAULT_BACKUP_HOUR;
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(backupHour, 0, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

  maintenanceTimer = setTimeout(async () => {
    await runDailyDatabaseMaintenance();
    startDatabaseMaintenance();
  }, nextRun.getTime() - now.getTime());
  maintenanceTimer.unref();
}

async function stopDatabaseMaintenance() {
  if (maintenanceTimer) {
    clearTimeout(maintenanceTimer);
    maintenanceTimer = null;
  }
  if (maintenancePromise) {
    await maintenancePromise;
  }
}

module.exports = {
  runDailyDatabaseMaintenance,
  startDatabaseMaintenance,
  stopDatabaseMaintenance
};