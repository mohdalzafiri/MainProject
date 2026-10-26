function normalizeValue(value) {
  const normalized = String(value || '').trim();
  return normalized === 'الإحصاء' ? 'الاحصاء' : normalized;
}

function normalizeValues(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeValue).filter(Boolean))];
}

function getDataScope(access = {}) {
  if (access.isAdmin) {
    return {
      isAdmin: true,
      departments: [],
      sections: [],
      subSections: []
    };
  }

  const explicitDepartments = normalizeValues(access.allowedDepartments);
  const explicitSections = normalizeValues(access.allowedSections);
  const hasExplicitScope = explicitDepartments.length > 0
    || explicitSections.length > 0;

  return {
    isAdmin: false,
    departments: hasExplicitScope
      ? explicitDepartments
      : normalizeValues([access.department]),
    sections: hasExplicitScope
      ? explicitSections
      : normalizeValues([access.section]),
    subSections: hasExplicitScope
      ? []
      : normalizeValues([access.subSection])
  };
}

function isWithinDataScope(record, access = {}) {
  const scope = getDataScope(access);
  if (scope.isAdmin) return true;

  const hasScope = scope.departments.length > 0
    || scope.sections.length > 0
    || scope.subSections.length > 0;
  if (!hasScope) return false;

  const department = normalizeValue(record && (record.Department != null ? record.Department : record.department));
  const section = normalizeValue(record && (record.Section != null
    ? record.Section
    : (record.section != null ? record.section : record.Shift)));
  const subSection = normalizeValue(record && (record.SubSection != null ? record.SubSection : record.subSection));
  const hasSubSection = Boolean(record)
    && (
      Object.prototype.hasOwnProperty.call(record, 'SubSection')
      || Object.prototype.hasOwnProperty.call(record, 'subSection')
    );

  if (scope.departments.length && !scope.departments.includes(department)) return false;
  if (scope.sections.length && !scope.sections.includes(section)) return false;
  if (hasSubSection && scope.subSections.length && !scope.subSections.includes(subSection)) return false;
  return true;
}

function filterByDataScope(records, access = {}) {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => isWithinDataScope(record, access));
}

module.exports = {
  normalizeValue,
  getDataScope,
  isWithinDataScope,
  filterByDataScope
};
