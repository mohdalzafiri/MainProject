(function () {
  const authToken = sessionStorage.getItem('authToken');
  if (!authToken) {
    window.location.replace('/');
    return;
  }

  const categoryRanks = {
    officers: ['عميد', 'عقيد', 'مقدم', 'رائد', 'نقيب', 'ملازم اول', 'ملازم'],
    nonCommissioned: ['وكيل اول ضابط', 'وكيل ضابط', 'رقيب اول', 'رقيب', 'عريف', 'وكيل عريف', 'شرطي'],
    maleCivilians: ['مدني'],
    femaleCivilians: ['مدنية'],
    professionals: ['مهني']
  };

  const rankOrder = new Map();
  Object.values(categoryRanks).forEach((ranks) => {
    ranks.forEach((rank) => {
      const key = normalizeRank(rank);
      if (!rankOrder.has(key)) rankOrder.set(key, rankOrder.size);
    });
  });
  const sectionCardDepartments = new Set(['البلاغات', 'العمليات']);

  const statisticTypeInput = document.getElementById('statisticType');
  const departmentInput = document.getElementById('statisticDepartment');
  const sectionCards = document.getElementById('sectionCards');
  const rowsBody = document.getElementById('rows');
  const countLabel = document.getElementById('countLabel');
  const tableFilterInput = document.getElementById('tableFilterInput');
  const statusLine = document.getElementById('statusLine');
  const refreshBtn = document.getElementById('refreshBtn');
  const printBtn = document.getElementById('printBtn');
  const backBtn = document.getElementById('backBtn');
  let employees = [];
  let departmentSectionRows = [];
  let selectedSection = '';
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
    const normalized = String(value || '').trim();
    return normalized === 'الإحصاء' ? 'الاحصاء' : normalized;
  }

  function usesSectionCards() {
    return sectionCardDepartments.has(normalizeDepartment(departmentInput.value));
  }

  function getRankDepartmentEmployees() {
    const ranks = new Set((categoryRanks[statisticTypeInput.value] || []).map(normalizeRank));
    const department = normalizeDepartment(departmentInput.value);

    return employees.filter((employee) =>
      String(employee.Status || '').trim() === 'نشط'
      && (!ranks.size || ranks.has(normalizeRank(employee.Title)))
      && (!department || normalizeDepartment(employee.Department) === department)
    );
  }

  function getCategoryEmployees() {
    if (!statisticTypeInput.value && !departmentInput.value) return [];
    if (usesSectionCards() && !selectedSection) return [];

    const baseEmployees = getRankDepartmentEmployees();
    return selectedSection
      ? baseEmployees.filter((employee) => String(employee.Section || '').trim() === selectedSection)
      : baseEmployees;
  }

  function getDepartmentSections(department) {
    const sections = departmentSectionRows
      .filter((item) => normalizeDepartment(item.Department) === department)
      .map((item) => String(item.Section || '').trim());
    return Array.from(new Set(sections.filter(Boolean)));
  }

  function renderSectionCards() {
    sectionCards.innerHTML = '';
    if (!usesSectionCards()) {
      sectionCards.hidden = true;
      return;
    }

    const department = normalizeDepartment(departmentInput.value);
    const baseEmployees = getRankDepartmentEmployees();
    getDepartmentSections(department).forEach((section) => {
      const count = baseEmployees.filter((employee) => String(employee.Section || '').trim() === section).length;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `section-card${section === selectedSection ? ' active' : ''}`;
      card.innerHTML = `<strong>${escapeHtml(section)}</strong><span>عدد الموظفين: ${count}</span>`;
      card.addEventListener('click', () => {
        selectedSection = section;
        renderSectionCards();
        renderRows();
      });
      sectionCards.appendChild(card);
    });
    sectionCards.hidden = !sectionCards.children.length;
  }

  function populateDepartments() {
    const selected = departmentInput.value;
    const departments = Array.from(new Set(departmentSectionRows
      .map((item) => normalizeDepartment(item.Department))
      .filter(Boolean)));
    departmentInput.innerHTML = '<option value="">-- اختر --</option>';
    departments.forEach((department) => {
      const option = document.createElement('option');
      option.value = department;
      option.textContent = department;
      departmentInput.appendChild(option);
    });
    if (departments.includes(selected)) departmentInput.value = selected;
  }

  function getSelectedEmployees() {
    const categoryEmployees = getCategoryEmployees();
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

    return filteredEmployees.sort(byId);
  }

  function updateSortHeaderIndicators() {
    document.querySelectorAll('.sortable-rank-header').forEach((header) => {
      const isActive = statisticsSort.key === header.dataset.sortKey;
      const marker = isActive ? (statisticsSort.direction === 'asc' ? ' ↑' : ' ↓') : '';
      header.textContent = `الرتبة${marker}`;
    });
  }

  function renderRows() {
    const categoryEmployees = getCategoryEmployees();
    const selectedEmployees = getSelectedEmployees();
    rowsBody.innerHTML = '';
    countLabel.textContent = tableFilterInput.value.trim()
      ? `عدد السجلات: ${selectedEmployees.length} من ${categoryEmployees.length}`
      : `عدد السجلات: ${selectedEmployees.length}`;

    if (!statisticTypeInput.value && !departmentInput.value) {
      rowsBody.innerHTML = '<tr><td colspan="12">لاتوجد بيانات حالياً.</td></tr>';
      return;
    }

    if (usesSectionCards() && !selectedSection) {
      rowsBody.innerHTML = '<tr><td colspan="12">لاتوجد بيانات حالياً.</td></tr>';
      return;
    }

    if (!selectedEmployees.length) {
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
      const [response, sectionsResponse] = await Promise.all([
        fetch('/api/employees', { headers: authHeaders }),
        fetch('/api/employees/department-sections', { headers: authHeaders })
      ]);

      if (response.status === 401 || sectionsResponse.status === 401) {
        sessionStorage.removeItem('authToken');
        window.location.replace('/');
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.message || '').trim() || 'تعذر تحميل بيانات الموظفين.');
      }
      const sectionsData = await sectionsResponse.json().catch(() => []);

      employees = Array.isArray(data) ? data : [];
      departmentSectionRows = sectionsResponse.ok && Array.isArray(sectionsData) ? sectionsData : [];
      populateDepartments();
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
    renderSectionCards();
    renderRows();
  });
  departmentInput.addEventListener('change', () => {
    selectedSection = '';
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
  tableFilterInput.addEventListener('input', renderRows);
  refreshBtn.addEventListener('click', loadEmployees);
  printBtn.addEventListener('click', () => {
    if (!statisticTypeInput.value && !departmentInput.value) {
      statusLine.className = 'status-line show error';
      statusLine.textContent = 'اختر الرتبة أو القسم قبل الطباعة.';
      return;
    }
    window.print();
  });
  backBtn.addEventListener('click', () => {
    const isMobile = window.location.pathname.startsWith('/mobile/')
      || sessionStorage.getItem('uiMode') === 'mobile';
    window.location.href = isMobile ? '/mobile/dashboard.html' : '/dashboard.html';
  });

  renderRows();
  loadEmployees();
})();
