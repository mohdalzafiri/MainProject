const test = require('node:test');
const assert = require('node:assert/strict');

const { getDelayMinutes, getPermissionDurationMinutes } = require('../utils/dailyMetrics');

test('permission beginning duration uses actual late arrival time', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    Type: 'بداية الدوام',
    InTime: '09:00'
  }), 60);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    Type: 'بداية الدوام',
    InTime: '09:30'
  }), 90);
});

test('permission ending duration uses actual early departure including midnight shifts', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    Type: 'نهاية الدوام',
    OutTime: '15:00'
  }), 60);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة عصر',
    Type: 'نهاية الدوام',
    OutTime: '23:00'
  }), 60);
});

test('invalid or out-of-shift permission times do not inflate monthly duration', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    Type: 'بداية الدوام',
    InTime: '07:00'
  }), 0);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    Type: 'نهاية الدوام',
    OutTime: '17:00'
  }), 0);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    Type: '',
    InTime: '10:00'
  }), 0);
});

test('lateness uses the original official period start', () => {
  assert.equal(getDelayMinutes({ Period: 'نوبة عصر', InTime: '17:15' }), 75);
  assert.equal(getDelayMinutes({ Period: 'نوبة صبح', InTime: '07:45' }), 0);
});
