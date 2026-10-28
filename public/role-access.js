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

  const viewOnlyCardTitles = {
    employees: 'البطاقة الوظيفية للموظف',
    daily: 'بطاقة يومية الموظف',
    holidays: 'بطاقة إجازة الموظف',
    reduction: 'بطاقة تخفيف عمل الموظف',
    courses: 'بطاقة دورة الموظف',
    transfers: 'بطاقة تنقل الموظف',
    outsideEmployees: 'بطاقة الموظف خارج الإدارة',
    outgoing: 'بطاقة الصادر',
    incoming: 'بطاقة الوارد',
    departmentMail: 'بطاقة بريد القسم'
  };

  const writeFormIds = new Set([
    'employeeForm',
    'dailyForm',
    'holidayForm',
    'reductionForm',
    'courseForm',
    'transferForm',
    'outgoingForm',
    'incomingForm',
    'departmentMailForm'
  ]);

  function getControlValue(cell) {
    const control = cell.querySelector('input, select, textarea');
    if (!control) return String(cell.textContent || '').replace(/\s+/g, ' ').trim();
    if (control.tagName === 'SELECT') {
      return String(control.selectedOptions?.[0]?.textContent || control.value || '').trim();
    }
    return String(control.value || '').trim();
  }

  function getTableRowDetails(row) {
    const table = row.closest('table');
    if (!table || row.querySelector('td[colspan]')) return [];

    const headers = Array.from(table.querySelectorAll('thead th'));
    return Array.from(row.cells).map((cell, index) => ({
      label: String(headers[index]?.textContent || '').replace(/[↑↓↕]/g, '').replace(/\s+/g, ' ').trim(),
      value: getControlValue(cell),
      hidden: cell.hidden || window.getComputedStyle(cell).display === 'none'
    })).filter((item) => !item.hidden && item.label && item.value && item.label !== 'م');
  }

  function getMobileCardDetails(card) {
    const details = [];
    const head = card.querySelector('.mobile-employee-card-head, .mobile-daily-card-head');
    const name = String(head?.querySelector('strong')?.textContent || '').trim();
    const state = String(head?.querySelector('span')?.textContent || '').trim();
    if (name) details.push({ label: 'اسم الموظف', value: name });
    if (state) details.push({ label: 'الحالة', value: state });

    card.querySelectorAll('.mobile-employee-card-item, .mobile-daily-card-item').forEach((item) => {
      const values = item.querySelectorAll('span');
      const label = String(values[0]?.textContent || '').trim();
      const value = String(values[values.length - 1]?.textContent || '').trim();
      if (label && value) details.push({ label, value });
    });

    const note = String(card.querySelector('.mobile-daily-card-note')?.textContent || '').trim();
    if (note) details.push({ label: 'الوصف أو الملاحظات', value: note });
    return details;
  }

  function showViewOnlyDetails(source, currentPageKey) {
    const details = source.matches('tr')
      ? getTableRowDetails(source)
      : getMobileCardDetails(source);
    if (!details.length) return;

    const panel = source.closest('.panel');
    if (!panel) return;

    let card = panel.querySelector(':scope > .view-only-detail-card');
    if (!card) {
      card = document.createElement('section');
      card.className = 'view-only-detail-card';
      card.setAttribute('aria-live', 'polite');
      const anchor = panel.querySelector('.table-wrap, .mobile-employee-cards, .mobile-daily-cards');
      panel.insertBefore(card, anchor || panel.firstChild);
    }

    card.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = viewOnlyCardTitles[currentPageKey] || 'بطاقة تفاصيل البيانات';
    card.appendChild(heading);

    const grid = document.createElement('dl');
    grid.className = 'view-only-detail-grid';
    details.forEach(({ label, value }) => {
      const item = document.createElement('div');
      item.className = 'view-only-detail-item';
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      item.append(term, description);
      grid.appendChild(item);
    });
    card.appendChild(grid);
  }

  function lockTableWriteControls(root = document) {
    root.querySelectorAll('tbody input, tbody select, tbody textarea, tbody button').forEach((control) => {
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
    });
  }

  function enableViewOnlyPresentation(currentPageKey, writeControlSelectors) {
    document.body.classList.add('view-only');

    document.querySelectorAll('form').forEach((form) => {
      if (!writeFormIds.has(form.id)) return;
      const panel = form.closest('.panel');
      if (panel) panel.classList.add('view-only-write-panel');
    });

    const hideWriteControls = (root = document) => {
      root.querySelectorAll(writeControlSelectors.join(',')).forEach((control) => {
        control.hidden = true;
        control.setAttribute('aria-hidden', 'true');
      });
    };

    hideWriteControls();
    lockTableWriteControls();

    document.addEventListener('click', (event) => {
      const row = event.target.closest('tbody tr');
      if (row) {
        showViewOnlyDetails(row, currentPageKey);
        return;
      }

      const mobileCard = event.target.closest('.mobile-employee-card, .mobile-daily-card');
      if (mobileCard) showViewOnlyDetails(mobileCard, currentPageKey);
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          hideWriteControls(node);
          lockTableWriteControls(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
      '/system-log.html'
    ]);
    const pageKeyByPath = {
      '/employees.html': 'employees',
      '/daily.html': 'daily',
      '/query.html': 'query',
      '/statistics.html': 'statistics',
      '/evaluations.html': 'evaluations',
      '/holidays.html': 'holidays',
      '/reduction.html': 'reduction',
      '/courses.html': 'courses',
      '/transfers.html': 'transfers',
      '/outside-employees.html': 'outsideEmployees',
      '/outgoing.html': 'outgoing',
      '/incoming.html': 'incoming',
      '/department-mail.html': 'departmentMail',
      '/archive.html': 'archive',
      '/archive-folder.html': 'archive',
      '/force-list.html': 'forceList'
    };
    const normalizedPath = window.location.pathname.replace(/^\/mobile/, '');
    const currentPageKey = pageKeyByPath[normalizedPath] || '';
    const isMobilePage = window.location.pathname.startsWith('/mobile/')
      || sessionStorage.getItem('uiMode') === 'mobile';
    const homeRoute = isMobilePage ? '/mobile-dashboard.html' : '/dashboard.html';

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
    enableViewOnlyPresentation(currentPageKey, writeControlSelectors);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRoleAccess, { once: true });
  } else {
    applyRoleAccess();
  }

  window.applyRoleAccess = applyRoleAccess;
})();
