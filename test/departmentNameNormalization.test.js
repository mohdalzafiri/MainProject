const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

test('normalizes incident department names and user permissions during SQLite startup', () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'department-name-normalization-'));
  const databasePath = path.join(tempDirectory, 'test.db');
  const seed = new Database(databasePath);

  seed.exec(`
    CREATE TABLE Main (ID INTEGER PRIMARY KEY, Department TEXT);
    INSERT INTO Main (Department) VALUES ('إدارة البلاغات'), ('ادارة البلاغات'), ('الإحصاء');

    CREATE TABLE DepartmentSectionLookup (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Department TEXT NOT NULL,
      Section TEXT NOT NULL,
      SubSection TEXT NOT NULL DEFAULT '',
      SortOrder INTEGER NOT NULL DEFAULT 0,
      IsActive INTEGER NOT NULL DEFAULT 1,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL,
      UNIQUE(Department, Section, SubSection)
    );
    INSERT INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
      VALUES ('إدارة البلاغات', 'أ - البلاغات', '', 3, 0, '2026-01-01', '2026-01-01');
    INSERT INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
      VALUES ('ادارة البلاغات', 'أ - البلاغات', '', 2, 1, '2026-01-01', '2026-01-01');

    CREATE TABLE Login (
      ID INTEGER PRIMARY KEY,
      Username TEXT NOT NULL,
      Password TEXT NOT NULL,
      Permission TEXT,
      Department TEXT,
      Section TEXT,
      AllowedDepartments TEXT
    );
    INSERT INTO Login (Username, Password, Permission, Department, Section, AllowedDepartments)
      VALUES ('test', 'test', 'User', 'إدارة البلاغات', 'أ - البلاغات', '["إدارة البلاغات"]');
  `);
  seed.close();

  try {
    const script = `
      const assert = require('node:assert/strict');
      const { db, closeDatabase } = require('./database');
      (async () => {
        assert.deepEqual(
          (await db.prepare('SELECT Department FROM Main ORDER BY ID').all()).map(row => row.Department),
          ['ادارة البلاغات', 'ادارة البلاغات', 'الاحصاء']
        );
        const lookup = await db.prepare("SELECT Department, SortOrder, IsActive FROM DepartmentSectionLookup WHERE Department = 'ادارة البلاغات'").all();
        assert.deepEqual(lookup, [{ Department: 'ادارة البلاغات', SortOrder: 2, IsActive: 1 }]);
        const user = await db.prepare('SELECT Department, AllowedDepartments FROM Login WHERE Username = ?').get('test');
        assert.equal(user.Department, 'ادارة البلاغات');
        assert.deepEqual(JSON.parse(user.AllowedDepartments), ['ادارة البلاغات']);
        await closeDatabase();
      })().catch(error => {
        console.error(error);
        process.exitCode = 1;
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        DB_CLIENT: 'sqlite',
        DB_PATH: databasePath
      },
      encoding: 'utf8',
      timeout: 15000
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
