const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MONTHLY_PERMISSION_COUNT_LIMIT,
  MONTHLY_PERMISSION_MINUTES_LIMIT,
  MONTHLY_LATE_MINUTES_LIMIT,
  getDelayMinutes,
  getPermissionDurationMinutes,
  getMonthlyAllowanceBalance
} = require('../utils/dailyMetrics');

test('monthly allowance limits match the daily entry rules', () => {
  assert.equal(MONTHLY_PERMISSION_COUNT_LIMIT, 4);
  assert.equal(MONTHLY_PERMISSION_MINUTES_LIMIT, 12 * 60);
  assert.equal(MONTHLY_LATE_MINUTES_LIMIT, 105);
});

test('monthly allowance balances clamp remaining values at zero', () => {
  assert.deepEqual(getMonthlyAllowanceBalance({
    permissionCount: 2,
    permissionMinutes: 150,
    lateMinutes: 45
  }), {
    remainingPermissionCount: 2,
    remainingPermissionMinutes: 570,
    remainingLateMinutes: 60,
    lateExceeded: false,
    permissionTimeExceeded: false,
    permissionCountExceeded: false
  });
  assert.deepEqual(getMonthlyAllowanceBalance({
    permissionCount: 5,
    permissionMinutes: 750,
    lateMinutes: 110
  }), {
    remainingPermissionCount: 0,
    remainingPermissionMinutes: 0,
    remainingLateMinutes: 0,
    lateExceeded: true,
    permissionTimeExceeded: true,
    permissionCountExceeded: true
  });
});

test('permission beginning duration uses actual late arrival time', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '09:00',
    OutTime: '16:00'
  }), 60);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '09:30',
    OutTime: '16:00'
  }), 90);
});

test('permission ending duration uses actual early departure including midnight shifts', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '08:00',
    OutTime: '15:00'
  }), 60);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة عصر',
    InTime: '16:00',
    OutTime: '23:00'
  }), 60);
});

test('permission duration is calculated from status times without a description', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '09:00',
    OutTime: '15:30'
  }), 90);
});

test('invalid or out-of-shift permission times do not inflate monthly duration', () => {
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '07:00',
    OutTime: '16:00'
  }), 0);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '08:00',
    OutTime: '17:00'
  }), 0);
  assert.equal(getPermissionDurationMinutes({
    Period: 'نوبة صبح',
    InTime: '10:00'
  }), 120);
});

test('lateness uses the original official period start', () => {
  assert.equal(getDelayMinutes({ Period: 'نوبة عصر', InTime: '17:15' }), 75);
  assert.equal(getDelayMinutes({ Period: 'نوبة صبح', InTime: '07:45' }), 0);
});
