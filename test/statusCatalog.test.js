const test = require('node:test');
const assert = require('node:assert/strict');

const statusCatalog = require('../public/status-catalog');

test('daily statuses use the required order', () => {
  assert.deepEqual(statusCatalog.statuses, [
    'حضور',
    'غياب',
    'حضور بعد غياب',
    'أذن',
    'تخفيف عمل',
    'اجازة',
    'دورة',
    'تكليف'
  ]);
});

test('historical permission values normalize to أذن', () => {
  ['استئذان', 'إذن', 'اذن', 'أذن'].forEach((status) => {
    assert.equal(statusCatalog.normalizeStatus(status), 'أذن');
    assert.equal(statusCatalog.isPermissionStatus(status), true);
  });
});

test('work reduction indicators only apply to the work-reduction status', () => {
  assert.equal(statusCatalog.isWorkReductionStatus('تخفيف عمل'), true);
  ['اجازة', 'إجازة', 'دورة', 'حضور', 'غياب', 'أذن', 'تكليف'].forEach((status) => {
    assert.equal(statusCatalog.isWorkReductionStatus(status), false);
  });
});

test('beginning adjustment moves the original start forward two hours', () => {
  assert.deepEqual(
    statusCatalog.getAdjustedTimes({ inTime: '08:00', outTime: '16:00' }, 'بداية الدوام', 'تخفيف عمل'),
    { inTime: '10:00', outTime: '16:00' }
  );
});

test('ending adjustment moves the original end back two hours across midnight', () => {
  assert.deepEqual(
    statusCatalog.getAdjustedTimes({ inTime: '16:00', outTime: '00:00' }, 'نهاية الدوام', 'تخفيف عمل'),
    { inTime: '16:00', outTime: '22:00' }
  );
});

test('switching descriptions always recalculates from original defaults', () => {
  const defaults = { inTime: '00:00', outTime: '08:00' };
  assert.deepEqual(statusCatalog.getAdjustedTimes(defaults, 'بداية الدوام', 'تخفيف عمل'), {
    inTime: '02:00',
    outTime: '08:00'
  });
  assert.deepEqual(statusCatalog.getAdjustedTimes(defaults, 'نهاية الدوام', 'تخفيف عمل'), {
    inTime: '00:00',
    outTime: '06:00'
  });
});

test('permission descriptions do not adjust shift times', () => {
  const defaults = { inTime: '08:00', outTime: '16:00' };
  ['بداية الدوام', 'نهاية الدوام'].forEach((description) => {
    assert.deepEqual(statusCatalog.getAdjustedTimes(defaults, description, 'أذن'), defaults);
  });
  assert.deepEqual(statusCatalog.getAdjustedTimes(defaults, 'بداية الدوام', 'استئذان'), defaults);
});
