const path = require('path');
const { fork } = require('child_process');
const { dbPath, logSystem } = require('../database');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_COUNT = 30;
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
    worker.once('exit', (code) => {
      const message = (code === 0 ? output : errorOutput || output).trim();
      if (code === 0) {
        completedDate = dateKey;
        console.log(message);
        logSystem({
          userName: 'system',
          role: 'system',
          action: 'Backup',
          page: 'Database',
          details: message
        });
      } else {
        console.error(`Database maintenance failed: ${message || `worker exited with code ${code}`}`);
        try {
          logSystem({
            userName: 'system',
            role: 'system',
            action: 'Backup Failed',
            page: 'Database',
            details: message || `worker exited with code ${code}`
          });
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
  runDailyDatabaseMaintenance();
  maintenanceTimer = setInterval(runDailyDatabaseMaintenance, CHECK_INTERVAL_MS);
  maintenanceTimer.unref();
}

async function stopDatabaseMaintenance() {
  if (maintenanceTimer) {
    clearInterval(maintenanceTimer);
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