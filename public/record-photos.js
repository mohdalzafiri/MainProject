(function () {
  function safeMessage(error, fallback) {
    const text = String(error && error.message ? error.message : '').trim();
    return text || fallback;
  }

  function parseJsonSafe(response) {
    return response.json().catch(function () {
      return {};
    });
  }

  function initRecordPhotos(options) {
    const opts = options || {};
    const moduleKey = String(opts.moduleKey || '').trim();
    const authToken = String(opts.authToken || '').trim();
    const getRecordId = typeof opts.getRecordId === 'function' ? opts.getRecordId : function () { return null; };
    const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};

    const fileInput = document.getElementById('docImageInput');
    const uploadBtn = document.getElementById('docImageUploadBtn');
    const prevBtn = document.getElementById('docImagePrevBtn');
    const nextBtn = document.getElementById('docImageNextBtn');
    const imageEl = document.getElementById('docImagePreview');
    const emptyEl = document.getElementById('docImageEmpty');
    const countEl = document.getElementById('docImageCount');

    if (!moduleKey || !authToken || !fileInput || !uploadBtn || !prevBtn || !nextBtn || !imageEl || !emptyEl || !countEl) {
      return {
        load: function () {},
        clear: function () {}
      };
    }

    var images = [];
    var index = 0;

    function getRecordIdValue() {
      var raw = getRecordId();
      var value = Number(raw || 0);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function apiUrl(recordId) {
      return '/api/attachments/' + encodeURIComponent(moduleKey) + '/' + encodeURIComponent(String(recordId));
    }

    function setCountText() {
      if (!images.length) {
        countEl.textContent = '0 / 0';
        return;
      }
      countEl.textContent = String(index + 1) + ' / ' + String(images.length);
    }

    function render() {
      var hasImages = images.length > 0;
      imageEl.style.display = hasImages ? 'block' : 'none';
      emptyEl.style.display = hasImages ? 'none' : 'block';

      if (hasImages) {
        var current = images[index];
        imageEl.src = current.url + '?t=' + Date.now();
        imageEl.alt = current.fileName || 'صورة مستند';
      } else {
        imageEl.removeAttribute('src');
        imageEl.alt = '';
      }

      prevBtn.disabled = !hasImages || index <= 0;
      nextBtn.disabled = !hasImages || index >= images.length - 1;
      setCountText();
    }

    function handleAuthFail() {
      localStorage.removeItem('authToken');
      window.location.href = '/';
    }

    async function load() {
      var recordId = getRecordIdValue();
      if (!recordId) {
        images = [];
        index = 0;
        emptyEl.textContent = 'اختر سجلًا أولًا لعرض صور المستندات.';
        render();
        return;
      }

      try {
        var response = await fetch(apiUrl(recordId), {
          headers: {
            Authorization: 'Bearer ' + authToken
          }
        });

        if (response.status === 401 || response.status === 403) {
          handleAuthFail();
          return;
        }

        var payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw new Error(String(payload.message || '').trim() || 'تعذر تحميل صور المستندات.');
        }

        images = Array.isArray(payload.images) ? payload.images : [];
        if (index >= images.length) {
          index = images.length ? images.length - 1 : 0;
        }

        emptyEl.textContent = 'لا توجد صور مرفوعة لهذا السجل حتى الآن.';
        render();
      } catch (error) {
        onStatus(safeMessage(error, 'تعذر تحميل صور المستندات.'), true);
      }
    }

    function clear() {
      images = [];
      index = 0;
      emptyEl.textContent = 'اختر سجلًا أولًا لعرض صور المستندات.';
      render();
    }

    uploadBtn.addEventListener('click', function () {
      var recordId = getRecordIdValue();
      if (!recordId) {
        onStatus('احفظ السجل أولًا أو اختر سجلًا من الجدول قبل رفع صورة المستند.', true);
        return;
      }
      fileInput.click();
    });

    fileInput.addEventListener('change', async function () {
      var recordId = getRecordIdValue();
      var file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (!recordId || !file) return;

      if (!String(file.type || '').toLowerCase().startsWith('image/')) {
        onStatus('نوع الملف غير مدعوم. يرجى تصوير أو اختيار ملف صورة.', true);
        fileInput.value = '';
        return;
      }

      var formData = new FormData();
      formData.append('image', file);

      try {
        var response = await fetch(apiUrl(recordId), {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + authToken
          },
          body: formData
        });

        if (response.status === 401 || response.status === 403) {
          handleAuthFail();
          return;
        }

        var payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw new Error(String(payload.message || '').trim() || 'تعذر رفع صورة المستند.');
        }

        fileInput.value = '';
        await load();
        if (images.length) {
          index = images.length - 1;
          render();
        }
        onStatus('تم رفع صورة المستند بنجاح.');
      } catch (error) {
        onStatus(safeMessage(error, 'تعذر رفع صورة المستند.'), true);
      }
    });

    prevBtn.addEventListener('click', function () {
      if (index > 0) {
        index -= 1;
        render();
      }
    });

    nextBtn.addEventListener('click', function () {
      if (index < images.length - 1) {
        index += 1;
        render();
      }
    });

    clear();

    return {
      load: load,
      clear: clear
    };
  }

  window.initRecordPhotos = initRecordPhotos;
})();
