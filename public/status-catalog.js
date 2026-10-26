(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = catalog;
  }
  if (root) {
    root.MainProjectStatusCatalog = catalog;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const statuses = Object.freeze([
    'حضور',
    'غياب',
    'حضور بعد غياب',
    'أذن',
    'تخفيف عمل',
    'اجازة',
    'دورة',
    'تكليف'
  ]);

  const timedStatuses = Object.freeze(['حضور', 'حضور بعد غياب', 'أذن', 'تخفيف عمل']);
  const adjustmentDescriptions = Object.freeze(['بداية الدوام', 'نهاية الدوام']);

  function normalizeStatus(value) {
    const status = String(value || '').trim();
    if (['استئذان', 'إذن', 'اذن'].includes(status)) return 'أذن';
    if (status === 'إجازة') return 'اجازة';
    return status;
  }

  function isPermissionStatus(value) {
    return normalizeStatus(value) === 'أذن';
  }

  function isAdjustedStatus(value) {
    const status = normalizeStatus(value);
    return status === 'أذن' || status === 'تخفيف عمل';
  }

  function isAdjustmentDescription(value) {
    return adjustmentDescriptions.includes(String(value || '').trim());
  }

  function shiftTime(value, minutes) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '';
    const hours = Number(match[1]);
    const currentMinutes = Number(match[2]);
    if (hours > 23 || currentMinutes > 59) return '';

    const total = ((hours * 60) + currentMinutes + minutes + (24 * 60)) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function getAdjustedTimes(defaults, description) {
    const source = defaults || {};
    const inTime = String(source.inTime || '').trim();
    const outTime = String(source.outTime || '').trim();
    const normalizedDescription = String(description || '').trim();

    if (normalizedDescription === 'بداية الدوام') {
      return { inTime: shiftTime(inTime, 120), outTime };
    }
    if (normalizedDescription === 'نهاية الدوام') {
      return { inTime, outTime: shiftTime(outTime, -120) };
    }
    return { inTime, outTime };
  }

  return Object.freeze({
    statuses,
    timedStatuses,
    adjustmentDescriptions,
    normalizeStatus,
    isPermissionStatus,
    isAdjustedStatus,
    isAdjustmentDescription,
    shiftTime,
    getAdjustedTimes
  });
}));
