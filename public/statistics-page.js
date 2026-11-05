(function () {
  const authToken = sessionStorage.getItem('authToken');
  if (!authToken) {
    window.location.replace('/');
    return;
  }

  const rankCategories = [
    { label: 'الضباط', ranks: ['عميد', 'عقيد', 'مقدم', 'رائد', 'نقيب', 'ملازم اول', 'ملازم'] },
    { label: 'ضباط الصف', ranks: ['وكيل اول ضابط', 'وكيل ضابط', 'رقيب اول', 'رقيب', 'عريف', 'وكيل عريف', 'شرطي'] },
    { label: 'المدنيين', ranks: ['مدني', 'مدنية'] },
    { label: 'المهنيين', ranks: ['مهني'] }
  ];
  const defaultSectionOrder = [
    'أ - البلاغات', 'ب - البلاغات', 'ج - البلاغات', 'د - البلاغات', 'هـ - البلاغات',
    'ثابت صبح', 'أ - فريق عمل البلاغات', 'ب - فريق عمل البلاغات', 'ج - فريق عمل البلاغات',
    'د - فريق عمل البلاغات', 'هـ - فريق عمل البلاغات', 'فريق عمل البلاغات صباحاً',
    'سكرتارية البلاغات', 'أ - العمليات', 'ب - العمليات', 'ج - العمليات', 'د - العمليات',
    'هـ - العمليات', 'سكرتارية العمليات', 'أ - الخدمات', 'ب - الخدمات', 'ج - الخدمات',
    'د - الخدمات', 'هـ - الخدمات', 'سكرتارية الخدمات', 'صباحاً'
  ];
  const defaultSectionOrderIndex = new Map(
    defaultSectionOrder.map((section, index) => [section, index])
  );
  const defaultDepartmentOrder = [
    'البلاغات',
    'العمليات',
    'الخدمات المساندة',
    'الموارد البشرية',
    'المعلومات',
    'الاحصاء'
  ];
  const defaultDepartmentOrderIndex = new Map(
    defaultDepartmentOrder.map((department, index) => [department, index])
  );
  const excludedDepartments = new Set([
    'مسئول اداري',
    'مسئول إداري',
    'مسؤول اداري',
    'مسؤول إداري'
  ]);
  const rankOrder = new Map();
  rankCategories.forEach(({ ranks }) => {
    ranks.forEach((rank) => {
      const key = normalizeRank(rank);
      if (!rankOrder.has(key)) rankOrder.set(key, rankOrder.size);
    });
  });
  const statisticTypeInput = document.getElementById('statisticType');
  const sectionCards = document.getElementById('sectionCards');
  const cardsHint = document.getElementById('cardsHint');
  const rowsBody = document.getElementById('rows');
  const countLabel = document.getElementById('countLabel');
  const tableFilterInput = document.getElementById('tableFilterInput');
  const statusLine = document.getElementById('statusLine');
  const refreshBtn = document.getElementById('refreshBtn');
  const printBtn = document.getElementById('printBtn');
  const backBtn = document.getElementById('backBtn');
  const statisticsPageDialog = document.getElementById('statisticsPageDialog');
  const statisticsPageDialogTitle = document.getElementById('statisticsPageDialogTitle');
  const statisticsPageFrame = document.getElementById('statisticsPageFrame');
  const statisticsPageDialogCloseBtn = document.getElementById('statisticsPageDialogCloseBtn');
  const isMobilePage = window.location.pathname.startsWith('/mobile/')
    || sessionStorage.getItem('uiMode') === 'mobile';
  const currentUser = (() => {
    try {
      const payload = authToken.split('.')[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  })();
  const currentRole = String(currentUser?.role || '').trim().toLowerCase();
  const allowedPages = new Set(Array.isArray(currentUser?.allowedPages) ? currentUser.allowedPages : []);
  const statisticsShortcutButtons = document.querySelectorAll('.statistics-shortcuts [data-page-route]');
  let employees = [];
  let selectedPath = { rank: '', work: '', department: '', section: '' };
  let tableScope = null;
  let cardLevel = 'work';
  const statisticsSort = { key: null, direction: 'asc' };

  function normalizeRank(value) {
    return String(value || '')
      .trim()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatKuwaitDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const yearFirst = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (yearFirst) {
      return `${yearFirst[1]}/${yearFirst[2].padStart(2, '0')}/${yearFirst[3].padStart(2, '0')}`;
    }

    const dayFirst = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dayFirst) {
      return `${dayFirst[3]}/${dayFirst[2].padStart(2, '0')}/${dayFirst[1].padStart(2, '0')}`;
    }

    return raw;
  }

  function normalizeDepartment(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[أإآ]/g, 'ا');
  }

  function getActiveEmployees() {
    return employees.filter((employee) => String(employee.Status || '').trim() === 'نشط');
  }

  function getRankCategory(label) {
    return rankCategories.find((category) => category.label === label);
  }

  function getEmployeesAtPath(path = selectedPath) {
    return getActiveEmployees().filter((employee) => {
      if (path.rank) {
        const category = getRankCategory(path.rank);
        const matchesRank = category
          ? category.ranks.some((rank) => normalizeRank(employee.Title) === normalizeRank(rank))
          : normalizeRank(employee.Title) === normalizeRank(path.rank);
        if (!matchesRank) return false;
      }
      if (path.work && String(employee.Work || '').trim() !== path.work) return false;
      if (
        path.department &&
        normalizeDepartment(employee.Department) !== normalizeDepartment(path.department)
      ) return false;
      if (path.section && String(employee.Section || '').trim() !== path.section) return false;
      return true;
    });
  }

  function getCardValues(level, source) {
    if (level === 'rank') return rankCategories.map(({ label }) => label);
    const field = level === 'work' ? 'Work' : level === 'department' ? 'Department' : 'Section';
    const values = source.map((employee) => String(employee[field] || '').trim()).filter(Boolean);
    const uniqueValues = Array.from(new Set(
      level === 'department' ? values.map(normalizeDepartment) : values
    ));
    if (level === 'section') {
      return uniqueValues
        .filter((section) => !['الضباط', 'العسكريين'].includes(section))
        .sort((left, right) => {
          const leftIndex = defaultSectionOrderIndex.get(left);
          const rightIndex = defaultSectionOrderIndex.get(right);
          if (leftIndex !== undefined || rightIndex !== undefined) {
            if (leftIndex === undefined) return 1;
            if (rightIndex === undefined) return -1;
            return leftIndex - rightIndex;
          }
          return left.localeCompare(right, 'ar');
        });
    }
    if (level === 'department') {
      return uniqueValues
        .filter((department) => !excludedDepartments.has(department))
        .sort((left, right) => {
          const leftIndex = defaultDepartmentOrderIndex.get(normalizeDepartment(left));
          const rightIndex = defaultDepartmentOrderIndex.get(normalizeDepartment(right));
          if (leftIndex !== undefined || rightIndex !== undefined) {
            if (leftIndex === undefined) return 1;
            if (rightIndex === undefined) return -1;
            return leftIndex - rightIndex;
          }
          return left.localeCompare(right, 'ar');
        });
    }
    return uniqueValues.sort((left, right) => left.localeCompare(right, 'ar'));
  }

  function getNextCardLevel(level) {
    if (level === 'work') return 'department';
    if (level === 'department') return 'section';
    return '';
  }

  function updateCardSelection() {
    sectionCards.querySelectorAll('.statistics-card').forEach((card) => {
      const selectedValue = selectedPath[card.dataset.level] || '';
      card.classList.toggle('active', selectedValue === card.dataset.value);
    });
  }

  function selectCard(level, value) {
    if (level === 'rank') {
      selectedPath = { rank: value, work: '', department: '', section: '' };
    } else if (level === 'work') {
      selectedPath = { rank: '', work: value, department: '', section: '' };
    } else if (level === 'department') {
      selectedPath = { ...selectedPath, department: value, section: '' };
    } else {
      selectedPath = { ...selectedPath, section: value };
    }
    tableScope = { ...selectedPath };
    updateCardSelection();
    renderRows();
  }

  function renderSectionCards() {
    sectionCards.innerHTML = '';
    const type = statisticTypeInput.value;
    if (!type) {
      sectionCards.hidden = true;
      cardsHint.hidden = true;
      return;
    }

    const level = type === 'rank' ? 'rank' : cardLevel;
    const baseEmployees = level === 'rank'
      ? getActiveEmployees()
      : getEmployeesAtPath(level === 'department' ? {
        ...selectedPath,
        department: '',
        section: ''
      } : level === 'section' ? { ...selectedPath, section: '' } : {});
    const nextLevel = getNextCardLevel(level);
    cardsHint.textContent = nextLevel
      ? 'انقر على البطاقة مرة واحدة لعرض بياناتها في الجدول وانقر مرتين على البطاقة للانتقال الى المرحلة التالية'
      : 'انقر على البطاقة مرة واحدة لعرض بياناتها في الجدول.';
    cardsHint.hidden = false;

    getCardValues(level, baseEmployees).forEach((value) => {
      const count = level === 'rank'
        ? baseEmployees.filter((employee) =>
          getRankCategory(value).ranks.some((rank) => normalizeRank(employee.Title) === normalizeRank(rank))
        ).length
        : baseEmployees.filter((employee) => {
          const field = level === 'work' ? 'Work' : level === 'department' ? 'Department' : 'Section';
          const employeeValue = String(employee[field] || '').trim();
          return level === 'department'
            ? normalizeDepartment(employeeValue) === normalizeDepartment(value)
            : employeeValue === value;
        }).length;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'statistics-card';
      card.dataset.level = level;
      card.dataset.value = value;
      card.innerHTML = `<strong>${escapeHtml(value)}</strong><span>مجموع الموظفين: ${count}</span>`;
      card.addEventListener('click', () => {
        selectCard(level, value);
      });
      card.addEventListener('dblclick', (event) => {
        event.preventDefault();
        selectCard(level, value);
        const next = getNextCardLevel(level);
        if (!next) return;
        cardLevel = next;
        statisticTypeInput.value = next;
        tableScope = null;
        renderSectionCards();
        renderRows();
      });
      sectionCards.appendChild(card);
    });
    sectionCards.hidden = !sectionCards.children.length;
    updateCardSelection();
  }

  function getSelectedEmployees() {
    if (!tableScope) return [];
    const categoryEmployees = getEmployeesAtPath(tableScope);
    const terms = String(tableFilterInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filteredEmployees = terms.length ? categoryEmployees.filter((employee) => {
      const searchableText = [
        employee.Name,
        employee.Department,
        employee.Section,
        employee.Work,
        employee.Rank
      ].map((value) => String(value || '').trim().toLowerCase()).join(' ');
      return terms.every((term) => searchableText.includes(term));
    }) : categoryEmployees;

    const byId = (left, right) => {
      const leftId = Number(left.ID);
      const rightId = Number(right.ID);
      if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
        return leftId - rightId;
      }
      return String(left.Name || '').localeCompare(String(right.Name || ''), 'ar');
    };

    if (statisticsSort.key === 'rank') {
      return filteredEmployees.sort((left, right) => {
        const leftRank = rankOrder.has(normalizeRank(left.Title))
          ? rankOrder.get(normalizeRank(left.Title))
          : Number.MAX_SAFE_INTEGER;
        const rightRank = rankOrder.has(normalizeRank(right.Title))
          ? rankOrder.get(normalizeRank(right.Title))
          : Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) {
          const difference = leftRank - rightRank;
          return statisticsSort.direction === 'asc' ? difference : -difference;
        }
        return byId(left, right);
      });
    }

    return filteredEmployees.sort((left, right) => {
      const difference = byId(left, right);
      return statisticsSort.key === 'serial' && statisticsSort.direction === 'desc'
        ? -difference
        : difference;
    });
  }

  function updateSortHeaderIndicators() {
    document.querySelectorAll('.sortable-rank-header').forEach((header) => {
      const isActive = statisticsSort.key === header.dataset.sortKey;
      const marker = isActive ? (statisticsSort.direction === 'asc' ? ' ↑' : ' ↓') : '';
      header.textContent = `الرتبة${marker}`;
    });
    document.querySelectorAll('.sortable-serial-header').forEach((header) => {
      const isActive = statisticsSort.key === header.dataset.sortKey;
      const marker = isActive ? (statisticsSort.direction === 'asc' ? ' ↑' : ' ↓') : '';
      header.textContent = `م${marker}`;
      header.setAttribute('aria-sort', isActive
        ? (statisticsSort.direction === 'asc' ? 'ascending' : 'descending')
        : 'none');
    });
  }

  function renderRows() {
    const categoryEmployees = tableScope ? getEmployeesAtPath(tableScope) : [];
    const selectedEmployees = getSelectedEmployees();
    rowsBody.innerHTML = '';
    countLabel.textContent = tableFilterInput.value.trim()
      ? `عدد السجلات: ${selectedEmployees.length} من ${categoryEmployees.length}`
      : `عدد السجلات: ${selectedEmployees.length}`;

    if (!tableScope || !selectedEmployees.length) {
      rowsBody.innerHTML = '<tr><td colspan="12">لاتوجد بيانات حالياً.</td></tr>';
      return;
    }

    selectedEmployees.forEach((employee, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="mono">${index + 1}</td>
        <td>${escapeHtml(employee.Title)}</td>
        <td>${escapeHtml(employee.Name)}</td>
        <td>${escapeHtml(employee.CivilID)}</td>
        <td>${escapeHtml(employee.Rank)}</td>
        <td>${escapeHtml(employee.Department)}</td>
        <td>${escapeHtml(employee.Section)}</td>
        <td>${escapeHtml(employee.Work)}</td>
        <td>${escapeHtml(formatKuwaitDate(employee.Empdate))}</td>
        <td>${escapeHtml(formatKuwaitDate(employee.Startdate))}</td>
        <td>${escapeHtml(employee.Status)}</td>
        <td>${escapeHtml(employee.Note)}</td>
      `;
      rowsBody.appendChild(row);
    });
  }

  async function loadEmployees() {
    statusLine.className = 'status-line';
    statusLine.textContent = '';
    refreshBtn.disabled = true;

    try {
      const authHeaders = { Authorization: 'Bearer ' + authToken };
      const response = await fetch('/api/employees', { headers: authHeaders });

      if (response.status === 401) {
        sessionStorage.removeItem('authToken');
        window.location.replace('/');
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.message || '').trim() || 'تعذر تحميل بيانات الموظفين.');
      }
      employees = Array.isArray(data) ? data : [];
      renderSectionCards();
      renderRows();
    } catch (error) {
      employees = [];
      renderSectionCards();
      renderRows();
      statusLine.className = 'status-line show error';
      statusLine.textContent = error.message || 'تعذر تحميل بيانات الموظفين.';
    } finally {
      refreshBtn.disabled = false;
    }
  }

  statisticTypeInput.addEventListener('change', () => {
    selectedPath = { rank: '', work: '', department: '', section: '' };
    tableScope = null;
    cardLevel = statisticTypeInput.value === 'department'
      ? 'department'
      : statisticTypeInput.value === 'section'
        ? 'section'
        : 'work';
    renderSectionCards();
    renderRows();
  });
  document.querySelectorAll('.sortable-rank-header').forEach((header) => {
    header.addEventListener('click', () => {
      if (statisticsSort.key === 'rank') {
        statisticsSort.direction = statisticsSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        statisticsSort.key = 'rank';
        statisticsSort.direction = 'asc';
      }
      updateSortHeaderIndicators();
      renderRows();
    });
  });
  document.querySelectorAll('.sortable-serial-header').forEach((header) => {
    header.addEventListener('click', () => {
      if (statisticsSort.key === 'serial') {
        statisticsSort.direction = statisticsSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        statisticsSort.key = 'serial';
        statisticsSort.direction = 'asc';
      }
      updateSortHeaderIndicators();
      renderRows();
    });
  });
  tableFilterInput.addEventListener('input', renderRows);
  tableFilterInput.addEventListener('search', renderRows);
  refreshBtn.addEventListener('click', loadEmployees);
  printBtn.addEventListener('click', () => {
    if (!tableScope) {
      statusLine.className = 'status-line show error';
      statusLine.textContent = 'اختر بطاقة لعرض بياناتها قبل الطباعة.';
      return;
    }
    window.print();
  });
  statisticsShortcutButtons.forEach((button) => {
    const pageKey = String(button.dataset.pageKey || '').trim();
    button.hidden = currentRole !== 'admin' && !allowedPages.has(pageKey);
    button.addEventListener('click', () => {
      if (isMobilePage) {
        window.location.href = button.dataset.mobileRoute || button.dataset.pageRoute;
        return;
      }

      const title = button.dataset.pageTitle || 'الواجهة';
      statisticsPageDialogTitle.textContent = title;
      statisticsPageFrame.title = title;
      statisticsPageFrame.src = button.dataset.pageRoute || '';
      statisticsPageDialog.showModal();
    });
  });
  statisticsPageDialogCloseBtn.addEventListener('click', () => {
    statisticsPageDialog.close();
  });
  statisticsPageDialog.addEventListener('close', () => {
    statisticsPageFrame.src = 'about:blank';
  });
  backBtn.addEventListener('click', () => {
    window.location.href = isMobilePage ? '/mobile-dashboard.html' : '/dashboard.html';
  });

  renderRows();
  loadEmployees();
})();
