(function () {
  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isMobileDevice() {
    return window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches;
  }

  function createOverlay(options) {
    const overlay = document.createElement('div');
    overlay.id = 'installGateOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '99999';
    overlay.style.background = 'rgba(2, 6, 23, 0.92)';
    overlay.style.display = 'grid';
    overlay.style.placeItems = 'center';
    overlay.style.padding = '16px';

    const card = document.createElement('div');
    card.style.width = 'min(460px, 100%)';
    card.style.borderRadius = '18px';
    card.style.padding = '18px';
    card.style.background = '#ffffff';
    card.style.color = '#0f172a';
    card.style.boxShadow = '0 20px 50px rgba(0,0,0,0.35)';
    card.style.textAlign = 'right';
    card.style.direction = 'rtl';

    const logo = document.createElement('img');
    logo.src = options.logoSrc;
    logo.alt = 'logo';
    logo.style.width = '56px';
    logo.style.height = '56px';
    logo.style.borderRadius = '50%';
    logo.style.display = 'block';
    logo.style.margin = '0 auto 10px';

    const title = document.createElement('h2');
    title.textContent = 'إضافة اختصار التطبيق';
    title.style.margin = '0 0 8px';
    title.style.textAlign = 'center';
    title.style.fontSize = '20px';

    const subtitle = document.createElement('p');
    subtitle.textContent = 'للاستمرار في استخدام الواجهة الرئيسية، يجب إضافة اختصار ' + options.appName + ' إلى شاشة الهاتف.';
    subtitle.style.margin = '0 0 12px';
    subtitle.style.color = '#334155';
    subtitle.style.lineHeight = '1.6';

    const status = document.createElement('div');
    status.style.minHeight = '24px';
    status.style.marginBottom = '12px';
    status.style.fontWeight = '700';
    status.style.color = '#1e293b';

    const primaryBtn = document.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.textContent = 'إضافة الاختصار الآن';
    primaryBtn.style.width = '100%';
    primaryBtn.style.border = '0';
    primaryBtn.style.borderRadius = '12px';
    primaryBtn.style.padding = '12px';
    primaryBtn.style.background = '#1d4ed8';
    primaryBtn.style.color = '#fff';
    primaryBtn.style.fontWeight = '700';
    primaryBtn.style.cursor = 'pointer';

    const verifyBtn = document.createElement('button');
    verifyBtn.type = 'button';
    verifyBtn.textContent = 'تحقق بعد الإضافة';
    verifyBtn.style.width = '100%';
    verifyBtn.style.border = '1px solid #cbd5e1';
    verifyBtn.style.borderRadius = '12px';
    verifyBtn.style.padding = '10px';
    verifyBtn.style.marginTop = '8px';
    verifyBtn.style.background = '#fff';
    verifyBtn.style.color = '#0f172a';
    verifyBtn.style.fontWeight = '700';
    verifyBtn.style.cursor = 'pointer';

    const iosHint = document.createElement('div');
    iosHint.style.marginTop = '10px';
    iosHint.style.padding = '10px';
    iosHint.style.borderRadius = '10px';
    iosHint.style.background = '#f8fafc';
    iosHint.style.border = '1px solid #e2e8f0';
    iosHint.style.color = '#334155';
    iosHint.style.fontSize = '13px';
    iosHint.style.lineHeight = '1.6';
    iosHint.style.display = 'none';

    card.appendChild(logo);
    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(status);
    card.appendChild(primaryBtn);
    card.appendChild(verifyBtn);
    card.appendChild(iosHint);
    overlay.appendChild(card);

    return { overlay, status, primaryBtn, verifyBtn, iosHint };
  }

  window.initShortcutInstallGate = function initShortcutInstallGate(options) {
    const opts = options || {};

    if (!isMobileDevice()) {
      return;
    }

    if (isStandaloneMode()) {
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const ui = createOverlay({
      appName: opts.appName || 'الإدارة',
      logoSrc: opts.logoSrc || '/images/logo.png'
    });

    let deferredPrompt = null;
    let installInProgress = false;

    function closeIfInstalled() {
      if (isStandaloneMode()) {
        ui.overlay.remove();
        return true;
      }
      return false;
    }

    function showIosHint() {
      ui.iosHint.style.display = 'block';
      ui.iosHint.innerHTML = [
        'إذا كنت على iPhone/Safari:',
        '1) اضغط زر المشاركة (Share).',
        '2) اختر Add to Home Screen.',
        '3) افتح التطبيق من الاختصار ثم اضغط تحقق.'
      ].join('<br>');
      ui.status.textContent = 'هذا المتصفح لا يعرض نافذة تثبيت تلقائية.';
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      ui.status.textContent = 'الاختصار جاهز. اضغط الزر لإكمال الإضافة.';
    });

    window.addEventListener('appinstalled', () => {
      ui.status.textContent = 'تمت إضافة الاختصار بنجاح.';
      setTimeout(() => {
        closeIfInstalled();
      }, 250);
    });

    ui.primaryBtn.addEventListener('click', async () => {
      if (installInProgress) return;

      if (closeIfInstalled()) {
        return;
      }

      if (!deferredPrompt) {
        showIosHint();
        return;
      }

      installInProgress = true;
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          ui.status.textContent = 'تمت الموافقة. افتح الاختصار من الشاشة الرئيسية.';
        } else {
          ui.status.textContent = 'يجب الموافقة على الإضافة للمتابعة.';
        }
      } catch {
        ui.status.textContent = 'تعذر إظهار نافذة الإضافة. حاول مرة أخرى.';
      } finally {
        deferredPrompt = null;
        installInProgress = false;
      }
    });

    ui.verifyBtn.addEventListener('click', () => {
      if (!closeIfInstalled()) {
        ui.status.textContent = 'لم يتم فتح التطبيق من الاختصار بعد.';
      }
    });

    document.body.appendChild(ui.overlay);
    ui.status.textContent = 'يتم تجهيز خيار إضافة الاختصار...';

    setTimeout(() => {
      if (!deferredPrompt && !isStandaloneMode()) {
        showIosHint();
      }
    }, 1800);
  };
})();
