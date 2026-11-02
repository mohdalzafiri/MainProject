'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getThreshold,
  getQueryLabel,
  logSlowOperation,
  measureOperation,
  recordOperation,
  flushOperationMetrics,
} = require('../utils/performanceMetrics');

test('performance thresholds accept only positive finite values', () => {
  assert.equal(getThreshold('250', 100), 250);
  assert.equal(getThreshold('0', 100), 100);
  assert.equal(getThreshold('invalid', 100), 100);
});

test('slow-operation logging ignores operations below the configured threshold', () => {
  const originalWarn = console.warn;
  const messages = [];
  console.warn = (...args) => messages.push(args);
  try {
    assert.equal(logSlowOperation('database', 199, 200), false);
    assert.equal(logSlowOperation('database', 200, 200, { operation: 'all' }), true);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(messages.length, 1);
  assert.equal(messages[0][0], '[performance] slow operation');
  assert.deepEqual(JSON.parse(messages[0][1]), {
    kind: 'database',
    durationMs: 200,
    operation: 'all',
  });
});

test('operation measurement preserves results and propagates errors', async () => {
  assert.equal(await measureOperation('test', 1000, {}, async () => 'result'), 'result');
  await assert.rejects(
    measureOperation('test', 1000, {}, async () => {
      throw new Error('operation failed');
    }),
    /operation failed/
  );
});

test('query performance labels exclude parameter values and identify the table', () => {
  assert.equal(getQueryLabel('SELECT Name FROM Main WHERE CivilID = ?'), 'SELECT Main');
  assert.equal(getQueryLabel('INSERT INTO Daily1 (Name) VALUES (?)'), 'INSERT Daily1');
});

test('performance summaries include count, average, and p95 without retaining samples after flush', () => {
  const originalInfo = console.info;
  const messages = [];
  console.info = (...args) => messages.push(args);
  try {
    recordOperation('test', 'summary-test', 10);
    recordOperation('test', 'summary-test', 30);
    flushOperationMetrics();
  } finally {
    console.info = originalInfo;
  }

  const summary = JSON.parse(messages.find((entry) => entry[1].includes('summary-test'))[1]);
  assert.equal(summary.count, 2);
  assert.equal(summary.averageMs, 20);
  assert.equal(summary.p95Ms, 30);
});
