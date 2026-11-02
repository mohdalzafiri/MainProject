const test = require('node:test');
const assert = require('node:assert/strict');

const allowanceSummary = require('../public/query-allowance-summary');

test('formats permission usage and remaining balances in a single cell per measure', () => {
  const usageByEmployee = allowanceSummary.createUsageMap([
    {
      EmpID: 17,
      Name: 'موظف مكرر',
      permissionCount: 2,
      permissionMinutes: 150,
      lateMinutes: 45,
      remainingPermissionCount: 2,
      remainingPermissionMinutes: 570,
      remainingLateMinutes: 60
    },
    {
      EmpID: 18,
      Name: 'موظف مكرر',
      permissionCount: 1,
      permissionMinutes: 30,
      remainingPermissionCount: 3,
      remainingPermissionMinutes: 690
    }
  ]);
  const cells = allowanceSummary.getAllowanceCellValues({
    EmpID: 17,
    Name: 'موظف مكرر',
    Status: 'أذن'
  }, usageByEmployee);

  assert.deepEqual(cells, {
    permissions: '2 / 2',
    permissionHours: '2:30 / 9:30',
    lateMinutes: '',
    exceeded: {
      permissions: false,
      permissionHours: false,
      lateMinutes: false
    }
  });
});

test('shows only delay balances for attendance after absence', () => {
  const usageByEmployee = allowanceSummary.createUsageMap([
    {
      EmpID: 24,
      Name: 'موظف',
      lateMinutes: 45,
      remainingLateMinutes: 60
    }
  ]);

  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 24,
    Name: 'موظف',
    Status: 'حضور بعد غياب'
  }, usageByEmployee), {
    permissions: '',
    permissionHours: '',
    lateMinutes: '45 / 60',
    exceeded: {
      permissions: false,
      permissionHours: false,
      lateMinutes: false
    }
  });
});

test('uses allowance totals for the displayed record month within a selected date range', () => {
  const usageByEmployee = allowanceSummary.createUsageMap([
    {
      EmpID: 24,
      Name: 'موظف',
      UsageMonth: '2026-10',
      permissionCount: 3,
      permissionMinutes: 180,
      lateMinutes: 0,
      remainingPermissionCount: 1,
      remainingPermissionMinutes: 540,
      remainingLateMinutes: 105
    },
    {
      EmpID: 24,
      Name: 'موظف',
      UsageMonth: '2026-11',
      permissionCount: 1,
      permissionMinutes: 60,
      lateMinutes: 30,
      remainingPermissionCount: 3,
      remainingPermissionMinutes: 660,
      remainingLateMinutes: 75
    }
  ]);

  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 24,
    Name: 'موظف',
    Today: '2026/10/25',
    Status: 'أذن'
  }, usageByEmployee), {
    permissions: '3 / 1',
    permissionHours: '3:00 / 9:00',
    lateMinutes: '',
    exceeded: {
      permissions: false,
      permissionHours: false,
      lateMinutes: false
    }
  });

  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 24,
    Name: 'موظف',
    Today: '2026/11/02',
    Status: 'حضور بعد غياب'
  }, usageByEmployee), {
    permissions: '',
    permissionHours: '',
    lateMinutes: '30 / 75',
    exceeded: {
      permissions: false,
      permissionHours: false,
      lateMinutes: false
    }
  });
});

test('marks only allowance values that exceed their limits', () => {
  const usageByEmployee = allowanceSummary.createUsageMap([
    {
      EmpID: 31,
      Name: 'متجاوز',
      UsageMonth: '2026-10',
      permissionCount: 5,
      permissionMinutes: 721,
      lateMinutes: 106,
      remainingPermissionCount: 0,
      remainingPermissionMinutes: 0,
      remainingLateMinutes: 0,
      permissionCountExceeded: true,
      permissionTimeExceeded: true,
      lateExceeded: true
    },
    {
      EmpID: 32,
      Name: 'على الحد',
      UsageMonth: '2026-10',
      permissionCount: 4,
      permissionMinutes: 720,
      lateMinutes: 105,
      remainingPermissionCount: 0,
      remainingPermissionMinutes: 0,
      remainingLateMinutes: 0,
      permissionCountExceeded: false,
      permissionTimeExceeded: false,
      lateExceeded: false
    }
  ]);

  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 31,
    Name: 'متجاوز',
    Today: '2026/10/20',
    Status: 'أذن'
  }, usageByEmployee).exceeded, {
    permissions: true,
    permissionHours: true,
    lateMinutes: false
  });
  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 31,
    Name: 'متجاوز',
    Today: '2026/10/20',
    Status: 'حضور بعد غياب'
  }, usageByEmployee).exceeded, {
    permissions: false,
    permissionHours: false,
    lateMinutes: true
  });
  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 32,
    Name: 'على الحد',
    Today: '2026/10/20',
    Status: 'أذن'
  }, usageByEmployee).exceeded, {
    permissions: false,
    permissionHours: false,
    lateMinutes: false
  });
});

test('keeps allowance cells empty for other statuses and defaults missing balances', () => {
  const usageByEmployee = allowanceSummary.createUsageMap([]);
  assert.deepEqual(allowanceSummary.getAllowanceCellValues({
    EmpID: 30,
    Name: 'موظف بلا استخدام',
    Status: 'حضور'
  }, usageByEmployee), {
    permissions: '',
    permissionHours: '',
    lateMinutes: '',
    exceeded: {
      permissions: false,
      permissionHours: false,
      lateMinutes: false
    }
  });

  assert.deepEqual(allowanceSummary.getUsage({
    EmpID: 30,
    Name: 'موظف بلا استخدام'
  }, usageByEmployee), {
    permissionCount: 0,
    remainingPermissionCount: 4,
    permissionMinutes: 0,
    remainingPermissionMinutes: 720,
    lateMinutes: 0,
    remainingLateMinutes: 105,
    permissionCountExceeded: false,
    permissionTimeExceeded: false,
    lateExceeded: false
  });
});
