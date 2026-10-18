(function () {
  function openDatePicker(input) {
    if (!input) return;

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Older mobile browsers may expose showPicker without allowing it.
      }
    }

    input.focus();
    input.click();
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('.date-picker-trigger')
      : null;
    if (!trigger) return;

    const pickerId = String(trigger.dataset.pickerId || '').trim();
    const input = pickerId ? document.getElementById(pickerId) : null;
    if (!input || input.type !== 'date') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openDatePicker(input);
  }, true);

  function parseJwtPayload(token) {
    try {
      const payload = String(token || '').split('.')[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  function applyRoleAccess() {
    const currentUser = parseJwtPayload(sessionStorage.getItem('authToken'));
    const currentRole = String(currentUser?.role || '').trim().toLowerCase();
    const allowedPages = new Set(Array.isArray(currentUser?.allowedPages) ? currentUser.allowedPages : []);
    const editablePages = new Set(
      Array.isArray(currentUser?.editablePages) ? currentUser.editablePages : [...allowedPages]
    );
    const adminOnlyPaths = new Set([
      '/settings.html',
      '/administrative.html',
      '/system-log.html',
      '/evaluations.html'
    ]);
    const pageKeyByPath = {
      '/employees.html': 'employees',
      '/daily.html': 'daily',
      '/query.html': 'query',
      '/statistics.html': 'statistics',
      '/holidays.html': 'holidays',
      '/reduction.html': 'reduction',
      '/courses.html': 'courses',
      '/transfers.html': 'transfers',
      '/outside-employees.html': 'outsideEmployees',
      '/outgoing.html': 'outgoing',
      '/incoming.html': 'incoming',
      '/archive.html': 'archive',
      '/archive-folder.html': 'archive'
    };
    const normalizedPath = window.location.pathname.replace(/^\/mobile/, '');
    const currentPageKey = pageKeyByPath[normalizedPath] || '';
    const homeRoute = sessionStorage.getItem('uiMode') === 'mobile' ? '/mobile-dashboard.html' : '/dashboard.html';

    if (adminOnlyPaths.has(window.location.pathname) && currentRole !== 'admin') {
      window.location.replace(homeRoute);
      return;
    }

    if (currentRole !== 'admin' && currentPageKey && !allowedPages.has(currentPageKey)) {
      window.location.replace(homeRoute);
      return;
    }

    const canEditCurrentPage = currentRole === 'admin'
      || (currentRole !== 'view' && currentPageKey && editablePages.has(currentPageKey));
    if (canEditCurrentPage || !currentPageKey) return;

    document.body.classList.add('view-only');

    const writeControlSelectors = [
      '#addBtn',
      '#newBtn',
      '#updateBtn',
      '#deleteBtn',
      '#deleteByNameBtn',
      '#bulkDateEditBtn',
      '#bulkPeriodEditBtn',
      '#docImageUploadBtn',
      '#docImageDeleteBtn',
      '[data-write-action]'
    ];

    document.querySelectorAll(writeControlSelectors.join(',')).forEach((control) => {
      control.hidden = true;
      control.setAttribute('aria-hidden', 'true');
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRoleAccess, { once: true });
  } else {
    applyRoleAccess();
  }

  window.applyRoleAccess = applyRoleAccess;
})();
