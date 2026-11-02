const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInsertStatement, buildUpdateStatement } = require('../utils/sqlStatementBuilders');

const columns = ['Name', 'Department', 'Status'];

test('buildInsertStatement includes only provided allowed columns in declared order', () => {
  assert.deepEqual(
    buildInsertStatement('Main', columns, {
      Status: 'نشط',
      Ignored: 'value',
      Name: 'موظف',
    }),
    {
      sql: 'INSERT INTO Main (Name,Status) VALUES (?,?)',
      values: ['موظف', 'نشط'],
    }
  );
});

test('buildUpdateStatement appends the record ID after provided values', () => {
  assert.deepEqual(
    buildUpdateStatement(
      'Main',
      columns,
      {
        Department: 'الإدارة',
        Name: 'موظف',
      },
      12
    ),
    {
      sql: 'UPDATE Main SET Name = ?, Department = ? WHERE ID = ?',
      values: ['موظف', 'الإدارة', 12],
    }
  );
});

test('statement builders return null when no allowed columns are provided', () => {
  assert.equal(buildInsertStatement('Main', columns, { Ignored: 'value' }), null);
  assert.equal(buildUpdateStatement('Main', columns, {}, 12), null);
});
