(function () {
  const FORCE_LIST_NAME = 'كشف القوة';

  function normalizeName(value) {
    return String(value || '')
      .replace(/[إأآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ـ/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function authHeaders() {
    return { Authorization: 'Bearer ' + (sessionStorage.getItem('authToken') || '') };
  }

  async function authorizedFetch(url) {
    const response = await fetch(url, { headers: authHeaders() });
    if (response.status === 401) {
      sessionStorage.removeItem('authToken');
      window.location.href = '/';
      throw new Error('انتهت جلسة الدخول.');
    }
    return response;
  }

  async function findLatestForceList() {
    const response = await authorizedFetch('/api/archive');
    const records = await response.json().catch(() => []);
    if (!response.ok) throw new Error((records && records.message) || 'تعذر قراءة ملفات الأرشيف.');

    const target = normalizeName(FORCE_LIST_NAME);
    return (Array.isArray(records) ? records : [])
      .filter((item) => normalizeName(item.FileName).includes(target))
      .sort((a, b) => String(b.UploadedAt || '').localeCompare(String(a.UploadedAt || '')) || Number(b.ID) - Number(a.ID))[0] || null;
  }

  async function openLatestForceList() {
    // Open the window during the click so popup blockers allow it, then load the file into it.
    const viewer = window.open('', '_blank');
    try {
      const item = await findLatestForceList();
      if (!item) throw new Error('لا يوجد ملف كشف القوة في الأرشيف حالياً.');

      const url = item.PreviewUrl ? item.PreviewUrl + '?full=1' : item.DownloadUrl;
      const response = await authorizedFetch(url);
      if (!response.ok) throw new Error('تعذر فتح ملف كشف القوة.');

      const fileUrl = URL.createObjectURL(await response.blob());
      if (viewer) {
        viewer.location.href = fileUrl;
      } else {
        window.location.href = fileUrl;
      }
    } catch (error) {
      if (viewer) viewer.close();
      alert(error.message || 'تعذر فتح ملف كشف القوة.');
    }
  }

  window.openLatestForceList = openLatestForceList;
})();
