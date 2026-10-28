'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { migrateDatabase } = require('../scripts/migrate-daily-statuses');

function createDatabase(filePath) {
  const database = new Database(filePath);
  ['Daily1', 'Daily2', 'Daily3', 'Daily4'].forEach((table) => {
    database.exec(`CREATE TABLE ${table} (ID INTEGER PRIMARY KEY, Status TEXT, InTime TEXT, OutTime TEXT, Note TEXT)`);
  });
  return database;
}

test('migrates only approved legacy daily statuses and preserves other fields and blank statuses', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-status-migration-'));
  const databasePath = path.join(directory, 'database.db');
  const backupDirectory = path.join(directory, 'Backups');
  const database = createDatabase(databasePath);

  try {
    database.prepare('INSERT INTO Daily1 (ID, Status, InTime, OutTime, Note) VALUES (?, ?, ?, ?, ?)').run(
      1, 'تأخير', '08:15', '16:00', 'keep note'
    );
    database.prepare('INSERT INTO Daily2 (ID, Status, InTime, OutTime, Note) VALUES (?, ?, ?, ?, ?)').run(
      2, 'تأخير+عقوبة', '09:00', '15:30', 'keep penalty note'
    );
    database.prepare('INSERT INTO Daily3 (ID, Status, InTime, OutTime, Note) VALUES (?, ?, ?, ?, ?)').run(
      3, 'طبية', '08:00', '16:00', 'keep medical note'
    );
    database.prepare('INSERT INTO Daily4 (ID, Status, InTime, OutTime, Note) VALUES (?, ?, ?, ?, ?)').run(
      4, 'رخصة', '08:30', '16:00', 'keep license note'
    );
    database.prepare('INSERT INTO Daily4 (ID, Status, InTime, OutTime, Note) VALUES (?, ?, ?, ?, ?)').run(
      5, '', '08:00', '16:00', 'keep blank status'
    );
    database.prepare('INSERT INTO Daily1 (ID, Status, InTime, OutTime, Note) VALUES (?, ?, ?, ?, ?)').run(
      6, 'استئذان', '08:00', '16:00', 'keep legacy permission note'
    );
  } finally {
    database.close();
  }

  const result = await migrateDatabase({
    dbPath: databasePath,
    backupDir: backupDirectory,
    hostName: 'PC-SERVER'
  });

  assert.equal(result.changedRows, 5);
  assert.equal(fs.existsSync(result.backupPath), true);

  const migratedDatabase = new Database(databasePath, { readonly: true });
  const backupDatabase = new Database(result.backupPath, { readonly: true });
  try {
    assert.deepEqual(
      migratedDatabase.prepare('SELECT ID, Status, InTime, OutTime, Note FROM Daily1 ORDER BY ID').all(),
      [
        { ID: 1, Status: 'أذن', InTime: '08:15', OutTime: '16:00', Note: 'keep note' },
        { ID: 6, Status: 'أذن', InTime: '08:00', OutTime: '16:00', Note: 'keep legacy permission note' }
      ]
    );
    assert.equal(migratedDatabase.prepare('SELECT Status FROM Daily2 WHERE ID = 2').get().Status, 'حضور بعد غياب');
    assert.equal(migratedDatabase.prepare('SELECT Status FROM Daily3 WHERE ID = 3').get().Status, 'اجازة');
    assert.equal(migratedDatabase.prepare('SELECT Status FROM Daily4 WHERE ID = 4').get().Status, 'أذن');
    assert.equal(migratedDatabase.prepare('SELECT Status FROM Daily4 WHERE ID = 5').get().Status, '');
    assert.equal(backupDatabase.prepare('SELECT Status FROM Daily1 WHERE ID = 1').get().Status, 'تأخير');
  } finally {
    migratedDatabase.close();
    backupDatabase.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses to migrate when the server lock or an unknown status is present', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-status-migration-'));
  const databasePath = path.join(directory, 'database.db');
  const database = createDatabase(databasePath);

  try {
    database.prepare('INSERT INTO Daily1 (ID, Status) VALUES (?, ?)').run(1, 'حالة غير معروفة');
  } finally {
    database.close();
  }

  try {
    await assert.rejects(
      migrateDatabase({ dbPath: databasePath, hostName: 'OTHER-HOST' }),
      /Run this migration on PC-SERVER only/
    );

    fs.mkdirSync(`${databasePath}.api-lock`);
    await assert.rejects(
      migrateDatabase({ dbPath: databasePath, hostName: 'PC-SERVER' }),
      /Stop the server before running this migration/
    );
    fs.rmdirSync(`${databasePath}.api-lock`);

    await assert.rejects(
      migrateDatabase({ dbPath: databasePath, hostName: 'PC-SERVER' }),
      /Unmapped statuses found; no changes made/
    );
    const verification = new Database(databasePath, { readonly: true });
    try {
      assert.equal(verification.prepare('SELECT Status FROM Daily1 WHERE ID = 1').get().Status, 'حالة غير معروفة');
    } finally {
      verification.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
