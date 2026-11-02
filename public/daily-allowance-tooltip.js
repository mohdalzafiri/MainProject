(function (root, factory) {
  const tooltip = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = tooltip;
  }
  if (root) {
    root.DailyAllowanceTooltip = tooltip;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const permissionCountLimit = 4;
  const permissionMinutesLimit = 12 * 60;
  const lateMinutesLimit = 105;

  function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function createUsageMap(records) {
    const usageByEmployee = new Map();
    (Array.isArray(records) ? records : []).forEach((usage) => {
      const empId = String(usage.EmpID || '').trim();
      const name = normalizeName(usage.Name);
      if (empId) usageByEmployee.set(`emp:${empId}`, usage);
      if (name) usageByEmployee.set(`name:${name}`, usage);
    });
    return usageByEmployee;
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(value / 60);
    const remainingMinutes = value % 60;
    if (!hours) return `${remainingMinutes} دقيقة`;
    if (!remainingMinutes) return `${hours} ساعة`;
    return `${hours} ساعة و${remainingMinutes} دقيقة`;
  }

  function getUsage(item, usageByEmployee) {
    const empId = String(item.EmpID || '').trim();
    const name = normalizeName(item.Name);
    return (empId && usageByEmployee.get(`emp:${empId}`))
      || usageByEmployee.get(`name:${name}`)
      || {};
  }

  function getMonthLabel(value) {
    const match = String(value || '').trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-/);
    return match ? `${match[1]}/${String(match[2]).padStart(2, '0')}` : '';
  }

  function buildTooltip(item, usageByEmployee) {
    const usage = getUsage(item, usageByEmployee);
    const permissionCount = Number(usage.permissionCount) || 0;
    const permissionMinutes = Number(usage.permissionMinutes) || 0;
    const lateMinutes = Number(usage.lateMinutes) || 0;
    const remainingPermissionCount = Number.isFinite(Number(usage.remainingPermissionCount))
      ? Number(usage.remainingPermissionCount)
      : Math.max(0, permissionCountLimit - permissionCount);
    const remainingPermissionMinutes = Number.isFinite(Number(usage.remainingPermissionMinutes))
      ? Number(usage.remainingPermissionMinutes)
      : Math.max(0, permissionMinutesLimit - permissionMinutes);
    const remainingLateMinutes = Number.isFinite(Number(usage.remainingLateMinutes))
      ? Number(usage.remainingLateMinutes)
      : Math.max(0, lateMinutesLimit - lateMinutes);
    const month = getMonthLabel(item.Today);

    return [
      month ? `ملخص شهر ${month} حسب تاريخ النوبة` : 'ملخص الشهر حسب تاريخ النوبة',
      `الأذونات: ${permissionCount} من ${permissionCountLimit} (المتبقي ${remainingPermissionCount})`,
      `ساعات الإذن: ${formatDuration(permissionMinutes)} من 12 ساعة (المتبقي ${formatDuration(remainingPermissionMinutes)})`,
      `دقائق التأخير: ${lateMinutes} من ${lateMinutesLimit} (المتبقي ${remainingLateMinutes})`
    ].join('\n');
  }

  return Object.freeze({ createUsageMap, buildTooltip });
}));
