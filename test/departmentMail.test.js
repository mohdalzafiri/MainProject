const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

test('creates DepartmentMail during production database startup', () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'department-mail-'));
  const databasePath = path.join(tempDirectory, 'test.db');
  new Database(databasePath).close();

  try {
    const script = `
      const { db, closeDatabase } = require('./database');
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'DepartmentMail'").get();
      if (!table) throw new Error('DepartmentMail table was not created');
      closeDatabase().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        DB_CLIENT: 'sqlite',
        DB_PATH: databasePath,
        DB_BACKUP_DIR: path.join(tempDirectory, 'backups')
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
