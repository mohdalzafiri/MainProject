const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeUtf8Mojibake,
  normalizeUserNameRecords
} = require('../public/text-encoding');

test('repairs Arabic text decoded as Latin-1', () => {
  const corrupted = Buffer.from('زينب', 'utf8').toString('latin1');
  assert.equal(decodeUtf8Mojibake(corrupted), 'زينب');
});

test('keeps valid Arabic and Latin usernames unchanged', () => {
  assert.equal(decodeUtf8Mojibake('نوره'), 'نوره');
  assert.equal(decodeUtf8Mojibake('admin'), 'admin');
});

test('normalizes only the UserName field in record lists', () => {
  const corrupted = Buffer.from('حصة', 'utf8').toString('latin1');
  const records = normalizeUserNameRecords([{ ID: 1, Name: 'موظف', UserName: corrupted }]);
  assert.deepEqual(records, [{ ID: 1, Name: 'موظف', UserName: 'حصة' }]);
});
