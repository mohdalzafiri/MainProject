const test = require('node:test');
const assert = require('node:assert/strict');
const {
  USER_NAME_TABLES,
  migrateUserNameRecords
} = require('../utils/migrateUserNameRecords');

function createDb(users, recordsByTable) {
  return {
    transaction(callback) {
      return callback;
    },
    prepare(sql) {
      if (/SELECT\s+Username,\s*Name\s+FROM Login/.test(sql)) {
        return { all: async () => users };
      }

      const table = sql.match(/UPDATE\s+([A-Za-z]+)\s+SET UserName/)[1];
      return {
        run: async (username, name) => {
          let changes = 0;
          recordsByTable[table].forEach((record) => {
            if (String(record.UserName || '').trim() === name) {
              record.UserName = username;
              changes += 1;
            }
          });
          return { changes };
        }
      };
    }
  };
}

test('migrates historical full names to usernames across user-name records', async () => {
  const records = Object.fromEntries(USER_NAME_TABLES.map((table) => [
    table,
    [{ UserName: ' نوره سلمان محمد بوحمد ' }, { UserName: 'nora' }, { UserName: 'اسم غير معروف' }]
  ]));
  const db = createDb([
    { Username: 'nora', Name: 'نوره سلمان محمد بوحمد' }
  ], records);

  const updated = await migrateUserNameRecords(db);

  assert.equal(updated, USER_NAME_TABLES.length);
  for (const table of USER_NAME_TABLES) {
    assert.deepEqual(records[table].map((record) => record.UserName), [
      'nora',
      'nora',
      'اسم غير معروف'
    ]);
  }
  assert.equal(await migrateUserNameRecords(db), 0);
});

test('does not rewrite ambiguous names or names that collide with another username', async () => {
  const records = Object.fromEntries(USER_NAME_TABLES.map((table) => [
    table,
    [{ UserName: 'اسم مشترك' }, { UserName: 'login-collision' }]
  ]));
  const db = createDb([
    { Username: 'first', Name: 'اسم مشترك' },
    { Username: 'second', Name: 'اسم مشترك' },
    { Username: 'login-collision', Name: 'اسم آخر' },
    { Username: 'third', Name: 'login-collision' }
  ], records);

  assert.equal(await migrateUserNameRecords(db), 0);
  for (const table of USER_NAME_TABLES) {
    assert.deepEqual(records[table].map((record) => record.UserName), [
      'اسم مشترك',
      'login-collision'
    ]);
  }
});
