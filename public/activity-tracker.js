(function () {
  const token = localStorage.getItem('authToken');
  if (!token) return;

  const pagePath = String(window.location.pathname || '/');
  const sentSearchValues = new Map();
  let searchDebounceTimer = null;
  let lastPrintAt = 0;

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sendClientEvent(action, details, target) {
    fetch('/api/system-log/client-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action,
        target: cleanText(target || pagePath),
        details: cleanText(details || '')
      })
    }).catch(function () {
      // Never block UI actions if telemetry cannot be sent.
    });
  }

  function trackPrint(details) {
    const now = Date.now();
    if (now - lastPrintAt < 1500) {
      return;
    }

    lastPrintAt = now;
    sendClientEvent('Print', details, pagePath);
  }

  function buildElementLabel(element) {
    if (!element) return '';
    const parts = [
      element.id || '',
      element.name || '',
      element.getAttribute('aria-label') || '',
      element.placeholder || '',
      element.textContent || ''
    ].map(cleanText).filter(Boolean);

    return parts.join(' | ').slice(0, 140);
  }

  function isSearchField(element) {
    if (!element) return false;

    const tag = String(element.tagName || '').toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return false;

    const type = String(element.type || '').toLowerCase();
    if (type === 'search') return true;

    const signature = [
      element.id,
      element.name,
      element.className,
      element.placeholder,
      element.getAttribute('aria-label')
    ].map(cleanText).join(' ').toLowerCase();

    return /search|filter|query|lookup|بحث|فلتر|تصفية/.test(signature);
  }

  function trackSearchElement(element) {
    if (!isSearchField(element)) return;

    const fieldLabel = buildElementLabel(element) || 'search-field';
    const value = cleanText(element.value || '');
    const lastValue = sentSearchValues.get(fieldLabel);

    if (!value || value === lastValue) return;

    sentSearchValues.set(fieldLabel, value);
    sendClientEvent('Search', `Search on ${fieldLabel}: ${value.slice(0, 120)}`, pagePath);
  }

  window.addEventListener('beforeprint', function () {
    trackPrint(`Print requested on ${pagePath}`);
  });

  document.addEventListener('click', function (event) {
    const trigger = event.target && event.target.closest
      ? event.target.closest('button, a, [role="button"], input[type="button"], input[type="submit"]')
      : null;

    if (!trigger) return;

    const label = buildElementLabel(trigger).toLowerCase();

    if (/print|طباعة/.test(label)) {
      trackPrint(`Print button clicked: ${buildElementLabel(trigger)}`);
      return;
    }

    if (/search|بحث|filter|فلتر|تصفية/.test(label)) {
      sendClientEvent('Search', `Search trigger clicked: ${buildElementLabel(trigger)}`, pagePath);
    }
  }, true);

  document.addEventListener('input', function (event) {
    const element = event.target;
    if (!isSearchField(element)) return;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function () {
      trackSearchElement(element);
    }, 700);
  }, true);

  document.addEventListener('change', function (event) {
    trackSearchElement(event.target);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    const element = event.target;
    trackSearchElement(element);
  }, true);
})();
