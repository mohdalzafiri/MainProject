(function (root) {
  function initEmailScanner(options) {
    var opts = options || {};
    var emptyStatusMessage = 'اختر سجلًا محفوظًا لعرض البريد الإلكتروني.';
    var host = document.querySelector('.doc-images-box');
    if (!host) {
      throw new Error('تعذر العثور على مساحة البريد الإلكتروني في الواجهة.');
    }

    host.className = 'daily-scanner-panel email-scanner-panel';
    host.setAttribute('aria-labelledby', 'emailScannerTitle');
    host.innerHTML = `
      <div class="email-scanner-header">
        <h3 id="emailScannerTitle">البريد الإلكتروني</h3>
        <p id="dailyScanPageCount">صفحات PDF: 0</p>
      </div>
      <p>التقط صفحات البريد وحدّد زوايا الورقة، ثم أضف الصفحات واحفظها في ملف PDF واحد.</p>
      <div class="email-scanner-preview">
        <button type="button" class="email-scanner-nav" id="emailScannerPreviousBtn" aria-label="الصفحة السابقة" title="الصفحة السابقة" disabled>◀</button>
        <div class="email-scanner-stage">
          <div class="email-scanner-empty" id="emailScannerEmpty">اختر سجلًا أولًا لإضافة أو عرض البريد الإلكتروني.</div>
          <canvas id="dailyScanCanvas" hidden aria-label="معاينة صفحة البريد الإلكتروني وحدود الورقة"></canvas>
        </div>
        <button type="button" class="email-scanner-nav" id="emailScannerNextBtn" aria-label="الصفحة التالية" title="الصفحة التالية" disabled>▶</button>
      </div>
      <div class="daily-scanner-actions">
        <button type="button" class="btn primary" id="dailyScanCaptureBtn" disabled>التقاط / اختيار صفحة</button>
        <button type="button" class="btn success" id="dailyScanAddBtn" disabled>إضافة الصفحة المحددة</button>
        <button type="button" class="btn warning" id="dailyScanUndoBtn" disabled>حذف آخر صفحة</button>
        <button type="button" class="btn success" id="dailyScanSaveBtn" disabled>إنشاء وحفظ PDF</button>
        <button type="button" class="btn danger" id="dailyScanDeleteBtn" hidden>حذف PDF المحفوظ</button>
      </div>
      <input id="dailyScanInput" type="file" accept="image/*" capture="environment" hidden />
      <p id="dailyScanCornersHint" hidden>اسحب الزوايا الخضراء لتحديد حدود الورقة، ثم أضف الصفحة.</p>
      <a id="dailyScanSavedFile" href="#" hidden></a>
    `;

    var moduleKey = String(opts.moduleKey || '').trim().toLowerCase();
    var authToken = String(opts.authToken || '');
    var getRecordId = typeof opts.getRecordId === 'function' ? opts.getRecordId : function () { return null; };
    var getApiBase = typeof opts.getApiBase === 'function' ? opts.getApiBase : function (record) {
      return '/api/attachments/email-scans/' + encodeURIComponent(moduleKey) + '/' + encodeURIComponent(String(record.id));
    };
    var emptyLabel = document.getElementById('emailScannerEmpty');
    var canvas = document.getElementById('dailyScanCanvas');
    var savedFile = document.getElementById('dailyScanSavedFile');
    var scanner = root.initDailyScanner({
      authToken: authToken,
      canEdit: opts.canEdit !== false,
      previousPageButton: document.getElementById('emailScannerPreviousBtn'),
      nextPageButton: document.getElementById('emailScannerNextBtn'),
      recordLabel: 'البريد الإلكتروني',
      emptyMessage: emptyStatusMessage,
      getRecordIdentity: function (record) { return String(record.ID || ''); },
      getApiBase: getApiBase,
      onStatus: function (message, isError) {
        if (message === emptyStatusMessage && !isError) return;
        if (typeof opts.onStatus === 'function') opts.onStatus(message, isError);
      }
    });

    var visibilityObserver = new MutationObserver(function () {
      emptyLabel.hidden = !canvas.hidden;
      if (canvas.hidden && !savedFile.hidden) {
        emptyLabel.textContent = 'يوجد ملف PDF محفوظ لهذا السجل. استخدم رابط التنزيل أو احذف الملف لإعادة مسحه.';
      }
    });
    visibilityObserver.observe(canvas, { attributes: true, attributeFilter: ['hidden'] });
    visibilityObserver.observe(savedFile, { attributes: true, attributeFilter: ['hidden'] });

    return {
      clear: function () {
        emptyLabel.textContent = 'اختر سجلًا أولًا لإضافة أو عرض البريد الإلكتروني.';
        scanner.clear();
      },
      load: function () {
        var id = Number(getRecordId() || 0);
        if (!Number.isInteger(id) || id <= 0) {
          this.clear();
          return;
        }
        emptyLabel.textContent = 'التقط أو اختر صفحة لإضافتها إلى ملف البريد الإلكتروني.';
        scanner.setRecord({ ID: id }, moduleKey, true);
      }
    };
  }

  root.initEmailScanner = initEmailScanner;
}(typeof window !== 'undefined' ? window : globalThis));
