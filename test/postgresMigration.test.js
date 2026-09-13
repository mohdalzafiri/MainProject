const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { tableDefinition } = require('../scripts/migrate-sqlite-to-postgres');
const { translatePostgresSql } = require('../database/sqlCompatibility');

test('uses TEXT when an INTEGER-declared SQLite column contains text', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec('CREATE TABLE Transfer (ID INTEGER PRIMARY KEY, Enddate INTEGER)');
    sqlite.prepare('INSERT INTO Transfer (Enddate) VALUES (?)').run('2026/09/13');

    const definition = tableDefinition(sqlite, 'Transfer');

    assert.match(definition.sql, /"enddate" TEXT/);
  } finally {
    sqlite.close();
  }
});

test('all current SQLite views translate without residual SQLite functions', () => {
  const sourcePath = process.env.SQLITE_SOURCE_PATH || process.env.DB_PATH;
  if (!sourcePath) return;

  const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const views = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'view'").all();
    for (const view of views) {
      const body = String(view.sql || '').replace(/^\s*CREATE\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|\S+)\s+AS\s+/i, '');
      const translated = translatePostgresSql(body);
      assert.doesNotMatch(
        translated,
        /\b(?:strftime|ifnull|date)\s*\(/i,
        `Unsupported SQLite function remains in ${view.name}`
      );
      if (/\b[A-Za-z_][A-Za-z0-9_]*\.EmpID\s*=\s*[A-Za-z_][A-Za-z0-9_]*\.ID\b/i.test(body)) {
        assert.match(translated, /\.EmpID\s*=\s*CAST\([^)]*\.ID AS TEXT\)/i, `Employee ID join is not type-safe in ${view.name}`);
      }
    }
  } finally {
    sqlite.close();
  }
});