(function (root, factory) {
  const summary = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = summary;
  }
  if (root) {
    root.QueryAllowanceSummary = summary;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const permissionCountLimit = 4;
  const permissionMinutesLimit = 12 * 60;
  const lateMinutesLimit = 105;
  const permissionStatuses = new Set(['أذن', 'استئذان', 'إذن', 'اذن']);

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getUsageMonth(value) {
    const match = String(value || '').trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})(?:-|$)/);
    return match ? `${match[1]}-${String(Number(match[2])).padStart(2, '0')}` : '';
  }

  function getCurrentDateValue() {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${pad2(currentDate.getMonth() + 1)}-${pad2(currentDate.getDate())}`;
  }

  function createUsageMap(records) {
    const usageByEmployee = new Map();
    (Array.isArray(records) ? records : []).forEach((usage) => {
      const empId = String(usage.EmpID || '').trim();
      const name = normalizeName(usage.Name);
      const month = String(usage.UsageMonth || '').trim();
      const suffix = month ? `:${month}` : '';
      if (empId) usageByEmployee.set(`emp:${empId}${suffix}`, usage);
      if (name) usageByEmployee.set(`name:${name}${suffix}`, usage);
    });
    return usageByEmployee;
  }

  function getUsage(item, usageByEmployee = new Map()) {
    const empId = String(item.EmpID || '').trim();
    const name = normalizeName(item.Name);
    const month = getUsageMonth(item.Today);
    const usage = (empId && month && usageByEmployee.get(`emp:${empId}:${month}`))
      || (month && usageByEmployee.get(`name:${name}:${month}`))
      || (empId && usageByEmployee.get(`emp:${empId}`))
      || usageByEmployee.get(`name:${name}`)
      || {};
    const permissionCount = Number(usage.permissionCount) || 0;
    const permissionMinutes = Number(usage.permissionMinutes) || 0;
    const lateMinutes = Number(usage.lateMinutes) || 0;

    return {
      permissionCount,
      remainingPermissionCount: Number.isFinite(Number(usage.remainingPermissionCount))
        ? Number(usage.remainingPermissionCount)
        : Math.max(0, permissionCountLimit - permissionCount),
      permissionMinutes,
      remainingPermissionMinutes: Number.isFinite(Number(usage.remainingPermissionMinutes))
        ? Number(usage.remainingPermissionMinutes)
        : Math.max(0, permissionMinutesLimit - permissionMinutes),
      lateMinutes,
      remainingLateMinutes: Number.isFinite(Number(usage.remainingLateMinutes))
        ? Number(usage.remainingLateMinutes)
        : Math.max(0, lateMinutesLimit - lateMinutes),
      permissionCountExceeded: typeof usage.permissionCountExceeded === 'boolean'
        ? usage.permissionCountExceeded
        : permissionCount > permissionCountLimit,
      permissionTimeExceeded: typeof usage.permissionTimeExceeded === 'boolean'
        ? usage.permissionTimeExceeded
        : permissionMinutes > permissionMinutesLimit,
      lateExceeded: typeof usage.lateExceeded === 'boolean'
        ? usage.lateExceeded
        : lateMinutes > lateMinutesLimit
    };
  }

  function formatHoursAndMinutes(value) {
    const minutes = Math.max(0, Number(value) || 0);
    return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
  }

  function formatUsagePair(used, remaining, formatter = String) {
    return `${formatter(used)} / ${formatter(remaining)}`;
  }

  function getAllowanceCellValues(item, usageByEmployee) {
    const status = String(item.Status || '').trim();
    const usage = getUsage(item, usageByEmployee);
    return {
      permissions: permissionStatuses.has(status)
        ? formatUsagePair(usage.permissionCount, usage.remainingPermissionCount)
        : '',
      permissionHours: permissionStatuses.has(status)
        ? formatUsagePair(usage.permissionMinutes, usage.remainingPermissionMinutes, formatHoursAndMinutes)
        : '',
      lateMinutes: status === 'حضور بعد غياب'
        ? formatUsagePair(usage.lateMinutes, usage.remainingLateMinutes)
        : '',
      exceeded: {
        permissions: permissionStatuses.has(status) && usage.permissionCountExceeded,
        permissionHours: permissionStatuses.has(status) && usage.permissionTimeExceeded,
        lateMinutes: status === 'حضور بعد غياب' && usage.lateExceeded
      }
    };
  }

  return Object.freeze({
    createUsageMap,
    formatHoursAndMinutes,
    getAllowanceCellValues,
    getCurrentDateValue,
    getUsage
  });
}));
