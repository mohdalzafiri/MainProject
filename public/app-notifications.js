(function () {
  var isHomePage = window.location.pathname === '/dashboard.html'
    || window.location.pathname === '/mobile-dashboard.html';
  if (!isHomePage || window.AppNotifications || !sessionStorage.getItem('authToken')) return;

  var authToken = sessionStorage.getItem('authToken');
  var userName = 'user';
  try {
    var payload = String(authToken).split('.')[1] || '';
    var normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    var decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    var user = JSON.parse(decoded);
    userName = String(user.username || user.name || user.sub || userName);
  } catch (error) {
    console.error('Unable to identify notification recipient:', error);
  }

  var cursorKey = 'appNotificationCursor:' + userName;
  var unreadKey = 'appNotificationUnread:' + userName;
  var readThroughKey = 'appNotificationReadThrough:' + userName;
  var cursorValue = localStorage.getItem(cursorKey);
  var cursor = /^\d+$/.test(String(cursorValue || '')) ? Number(cursorValue) : null;
  var savedUnreadCount = Number(localStorage.getItem(unreadKey) || 0);
  var unreadCount = Number.isSafeInteger(savedUnreadCount) && savedUnreadCount > 0 ? savedUnreadCount : 0;
  var savedReadThrough = Number(localStorage.getItem(readThroughKey) || 0);
  var readThroughId = Number.isSafeInteger(savedReadThrough) && savedReadThrough > 0 ? savedReadThrough : 0;
  var requestInProgress = false;
  var historyLoaded = false;
  var pollTimer;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatTimestamp(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
      + ' ' + date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate());
  }

  function addStyles() {
    var style = document.createElement('style');
    style.textContent = `
      .app-notification-button {
        position: fixed;
        z-index: 10000;
        left: 16px;
        bottom: calc(20px + env(safe-area-inset-bottom));
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        border: 1px solid var(--ui-border, #dbe3ee);
        border-radius: 50%;
        color: #6b7280;
        background: var(--ui-surface, #fff);
        box-shadow: 0 6px 20px rgba(15, 23, 42, .18);
        cursor: pointer;
      }
      .app-notification-button.has-unread { color: #dc2626; }
      .app-notification-button svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; }
      .app-notification-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        min-width: 19px;
        height: 19px;
        padding: 0 4px;
        display: grid;
        place-items: center;
        border: 2px solid var(--ui-surface, #fff);
        border-radius: 999px;
        color: #fff;
        background: #dc2626;
        font: 700 11px Tahoma, Arial, sans-serif;
      }
      .app-notification-panel {
        position: fixed;
        z-index: 9999;
        left: 16px;
        bottom: calc(80px + env(safe-area-inset-bottom));
        width: min(360px, calc(100vw - 32px));
        max-height: min(60vh, 480px);
        overflow: auto;
        padding: 14px;
        border: 1px solid var(--ui-border, #dbe3ee);
        border-radius: 16px;
        color: var(--ui-text, #0f172a);
        background: var(--ui-surface, #fff);
        box-shadow: 0 16px 40px rgba(15, 23, 42, .2);
        direction: rtl;
        font: 14px/1.6 Tahoma, Arial, sans-serif;
      }
      .app-notification-panel[hidden], .app-notification-badge[hidden], .app-notification-toast[hidden] { display: none !important; }
      .app-notification-panel h2 { margin: 0 0 10px; font-size: 17px; }
      .app-notification-list { display: grid; gap: 8px; }
      .app-notification-item {
        padding: 10px;
        border: 1px solid var(--ui-border, #e2e8f0);
        border-radius: 11px;
        background: rgba(148, 163, 184, .08);
      }
      .app-notification-item strong { display: block; margin-bottom: 3px; }
      .app-notification-time {
        display: block;
        margin-top: 5px;
        color: var(--ui-muted, #64748b);
        direction: ltr;
        unicode-bidi: isolate;
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-size: 11px;
      }
      .app-notification-toast {
        position: fixed;
        z-index: 10001;
        left: 16px;
        bottom: calc(78px + env(safe-area-inset-bottom));
        width: min(360px, calc(100vw - 32px));
        padding: 13px 15px;
        border: 1px solid var(--ui-border, #dbe3ee);
        border-radius: 14px;
        color: var(--ui-text, #0f172a);
        background: var(--ui-surface, #fff);
        box-shadow: 0 12px 32px rgba(15, 23, 42, .2);
        direction: rtl;
        text-align: right;
        font: 14px/1.6 Tahoma, Arial, sans-serif;
        cursor: pointer;
      }
      .app-notification-toast strong { display: block; }
      @media (max-width: 680px) {
        .app-notification-button { bottom: calc(96px + env(safe-area-inset-bottom)); }
        .app-notification-panel { bottom: calc(152px + env(safe-area-inset-bottom)); }
        .app-notification-toast { bottom: calc(152px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(style);
  }

  function createInterface() {
    addStyles();

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-notification-button';
    button.setAttribute('aria-label', 'الإشعارات');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"></path></svg><span class="app-notification-badge" hidden></span>';

    var panel = document.createElement('section');
    panel.className = 'app-notification-panel';
    panel.setAttribute('aria-label', 'إشعارات التطبيق');
    panel.hidden = true;
    panel.innerHTML = '<h2>الإشعارات</h2><div class="app-notification-list" aria-live="polite"><p class="app-notification-empty">لا توجد إشعارات حالياً.</p></div>';

    var toast = document.createElement('button');
    toast.type = 'button';
    toast.className = 'app-notification-toast';
    toast.hidden = true;

    document.body.append(button, panel, toast);
    var badge = button.querySelector('.app-notification-badge');
    var list = panel.querySelector('.app-notification-list');
    var hideToastTimer;

    function renderBadge() {
      badge.hidden = unreadCount === 0;
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      button.setAttribute('aria-label', unreadCount ? 'الإشعارات، غير المقروء: ' + unreadCount : 'الإشعارات');
      button.classList.toggle('has-unread', unreadCount > 0);
      localStorage.setItem(unreadKey, String(unreadCount));
    }

    function appendNotification(notification, showToast) {
      var notificationId = Number(notification.id);
      if (Number.isSafeInteger(notificationId) && notificationId <= readThroughId) return;
      var emptyMessage = list.querySelector('.app-notification-empty');
      if (emptyMessage) emptyMessage.remove();
      var item = document.createElement('article');
      item.className = 'app-notification-item';
      if (Number.isSafeInteger(notificationId) && notificationId > 0) {
        item.dataset.notificationId = String(notificationId);
      }
      var title = document.createElement('strong');
      title.textContent = notification.title;
      var message = document.createElement('span');
      message.textContent = notification.message;
      var time = document.createElement('time');
      time.className = 'app-notification-time';
      time.dateTime = notification.createdAt;
      time.textContent = formatTimestamp(notification.createdAt);
      item.append(title, message, time);
      list.prepend(item);
      while (list.children.length > 30) list.lastElementChild.remove();

      if (showToast) {
        unreadCount += 1;
        renderBadge();
        toast.replaceChildren();
        var toastTitle = document.createElement('strong');
        toastTitle.textContent = notification.title;
        var toastMessage = document.createElement('span');
        toastMessage.textContent = notification.message;
        toast.append(toastTitle, toastMessage);
        toast.hidden = false;
        window.clearTimeout(hideToastTimer);
        hideToastTimer = window.setTimeout(function () { toast.hidden = true; }, 7000);
      }
    }

    function markVisibleAsRead() {
      list.querySelectorAll('.app-notification-item[data-notification-id]').forEach(function (item) {
        item.dataset.read = 'true';
      });
    }

    function removeReadNotifications() {
      var highestReadId = readThroughId;
      list.querySelectorAll('.app-notification-item[data-read="true"]').forEach(function (item) {
        var notificationId = Number(item.dataset.notificationId);
        if (Number.isSafeInteger(notificationId)) highestReadId = Math.max(highestReadId, notificationId);
        item.remove();
      });
      if (highestReadId > readThroughId) {
        readThroughId = highestReadId;
        localStorage.setItem(readThroughKey, String(readThroughId));
      }
      if (!list.querySelector('.app-notification-item')) {
        list.innerHTML = '<p class="app-notification-empty">لا توجد إشعارات حالياً.</p>';
      }
    }

    function openPanel() {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      markVisibleAsRead();
      unreadCount = 0;
      renderBadge();
      toast.hidden = true;
    }

    function closePanel() {
      if (panel.hidden) return;
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      removeReadNotifications();
    }

    button.addEventListener('click', function () {
      if (panel.hidden) openPanel();
      else closePanel();
    });
    toast.addEventListener('click', function () {
      openPanel();
    });
    document.addEventListener('click', function (event) {
      if (panel.hidden || panel.contains(event.target) || button.contains(event.target)) return;
      closePanel();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closePanel();
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== unreadKey) return;
      var nextCount = Number(event.newValue || 0);
      unreadCount = Number.isSafeInteger(nextCount) && nextCount > 0 ? nextCount : 0;
      renderBadge();
    });
    renderBadge();

    return {
      append: appendNotification,
      refreshBadge: renderBadge
    };
  }

  function getCursor() {
    return cursor === null ? '' : '?afterId=' + encodeURIComponent(String(cursor));
  }

  async function poll() {
    if (requestInProgress || !sessionStorage.getItem('authToken')) return;
    requestInProgress = true;
    try {
      if (!historyLoaded) {
        var historyResponse = await fetch('/api/notifications?recent=1', {
          headers: { Authorization: 'Bearer ' + authToken },
          cache: 'no-store'
        });
        var historyPayload = await historyResponse.json().catch(function () { return {}; });
        if (!historyResponse.ok) throw new Error(historyPayload.message || 'تعذر تحميل إشعارات التطبيق.');
        (Array.isArray(historyPayload.notifications) ? historyPayload.notifications : [])
          .forEach(function (item) { window.AppNotifications.append(item, false); });
        historyLoaded = true;
        if (cursor === null) {
          cursor = Number(historyPayload.latestId || 0);
          localStorage.setItem(cursorKey, String(cursor));
          return;
        }
      }

      var hasMore = true;
      while (hasMore) {
        var response = await fetch('/api/notifications' + getCursor(), {
          headers: { Authorization: 'Bearer ' + authToken },
          cache: 'no-store'
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.message || 'تعذر تحميل إشعارات التطبيق.');
        var items = Array.isArray(payload.notifications) ? payload.notifications : [];
        items.forEach(function (item) { window.AppNotifications.append(item, true); });
        if (payload.nextAfterId != null) {
          cursor = Number(payload.nextAfterId);
          localStorage.setItem(cursorKey, String(cursor));
        }
        window.AppNotifications.refreshBadge();
        hasMore = Boolean(payload.hasMore && items.length);
      }
    } catch (error) {
      console.error('App notification polling failed:', error);
    } finally {
      requestInProgress = false;
    }
  }

  function start() {
    if (window.AppNotifications || !document.body || !sessionStorage.getItem('authToken')) return;
    window.AppNotifications = createInterface();
    poll();
    pollTimer = window.setInterval(poll, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') poll();
    });
    window.addEventListener('pagehide', function () {
      window.clearInterval(pollTimer);
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}());
