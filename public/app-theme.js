(function () {
  const storageKey = 'mobileTheme';
  let lightThemeColor;

  function getTheme() {
    return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark-mode', isDark);
    if (document.body) {
      document.body.classList.toggle('dark-mode', isDark);
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      lightThemeColor ||= themeColor.content || '#f6faff';
      themeColor.content = isDark ? '#071525' : lightThemeColor;
    }
  }

  function labelTableRegion(tableWrap) {
    if (tableWrap.hasAttribute('aria-label') || tableWrap.hasAttribute('aria-labelledby')) return;

    const table = tableWrap.querySelector('table');
    const caption = table?.querySelector('caption')?.textContent.trim();
    const section = tableWrap.closest('.panel, section, main, .page');
    const heading = section?.querySelector('h2, h3')?.textContent.trim();
    const label = caption || heading;
    tableWrap.setAttribute('aria-label', label
      ? `جدول ${label}، قابل للتمرير أفقياً`
      : 'جدول بيانات، قابل للتمرير أفقياً');
  }

  function prepareAccessibility() {
    document.querySelectorAll('body.app-shell .table-wrap').forEach((tableWrap) => {
      if (!tableWrap.hasAttribute('role')) tableWrap.setAttribute('role', 'region');
      if (!tableWrap.hasAttribute('tabindex')) tableWrap.tabIndex = 0;
      labelTableRegion(tableWrap);
    });

    document.querySelectorAll(
      'body:is(.app-shell, .auth-shell) .status-line, body:is(.app-shell, .auth-shell) .status-message, ' +
      'body:is(.app-shell, .auth-shell) .status-box, body:is(.app-shell, .auth-shell) .search-message, ' +
      'body:is(.app-shell, .auth-shell) .page-message, body:is(.app-shell, .auth-shell) #message'
    ).forEach(prepareStatusMessage);
  }

  function prepareStatusMessage(element) {
    const isError = element.classList.contains('error') || /تعذر|خطأ|فشل|لم يتم|غير صحيح/i.test(element.textContent);
    if (!element.hasAttribute('role') || element.getAttribute('role') === 'status' || element.getAttribute('role') === 'alert') {
      element.setAttribute('role', isError ? 'alert' : 'status');
    }
    if (!element.hasAttribute('aria-live') || ['polite', 'assertive'].includes(element.getAttribute('aria-live'))) {
      element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    }
    if (!element.hasAttribute('aria-atomic')) element.setAttribute('aria-atomic', 'true');

    if (/\bloading\b|\bprocessing\b|جاري|قيد (?:التحميل|المعالجة)/i.test(element.textContent)) {
      element.setAttribute('aria-busy', 'true');
    } else if (element.getAttribute('aria-busy') === 'true') {
      element.removeAttribute('aria-busy');
    }
  }

  function installTableSearchDebounce() {
    const pending = new Map();
    const replayedEvents = new WeakSet();
    const selector = 'input[type="search"], input#tableSearch, input#tableFilterInput, input#nameFilterInput';
    const delayMs = 180;

    document.addEventListener('input', (event) => {
      if (replayedEvents.has(event) || !(event.target instanceof HTMLInputElement) || !event.target.matches(selector)) return;

      const input = event.target;
      const previousTimer = pending.get(input);
      if (previousTimer) clearTimeout(previousTimer);

      event.stopImmediatePropagation();
      const timer = setTimeout(() => {
        pending.delete(input);
        const debouncedEvent = new Event('input', { bubbles: true });
        replayedEvents.add(debouncedEvent);
        input.dispatchEvent(debouncedEvent);
      }, delayMs);
      pending.set(input, timer);
    }, true);

    document.addEventListener('focusout', (event) => {
      const input = event.target;
      const timer = input instanceof HTMLInputElement ? pending.get(input) : null;
      if (!timer) return;

      clearTimeout(timer);
      pending.delete(input);
      const debouncedEvent = new Event('input', { bubbles: true });
      replayedEvents.add(debouncedEvent);
      input.dispatchEvent(debouncedEvent);
    });
  }

  function observeAccessibilityChanges() {
    if (!document.body || typeof MutationObserver !== 'function') return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof Element && mutation.target.matches(
          '.status-line, .status-message, .status-box, .search-message, .page-message, #message'
        )) {
          prepareStatusMessage(mutation.target);
        }

        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches('.table-wrap')) {
            if (!node.hasAttribute('role')) node.setAttribute('role', 'region');
            if (!node.hasAttribute('tabindex')) node.tabIndex = 0;
            labelTableRegion(node);
          }
          node.querySelectorAll('.table-wrap').forEach((tableWrap) => {
            if (!tableWrap.hasAttribute('role')) tableWrap.setAttribute('role', 'region');
            if (!tableWrap.hasAttribute('tabindex')) tableWrap.tabIndex = 0;
            labelTableRegion(tableWrap);
          });
          if (node.matches('.status-line, .status-message, .status-box, .search-message, .page-message, #message')) {
            prepareStatusMessage(node);
          }
          node.querySelectorAll('.status-line, .status-message, .status-box, .search-message, .page-message, #message')
            .forEach(prepareStatusMessage);
        });
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  applyTheme(getTheme());
  document.addEventListener('DOMContentLoaded', () => {
    prepareAccessibility();
    observeAccessibilityChanges();
    installTableSearchDebounce();
  }, { once: true });
  if (sessionStorage.getItem('authToken') && !document.querySelector('script[data-app-notifications]')) {
    const notificationsScript = document.createElement('script');
    notificationsScript.src = '/app-notifications.js';
    notificationsScript.dataset.appNotifications = 'true';
    document.head.appendChild(notificationsScript);
  }
  document.addEventListener('DOMContentLoaded', () => applyTheme(getTheme()), { once: true });
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) {
      applyTheme(getTheme());
    }
  });

  window.AppTheme = {
    get: getTheme,
    set(theme) {
      const nextTheme = theme === 'dark' ? 'dark' : 'light';
      localStorage.setItem(storageKey, nextTheme);
      applyTheme(nextTheme);
      return nextTheme;
    },
    apply: applyTheme
  };
})();
