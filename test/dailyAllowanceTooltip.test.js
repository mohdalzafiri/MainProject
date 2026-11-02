const test = require('node:test');
const assert = require('node:assert/strict');

const allowanceTooltip = require('../public/daily-allowance-tooltip');

test('daily allowance tooltip shows monthly usage and remaining balances for shift date month', () => {
  const usageByEmployee = allowanceTooltip.createUsageMap([{
    EmpID: 31,
    Name: 'موظف اليوميات',
    permissionCount: 2,
    permissionMinutes: 155,
    lateMinutes: 48,
    remainingPermissionCount: 2,
    remainingPermissionMinutes: 565,
    remainingLateMinutes: 57
  }]);

  const tooltip = allowanceTooltip.buildTooltip({
    EmpID: 31,
    Name: 'موظف اليوميات',
    Today: '2026/08/16'
  }, usageByEmployee);

  assert.match(tooltip, /شهر 2026\/08 حسب تاريخ النوبة/);
  assert.match(tooltip, /الأذونات: 2 من 4 \(المتبقي 2\)/);
  assert.match(tooltip, /ساعات الإذن: 2 ساعة و35 دقيقة من 12 ساعة \(المتبقي 9 ساعة و25 دقيقة\)/);
  assert.match(tooltip, /دقائق التأخير: 48 من 105 \(المتبقي 57\)/);
});

test('daily allowance tooltip defaults to full balances without monthly records', () => {
  const tooltip = allowanceTooltip.buildTooltip({
    EmpID: 32,
    Name: 'موظف جديد',
    Today: '2026-10-30'
  }, new Map());

  assert.match(tooltip, /شهر 2026\/10 حسب تاريخ النوبة/);
  assert.match(tooltip, /الأذونات: 0 من 4 \(المتبقي 4\)/);
  assert.match(tooltip, /ساعات الإذن: 0 دقيقة من 12 ساعة \(المتبقي 12 ساعة\)/);
  assert.match(tooltip, /دقائق التأخير: 0 من 105 \(المتبقي 105\)/);
});
