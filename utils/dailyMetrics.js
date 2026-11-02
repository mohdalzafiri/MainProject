const periodTimes = Object.freeze({
  'نوبة صبح': Object.freeze({ inTime: '08:00', outTime: '16:00' }),
  'نوبة عصر': Object.freeze({ inTime: '16:00', outTime: '00:00' }),
  'نوبة ليل': Object.freeze({ inTime: '00:00', outTime: '08:00' }),
  'صباحاً': Object.freeze({ inTime: '07:30', outTime: '14:30' })
});

const MONTHLY_PERMISSION_COUNT_LIMIT = 4;
const MONTHLY_PERMISSION_MINUTES_LIMIT = 12 * 60;
const MONTHLY_LATE_MINUTES_LIMIT = 105;

function getTimeMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function getPeriod(record) {
  return periodTimes[String(record.Period || '').trim()];
}

function getShiftDuration(period) {
  const start = getTimeMinutes(period.inTime);
  const end = getTimeMinutes(period.outTime);
  if (start === null || end === null) return null;
  return (end - start + (24 * 60)) % (24 * 60);
}

function getDelayMinutes(record) {
  const period = getPeriod(record);
  const expectedStart = period ? getTimeMinutes(period.inTime) : null;
  const actualStart = getTimeMinutes(record.InTime);
  if (expectedStart === null || actualStart === null) return 0;
  return Math.max(0, actualStart - expectedStart);
}

function getPermissionDurationMinutes(record) {
  const period = getPeriod(record);
  if (!period) return 0;

  const expectedStart = getTimeMinutes(period.inTime);
  const shiftDuration = getShiftDuration(period);
  if (expectedStart === null || shiftDuration === null) return 0;

  const actualStart = getTimeMinutes(record.InTime);
  const actualEnd = getTimeMinutes(record.OutTime);
  const startOffset = actualStart === null
    ? null
    : (actualStart - expectedStart + (24 * 60)) % (24 * 60);
  const endOffset = actualEnd === null
    ? null
    : (actualEnd - expectedStart + (24 * 60)) % (24 * 60);
  const lateStartMinutes = startOffset !== null && startOffset <= shiftDuration
    ? startOffset
    : 0;
  const earlyEndMinutes = endOffset !== null && endOffset <= shiftDuration
    ? shiftDuration - endOffset
    : 0;

  return lateStartMinutes + earlyEndMinutes;
}

function getMonthlyAllowanceBalance({ permissionCount = 0, permissionMinutes = 0, lateMinutes = 0 } = {}) {
  return {
    remainingPermissionCount: Math.max(0, MONTHLY_PERMISSION_COUNT_LIMIT - permissionCount),
    remainingPermissionMinutes: Math.max(0, MONTHLY_PERMISSION_MINUTES_LIMIT - permissionMinutes),
    remainingLateMinutes: Math.max(0, MONTHLY_LATE_MINUTES_LIMIT - lateMinutes),
    lateExceeded: lateMinutes > MONTHLY_LATE_MINUTES_LIMIT,
    permissionTimeExceeded: permissionMinutes > MONTHLY_PERMISSION_MINUTES_LIMIT,
    permissionCountExceeded: permissionCount > MONTHLY_PERMISSION_COUNT_LIMIT
  };
}

module.exports = {
  periodTimes,
  MONTHLY_PERMISSION_COUNT_LIMIT,
  MONTHLY_PERMISSION_MINUTES_LIMIT,
  MONTHLY_LATE_MINUTES_LIMIT,
  getDelayMinutes,
  getPermissionDurationMinutes,
  getMonthlyAllowanceBalance
};
