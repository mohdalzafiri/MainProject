(function () {
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
    const adminOnlyPaths = new Set([
      '/settings.html',
      '/administrative.html',
      '/system-log.html',
      '/evaluations.html'
    ]);

    if (adminOnlyPaths.has(window.location.pathname) && currentRole !== 'admin') {
      const homeRoute = sessionStorage.getItem('uiMode') === 'mobile' ? '/mobile-dashboard.html' : '/dashboard.html';
      window.location.replace(homeRoute);
      return;
    }

    if (currentRole !== 'view') return;

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

    document.querySelectorAll('.daily-shortcuts [data-page-route]').forEach((control) => {
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
