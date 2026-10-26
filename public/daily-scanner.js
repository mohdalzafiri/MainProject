(function (root) {
  var MAX_SCAN_PDF_BYTES = 55 * 1024 * 1024;

  function asciiBytes(value) {
    return new TextEncoder().encode(value);
  }

  function createPdfFromJpegs(pages) {
    if (!Array.isArray(pages) || !pages.length) {
      return Promise.reject(new Error('أضف صفحة واحدة على الأقل قبل إنشاء PDF.'));
    }

    var chunks = [];
    var offsets = [0];
    var byteLength = 0;

    function append(value) {
      var chunk = typeof value === 'string' ? asciiBytes(value) : value;
      chunks.push(chunk);
      byteLength += chunk.byteLength;
    }

    function addObject(id, content) {
      offsets[id] = byteLength;
      append(id + ' 0 obj\n' + content + '\nendobj\n');
    }

    append('%PDF-1.4\n');
    addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    var pageIds = pages.map(function (_, index) { return 3 + index * 3; });
    addObject(2, '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + pages.length + ' >>');

    pages.forEach(function (page, index) {
      var pageId = pageIds[index];
      var contentId = pageId + 1;
      var imageId = pageId + 2;
      var width = Math.max(1, Number(page.width) || 1);
      var height = Math.max(1, Number(page.height) || 1);
      var scale = Math.min(612 / width, 792 / height);
      var drawWidth = width * scale;
      var drawHeight = height * scale;
      var x = (612 - drawWidth) / 2;
      var y = (792 - drawHeight) / 2;
      var imageData = page.dataUrl.split(',')[1] || '';
      var binary = atob(imageData);
      var imageBytes = new Uint8Array(binary.length);
      for (var byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
        imageBytes[byteIndex] = binary.charCodeAt(byteIndex);
      }

      addObject(pageId, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ' + imageId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
      var content = 'q\n' + drawWidth.toFixed(2) + ' 0 0 ' + drawHeight.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm\n/Im0 Do\nQ\n';
      addObject(contentId, '<< /Length ' + asciiBytes(content).byteLength + ' >>\nstream\n' + content + 'endstream');
      offsets[imageId] = byteLength;
      append(imageId + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + imageBytes.byteLength + ' >>\nstream\n');
      append(imageBytes);
      append('\nendstream\nendobj\n');
    });

    var xrefOffset = byteLength;
    var xref = 'xref\n0 ' + (offsets.length) + '\n0000000000 65535 f \n';
    for (var objectIndex = 1; objectIndex < offsets.length; objectIndex += 1) {
      xref += String(offsets[objectIndex]).padStart(10, '0') + ' 00000 n \n';
    }
    append(xref + 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF');
    return Promise.resolve(new Blob(chunks, { type: 'application/pdf' }));
  }

  function initDailyScanner(options) {
    var opts = options || {};
    var authToken = String(opts.authToken || '');
    var canEdit = opts.canEdit !== false;
    var onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};
    var getRecordIdentity = typeof opts.getRecordIdentity === 'function' ? opts.getRecordIdentity : null;
    var getRecordApiBase = typeof opts.getApiBase === 'function' ? opts.getApiBase : null;
    var recordLabel = String(opts.recordLabel || 'اليومية');
    var input = document.getElementById('dailyScanInput');
    var captureButton = document.getElementById('dailyScanCaptureBtn');
    var addPageButton = document.getElementById('dailyScanAddBtn');
    var undoButton = document.getElementById('dailyScanUndoBtn');
    var saveButton = document.getElementById('dailyScanSaveBtn');
    var deleteButton = document.getElementById('dailyScanDeleteBtn');
    var canvas = document.getElementById('dailyScanCanvas');
    var canvasContext = canvas.getContext('2d');
    var pageCount = document.getElementById('dailyScanPageCount');
    var savedFile = document.getElementById('dailyScanSavedFile');
    var cornersHint = document.getElementById('dailyScanCornersHint');
    var pages = [];
    var currentRecord = null;
    var hasSavedPdf = false;
    var image = null;
    var corners = [];
    var activeCorner = -1;
    var requestToken = 0;

    if (!document.getElementById('dailyScannerStyle')) {
      var style = document.createElement('style');
      style.id = 'dailyScannerStyle';
      style.textContent = '.daily-scanner-panel{margin-top:14px;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc}.daily-scanner-panel h3{margin:0 0 8px}.daily-scanner-panel p{margin:8px 0;color:#475569}.daily-scanner-actions{display:flex;flex-wrap:wrap;gap:8px}.daily-scanner-panel canvas{display:block;width:auto;max-width:100%;height:auto;max-height:75vh;margin-top:10px;border:1px solid #cbd5e1;border-radius:8px;touch-action:none;background:#fff}.daily-scanner-panel a{display:block;margin-top:8px;direction:ltr;unicode-bidi:isolate}.daily-scanner-panel [hidden]{display:none!important}';
      document.head.appendChild(style);
    }

    function setStatus(message, isError) {
      onStatus(message, Boolean(isError));
    }

    function getApiBase() {
      if (!currentRecord) return '';
      if (getRecordApiBase) return String(getRecordApiBase(currentRecord) || '');
      return '/api/daily-scans/' + encodeURIComponent(currentRecord.table) + '/' + encodeURIComponent(String(currentRecord.id));
    }

    function drawPreview() {
      if (!image) return;
      canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (corners.length !== 4) return;

      canvasContext.save();
      canvasContext.fillStyle = 'rgba(239, 68, 68, .18)';
      canvasContext.beginPath();
      canvasContext.rect(0, 0, canvas.width, canvas.height);
      canvasContext.moveTo(corners[0].x, corners[0].y);
      canvasContext.lineTo(corners[1].x, corners[1].y);
      canvasContext.lineTo(corners[2].x, corners[2].y);
      canvasContext.lineTo(corners[3].x, corners[3].y);
      canvasContext.closePath();
      canvasContext.fill('evenodd');
      canvasContext.strokeStyle = '#16a34a';
      canvasContext.lineWidth = Math.max(3, canvas.width / 300);
      canvasContext.beginPath();
      corners.forEach(function (point, index) {
        if (index === 0) canvasContext.moveTo(point.x, point.y);
        else canvasContext.lineTo(point.x, point.y);
      });
      canvasContext.closePath();
      canvasContext.stroke();
      corners.forEach(function (point) {
        canvasContext.beginPath();
        canvasContext.arc(point.x, point.y, Math.max(12, canvas.width / 45), 0, Math.PI * 2);
        canvasContext.fillStyle = '#fff';
        canvasContext.fill();
        canvasContext.lineWidth = Math.max(3, canvas.width / 300);
        canvasContext.strokeStyle = '#16a34a';
        canvasContext.stroke();
      });
      canvasContext.restore();
    }

    function setPageCount() {
      pageCount.textContent = 'صفحات PDF: ' + pages.length;
      undoButton.disabled = pages.length === 0;
      saveButton.disabled = pages.length === 0 || !currentRecord || !canEdit;
    }

    function loadImage(file) {
      return new Promise(function (resolve, reject) {
        var objectUrl = URL.createObjectURL(file);
        var nextImage = new Image();
        nextImage.onload = function () {
          URL.revokeObjectURL(objectUrl);
          resolve(nextImage);
        };
        nextImage.onerror = function () {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('تعذر فتح الصورة. جرّب صورة بصيغة JPG أو PNG.'));
        };
        nextImage.src = objectUrl;
      });
    }

    function detectPaperBounds(sourceCanvas) {
      var sample = document.createElement('canvas');
      sample.width = 140;
      sample.height = 140;
      var sampleContext = sample.getContext('2d', { willReadFrequently: true });
      sampleContext.drawImage(sourceCanvas, 0, 0, sample.width, sample.height);
      var pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      var verticalEdges = [];
      var horizontalEdges = [];

      function gray(x, y) {
        var offset = (y * sample.width + x) * 4;
        return (pixels[offset] * 0.299) + (pixels[offset + 1] * 0.587) + (pixels[offset + 2] * 0.114);
      }

      for (var x = 2; x < sample.width - 2; x += 1) {
        var verticalScore = 0;
        for (var y = 10; y < sample.height - 10; y += 1) {
          verticalScore += Math.abs(gray(x + 1, y) - gray(x - 1, y));
        }
        verticalEdges.push(verticalScore / (sample.height - 20));
      }
      for (var y = 2; y < sample.height - 2; y += 1) {
        var horizontalScore = 0;
        for (var x = 10; x < sample.width - 10; x += 1) {
          horizontalScore += Math.abs(gray(x, y + 1) - gray(x, y - 1));
        }
        horizontalEdges.push(horizontalScore / (sample.width - 20));
      }

      function bestPair(scores) {
        var best = null;
        var min = Math.floor(scores.length * 0.03);
        var max = Math.ceil(scores.length * 0.97);
        var minDistance = Math.floor(scores.length * 0.5);
        for (var first = min; first < max; first += 1) {
          for (var second = first + minDistance; second < max; second += 1) {
            var score = scores[first] + scores[second];
            if (!best || score > best.score) best = { first: first, second: second, score: score };
          }
        }
        return best;
      }

      var vertical = bestPair(verticalEdges);
      var horizontal = bestPair(horizontalEdges);
      if (!vertical || !horizontal || vertical.score < 18 || horizontal.score < 18) return null;

      return {
        left: vertical.first + 2,
        right: vertical.second + 2,
        top: horizontal.first + 2,
        bottom: horizontal.second + 2
      };
    }

    function updateCanvas(imageElement) {
      var ratio = Math.min(1, 1600 / imageElement.naturalWidth, 2000 / imageElement.naturalHeight);
      canvas.width = Math.max(1, Math.round(imageElement.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(imageElement.naturalHeight * ratio));
      image = document.createElement('canvas');
      image.width = canvas.width;
      image.height = canvas.height;
      image.getContext('2d').drawImage(imageElement, 0, 0, canvas.width, canvas.height);
      var detected = detectPaperBounds(image);
      if (detected) {
        corners = [
          { x: canvas.width * detected.left / 140, y: canvas.height * detected.top / 140 },
          { x: canvas.width * detected.right / 140, y: canvas.height * detected.top / 140 },
          { x: canvas.width * detected.right / 140, y: canvas.height * detected.bottom / 140 },
          { x: canvas.width * detected.left / 140, y: canvas.height * detected.bottom / 140 }
        ];
        cornersHint.textContent = 'تم تحديد حدود تقريبية للورقة تلقائيًا. اسحب الزوايا الخضراء لتعديلها ثم أضف الصفحة.';
      } else {
        corners = [
          { x: canvas.width * 0.04, y: canvas.height * 0.04 },
          { x: canvas.width * 0.96, y: canvas.height * 0.04 },
          { x: canvas.width * 0.96, y: canvas.height * 0.96 },
          { x: canvas.width * 0.04, y: canvas.height * 0.96 }
        ];
        cornersHint.textContent = 'اسحب الزوايا الخضراء لتحديد حدود الورقة، ثم أضف الصفحة.';
      }
      canvas.hidden = false;
      cornersHint.hidden = false;
      addPageButton.disabled = false;
      drawPreview();
    }

    function solveLinearSystem(matrix, values) {
      var size = values.length;
      for (var column = 0; column < size; column += 1) {
        var pivot = column;
        for (var row = column + 1; row < size; row += 1) {
          if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
        }
        if (Math.abs(matrix[pivot][column]) < 1e-8) throw new Error('تعذر تحديد حدود الورقة. حرّك الزوايا ثم حاول مجددًا.');
        var matrixRow = matrix[column];
        matrix[column] = matrix[pivot];
        matrix[pivot] = matrixRow;
        var value = values[column];
        values[column] = values[pivot];
        values[pivot] = value;
        var divisor = matrix[column][column];
        for (var normalizeIndex = column; normalizeIndex < size; normalizeIndex += 1) matrix[column][normalizeIndex] /= divisor;
        values[column] /= divisor;
        for (var eliminateRow = 0; eliminateRow < size; eliminateRow += 1) {
          if (eliminateRow === column) continue;
          var factor = matrix[eliminateRow][column];
          for (var eliminateColumn = column; eliminateColumn < size; eliminateColumn += 1) {
            matrix[eliminateRow][eliminateColumn] -= factor * matrix[column][eliminateColumn];
          }
          values[eliminateRow] -= factor * values[column];
        }
      }
      return values;
    }

    function getPerspectiveTransform(width, height, points) {
      var destinations = [
        { x: 0, y: 0 }, { x: width, y: 0 },
        { x: width, y: height }, { x: 0, y: height }
      ];
      var matrix = [];
      var values = [];
      points.forEach(function (point, index) {
        var destination = destinations[index];
        matrix.push([destination.x, destination.y, 1, 0, 0, 0, -point.x * destination.x, -point.x * destination.y]);
        values.push(point.x);
        matrix.push([0, 0, 0, destination.x, destination.y, 1, -point.y * destination.x, -point.y * destination.y]);
        values.push(point.y);
      });
      var coefficients = solveLinearSystem(matrix, values);
      return function (x, y) {
        var denominator = coefficients[6] * x + coefficients[7] * y + 1;
        return {
          x: (coefficients[0] * x + coefficients[1] * y + coefficients[2]) / denominator,
          y: (coefficients[3] * x + coefficients[4] * y + coefficients[5]) / denominator
        };
      };
    }

    function drawTriangle(context, sourceImage, source, destination) {
      var x1 = source[0].x;
      var y1 = source[0].y;
      var x2 = source[1].x;
      var y2 = source[1].y;
      var x3 = source[2].x;
      var y3 = source[2].y;
      var denominator = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
      if (Math.abs(denominator) < 1e-8) return;

      var dx1 = destination[0].x;
      var dy1 = destination[0].y;
      var dx2 = destination[1].x;
      var dy2 = destination[1].y;
      var dx3 = destination[2].x;
      var dy3 = destination[2].y;
      var a = (dx1 * (y2 - y3) + dx2 * (y3 - y1) + dx3 * (y1 - y2)) / denominator;
      var c = (dx1 * (x3 - x2) + dx2 * (x1 - x3) + dx3 * (x2 - x1)) / denominator;
      var e = (dx1 * (x2 * y3 - x3 * y2) + dx2 * (x3 * y1 - x1 * y3) + dx3 * (x1 * y2 - x2 * y1)) / denominator;
      var b = (dy1 * (y2 - y3) + dy2 * (y3 - y1) + dy3 * (y1 - y2)) / denominator;
      var d = (dy1 * (x3 - x2) + dy2 * (x1 - x3) + dy3 * (x2 - x1)) / denominator;
      var f = (dy1 * (x2 * y3 - x3 * y2) + dy2 * (x3 * y1 - x1 * y3) + dy3 * (x1 * y2 - x2 * y1)) / denominator;

      context.save();
      context.beginPath();
      context.moveTo(dx1, dy1);
      context.lineTo(dx2, dy2);
      context.lineTo(dx3, dy3);
      context.closePath();
      context.clip();
      context.transform(a, b, c, d, e, f);
      context.drawImage(sourceImage, 0, 0);
      context.restore();
    }

    function cropPage() {
      var edgeWidth = Math.max(
        Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y),
        Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)
      );
      var edgeHeight = Math.max(
        Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y),
        Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)
      );
      var ratio = Math.min(1, 1400 / edgeWidth, 1900 / edgeHeight);
      var width = Math.max(1, Math.round(edgeWidth * ratio));
      var height = Math.max(1, Math.round(edgeHeight * ratio));
      var mapPoint = getPerspectiveTransform(width, height, corners);
      var output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      var context = output.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);

      var columns = 24;
      var rows = 32;
      for (var row = 0; row < rows; row += 1) {
        for (var column = 0; column < columns; column += 1) {
          var x0 = (width * column) / columns;
          var x1 = (width * (column + 1)) / columns;
          var y0 = (height * row) / rows;
          var y1 = (height * (row + 1)) / rows;
          var p00 = mapPoint(x0, y0);
          var p10 = mapPoint(x1, y0);
          var p11 = mapPoint(x1, y1);
          var p01 = mapPoint(x0, y1);
          drawTriangle(context, image, [p00, p10, p11], [
            { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }
          ]);
          drawTriangle(context, image, [p00, p11, p01], [
            { x: x0, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }
          ]);
        }
      }
      return { dataUrl: output.toDataURL('image/jpeg', 0.82), width: width, height: height };
    }

    function setRecord(record, table, force) {
      var nextRecord = record && record.ID && table
        ? {
          id: record.ID,
          table: table,
          key: getRecordIdentity
            ? String(getRecordIdentity(record, table) || record.ID)
            : [
              String(record.Today || '').trim().replace(/\//g, '-'),
              String(record.Department || '').trim(),
              String(record.Section || '').trim(),
              String(record.Period || '').trim()
            ].join('|')
        }
        : null;
      if (currentRecord && nextRecord
        && currentRecord.key === nextRecord.key
        && currentRecord.table === nextRecord.table) {
        return true;
      }
      if (!force && pages.length && !window.confirm('الصفحات المضافة لم تُحفظ بعد. هل تريد التخلص منها وتغيير السجل؟')) {
        return false;
      }
      requestToken += 1;
      pages = [];
      image = null;
      currentRecord = nextRecord;
      hasSavedPdf = false;
      canvas.hidden = true;
      cornersHint.hidden = true;
      addPageButton.disabled = true;
      captureButton.disabled = !currentRecord || !canEdit;
      deleteButton.hidden = true;
      savedFile.hidden = true;
      setPageCount();
      if (!currentRecord) {
        setStatus(String(opts.emptyMessage || ('اختر سجل ' + recordLabel + ' لفتح ملف المسح.')));
        return;
      }
      setStatus('جاري التحقق من ملف المسح المحفوظ...');
      loadSavedFile(requestToken);
      return true;
    }

    function clear() {
      setRecord(null, '', true);
    }

    async function loadSavedFile(token) {
      try {
        var response = await fetch(getApiBase(), {
          headers: { Authorization: 'Bearer ' + authToken }
        });
        if (token !== requestToken) return;
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.message || 'تعذر تحميل حالة ملف المسح.');
        hasSavedPdf = Boolean(payload.exists);
        savedFile.hidden = !payload.exists;
        if (payload.exists) {
          savedFile.textContent = 'تنزيل PDF: ' + payload.fileName;
          deleteButton.hidden = !canEdit;
          savedFile.onclick = function (event) {
            event.preventDefault();
            downloadSavedFile(payload.fileName).catch(function (error) {
              setStatus(error.message || 'تعذر تنزيل ملف المسح.', true);
            });
          };
          setStatus('تم تحميل ملف PDF المخصص لهذا السجل. يمكنك تنزيله أو استبداله.');
        } else {
          deleteButton.hidden = true;
          setStatus('التقط صفحة أو اختر صورة، وحدّد زوايا الورقة ثم أضفها إلى PDF.');
        }
      } catch (error) {
        if (token === requestToken) setStatus(error.message || 'تعذر تحميل ملف المسح.', true);
      }
    }

    async function downloadSavedFile(fileName) {
      var response = await fetch(getApiBase() + '/pdf', {
        headers: { Authorization: 'Bearer ' + authToken }
      });
      if (!response.ok) {
        var payload = await response.json().catch(function () { return {}; });
        throw new Error(payload.message || 'تعذر تنزيل ملف PDF.');
      }
      var blob = await response.blob();
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    captureButton.addEventListener('click', function () {
      if (!currentRecord) {
        setStatus('اختر سجلًا محفوظًا من ' + recordLabel + ' أولًا.', true);
        return;
      }
      input.click();
    });

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      if (!String(file.type || '').startsWith('image/')) {
        setStatus('اختر صورة بصيغة مدعومة لمسح المستند.', true);
        return;
      }
      loadImage(file).then(updateCanvas).catch(function (error) {
        setStatus(error.message || 'تعذر فتح الصورة.', true);
      });
    });

    canvas.addEventListener('pointerdown', function (event) {
      var bounds = canvas.getBoundingClientRect();
      var x = (event.clientX - bounds.left) * canvas.width / bounds.width;
      var y = (event.clientY - bounds.top) * canvas.height / bounds.height;
      activeCorner = corners.reduce(function (closest, point, index) {
        var previous = corners[closest];
        return Math.hypot(point.x - x, point.y - y) < Math.hypot(previous.x - x, previous.y - y) ? index : closest;
      }, 0);
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', function (event) {
      if (activeCorner < 0 || !image) return;
      var bounds = canvas.getBoundingClientRect();
      corners[activeCorner] = {
        x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
        y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height))
      };
      drawPreview();
    });

    function stopCornerMove() {
      activeCorner = -1;
    }
    canvas.addEventListener('pointerup', stopCornerMove);
    canvas.addEventListener('pointercancel', stopCornerMove);

    addPageButton.addEventListener('click', function () {
      if (!image || corners.length !== 4) return;
      try {
        pages.push(cropPage());
        image = null;
        canvas.hidden = true;
        cornersHint.hidden = true;
        addPageButton.disabled = true;
        setPageCount();
        setStatus('تمت إضافة الصفحة. التقط الصفحة التالية أو احفظ جميع الصفحات في PDF واحد.');
      } catch (error) {
        setStatus(error.message || 'تعذر تجهيز الصفحة. تحقق من حدود الورقة.', true);
      }
    });

    undoButton.addEventListener('click', function () {
      pages.pop();
      setPageCount();
      setStatus('تم حذف آخر صفحة من المسح غير المحفوظ.');
    });

    saveButton.addEventListener('click', async function () {
      if (!currentRecord || !pages.length) return;
      if (hasSavedPdf && !window.confirm('سيتم استبدال ملف PDF المحفوظ بملف الصفحات الجديدة. هل تريد المتابعة؟')) return;
      saveButton.disabled = true;
      setStatus('جاري إنشاء ملف PDF ورفعه...');
      try {
        var pdf = await createPdfFromJpegs(pages);
        if (pdf.size > MAX_SCAN_PDF_BYTES) {
          throw new Error('حجم ملف PDF كبير جدًا. احذف بعض الصفحات أو التقط الصور بدقة أقل ثم حاول مرة أخرى.');
        }
        var formData = new FormData();
        formData.append('pdf', pdf, 'daily-scan.pdf');
        var response = await fetch(getApiBase(), {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + authToken },
          body: formData
        });
        var responseText = await response.text();
        var payload = {};
        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          payload = {};
        }
        if (!response.ok) {
          var fallbackMessage = response.status === 413
            ? 'حجم ملف PDF أكبر من الحد المسموح. احذف بعض الصفحات ثم حاول مرة أخرى.'
            : 'تعذر رفع ملف PDF إلى الخادم. رمز الخطأ: ' + response.status;
          throw new Error(payload.message || fallbackMessage);
        }
        pages = [];
        hasSavedPdf = true;
        setPageCount();
        await loadSavedFile(requestToken);
        setStatus('تم حفظ المستندات في ملف PDF واحد باسم ' + payload.fileName);
      } catch (error) {
        setStatus(error.message || 'تعذر إنشاء أو حفظ ملف PDF.', true);
        saveButton.disabled = pages.length === 0 || !currentRecord;
      }
    });

    deleteButton.addEventListener('click', async function () {
      if (!currentRecord || !window.confirm('هل تريد حذف ملف PDF المحفوظ لهذا السجل؟')) return;
      deleteButton.disabled = true;
      try {
        var response = await fetch(getApiBase(), {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + authToken }
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.message || 'تعذر حذف ملف PDF.');
        hasSavedPdf = false;
        savedFile.hidden = true;
        setStatus(payload.message || 'تم حذف ملف PDF.');
      } catch (error) {
        setStatus(error.message || 'تعذر حذف ملف PDF.', true);
      } finally {
        deleteButton.disabled = false;
      }
    });

    captureButton.disabled = true;
    deleteButton.hidden = true;
    setPageCount();
    return { setRecord: setRecord, clear: clear };
  }

  root.initDailyScanner = initDailyScanner;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createPdfFromJpegs: createPdfFromJpegs,
      MAX_SCAN_PDF_BYTES: MAX_SCAN_PDF_BYTES
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
