const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPostgresConfig,
  createPostgresProvider,
  validatePostgresConfig
} = require('../database/providers');

function createFakePool(responses = []) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      return responses.shift() || { rows: [], rowCount: 0 };
    },
    async end() {}
  };
}

test('builds PostgreSQL configuration from PC host environment variables', () => {
  assert.deepEqual(createPostgresConfig({
    PGHOST: 'PC-SERVER',
    PGPORT: '5432',
    PGDATABASE: 'mainproject',
    PGUSER: 'mainproject_app',
    PGPASSWORD: 'secret'
  }), {
    host: 'PC-SERVER',
    port: 5432,
    database: 'mainproject',
    user: 'mainproject_app',
    password: 'secret'
  });
});

test('rejects incomplete PostgreSQL configuration without opening a connection', () => {
  assert.throws(() => validatePostgresConfig({ host: 'PC-SERVER' }), /database, user, password/);
});

test('PostgreSQL statements translate placeholders and preserve run result shape', async () => {
  const pool = createFakePool([{ rows: [{ id: 12 }], rowCount: 1 }]);
  const db = createPostgresProvider({
    config: { connectionString: 'postgres://unused' },
    pool
  });

  const result = await db.prepare('INSERT INTO Main (Name) VALUES (?)').run('Test');
  assert.deepEqual(result, { changes: 1, lastInsertRowid: 12 });
  assert.match(pool.calls[0].sql, /VALUES \(\$1\) RETURNING id$/);
  assert.deepEqual(pool.calls[0].values, ['Test']);
});

test('PostgreSQL get restores explicit alias casing', async () => {
  const pool = createFakePool([{ rows: [{ sessionid: 7 }], rowCount: 1 }]);
  const db = createPostgresProvider({
    config: { connectionString: 'postgres://unused' },
    pool
  });

  const row = await db.prepare('SELECT ID AS SessionID FROM RefreshSessions WHERE ID = ?').get(7);
  assert.deepEqual(row, { SessionID: 7 });
});

test('PostgreSQL restores conflicting column casing from result field origins', async () => {
  const pool = createFakePool([
    { rows: [{ '?column?': 1 }], rowCount: 1 },
    { rows: [{ exists: 1 }], rowCount: 1 },
    {
      rows: [
        { table_oid: 10, column_number: 2, js_key: 'Username' },
        { table_oid: 20, column_number: 3, js_key: 'UserName' }
      ],
      rowCount: 2
    },
    {
      rows: [{ username: 'admin' }],
      fields: [{ name: 'username', tableID: 10, columnID: 2 }],
      rowCount: 1
    }
  ]);
  const db = createPostgresProvider({ config: { connectionString: 'postgres://unused' }, pool });

  await db.initialize();
  const row = await db.prepare('SELECT Username FROM Login LIMIT 1').get();

  assert.deepEqual(row, { Username: 'admin' });
});

test('PostgreSQL emulates PRAGMA table_info through information_schema', async () => {
  const pool = createFakePool([{ rows: [{ name: 'username', type: 'text' }], rowCount: 1 }]);
  const db = createPostgresProvider({
    config: { connectionString: 'postgres://unused' },
    pool
  });

  const rows = await db.prepare('PRAGMA table_info(Login)').all();
  assert.deepEqual(rows, [{ name: 'username', type: 'text' }]);
  assert.match(pool.calls[0].sql, /information_schema\.columns/);
  assert.deepEqual(pool.calls[0].values, ['login']);
});