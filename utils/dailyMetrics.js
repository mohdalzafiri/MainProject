const periodTimes = Object.freeze({
  'نوبة صبح': Object.freeze({ inTime: '08:00', outTime: '16:00' }),
  'نوبة عصر': Object.freeze({ inTime: '16:00', outTime: '00:00' }),
  'نوبة ليل': Object.freeze({ inTime: '00:00', outTime: '08:00' }),
  'صباحاً': Object.freeze({ inTime: '07:30', outTime: '14:30' })
});

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

  const description = String(record.Type || '').trim();
  const expectedStart = getTimeMinutes(period.inTime);
  const expectedEnd = getTimeMinutes(period.outTime);
  const shiftDuration = getShiftDuration(period);

  if (description === 'بداية الدوام') {
    const actualStart = getTimeMinutes(record.InTime);
    if (expectedStart === null || actualStart === null) return 0;
    const duration = actualStart - expectedStart;
    return duration > 0 && duration <= shiftDuration ? duration : 0;
  }

  if (description === 'نهاية الدوام') {
    const actualEnd = getTimeMinutes(record.OutTime);
    if (expectedEnd === null || actualEnd === null) return 0;
    const duration = (expectedEnd - actualEnd + (24 * 60)) % (24 * 60);
    return duration > 0 && duration <= shiftDuration ? duration : 0;
  }

  return 0;
}

module.exports = {
  periodTimes,
  getDelayMinutes,
  getPermissionDurationMinutes
};
