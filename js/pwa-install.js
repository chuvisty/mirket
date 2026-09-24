// Mirket PWA Installation & Service Worker Integration
(function() {
  'use strict';

  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          // If there's an updated worker waiting, trigger an update check
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New version available. Refresh to update.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // 2. State & Environment Detection
  let deferredPrompt = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // Don't show install banners if already running as an installed PWA
  if (isStandalone) {
    return;
  }

  // Check dismissal timestamp (suppress for 5 days if dismissed)
  function isDismissed() {
    const dismissedAt = localStorage.getItem('mirket_pwa_banner_dismissed');
    if (!dismissedAt) return false;
    const diffDays = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
    return diffDays < 5;
  }

  function dismissBanner() {
    localStorage.setItem('mirket_pwa_banner_dismissed', Date.now().toString());
    const banner = document.getElementById('mirketPwaBanner');
    if (banner) {
      banner.style.display = 'none';
    }
  }
  window.dismissPwaBanner = dismissBanner;

  // 3. Create & Show Floating Install Banner
  function createInstallBanner() {
    if (document.getElementById('mirketPwaBanner') || isDismissed()) return;

    const banner = document.createElement('div');
    banner.id = 'mirketPwaBanner';
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">
          <img src="/images/favicon.png" alt="Mirket Icon" width="38" height="38" style="border-radius: 8px;">
        </div>
        <div class="pwa-banner-text">
          <strong>Mirket'i Ana Ekrana Ekleyin</strong>
          <span>Daha hızlı erişim ve tek dokunuşla mesai takibi</span>
        </div>
      </div>
      <div class="pwa-banner-actions">
        <button type="button" class="btn primary btn-sm" id="btnPwaInstallAction" onclick="window.triggerPwaInstall()">
          📲 Yükle
        </button>
        <button type="button" class="pwa-banner-close" onclick="window.dismissPwaBanner()" aria-label="Kapat">
          ✕
        </button>
      </div>
    `;

    document.body.appendChild(banner);
  }

  // 4. Handle Android/Desktop beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.deferredPwaPrompt = e;

    // Show custom banner
    setTimeout(() => {
      createInstallBanner();
    }, 1500);
  });

  // 5. iOS Safari Install Modal
  function showIosInstallModal() {
    let modal = document.getElementById('iosPwaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'iosPwaModal';
      modal.className = 'ios-pwa-modal-overlay';
      modal.innerHTML = `
        <div class="ios-pwa-modal-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="/images/favicon.png" alt="Mirket" width="36" height="36" style="border-radius: 8px;">
              <h3 style="margin: 0; font-size: 17px; color: #0f172a;">iPhone'a Mirket'i Ekle</h3>
            </div>
            <button type="button" onclick="document.getElementById('iosPwaModal').classList.remove('active')" style="background:none; border:none; font-size:20px; color:#64748b; cursor:pointer;">✕</button>
          </div>
          <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px;">
            Mirket'i uygulama gibi tam ekran kullanmak ve tek dokunuşla açmak için aşağıdaki 2 adımı uygulayın:
          </p>
          <div class="ios-install-steps">
            <div class="ios-step-item">
              <span class="ios-step-num">1</span>
              <div>Safari'nin alt menüsündeki <strong>Paylaş</strong> simgesine dokunun: <span style="font-size: 18px;">📤</span></div>
            </div>
            <div class="ios-step-item">
              <span class="ios-step-num">2</span>
              <div>Açılan menüde aşağı kaydırıp <strong>"Ana Ekrana Ekle"</strong> (Add to Home Screen) seçeneğine <strong>[➕]</strong> dokunun.</div>
            </div>
            <div class="ios-step-item">
              <span class="ios-step-num">3</span>
              <div>Sağ üst köşedeki <strong>"Ekle"</strong> butonuna basarak tamamlayın.</div>
            </div>
          </div>
          <button type="button" class="btn primary" style="width: 100%; margin-top: 15px;" onclick="document.getElementById('iosPwaModal').classList.remove('active')">
            Anladım
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
  }

  // 6. Global Trigger for Buttons
  window.triggerPwaInstall = async function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        dismissBanner();
      } else {
        console.log('[PWA] User dismissed the install prompt');
      }
      deferredPrompt = null;
    } else if (isIos) {
      showIosInstallModal();
    } else {
      alert("Mirket'i cihazınıza eklemek için tarayıcınızın menüsünden (⋮ veya ⚙️) 'Uygulamayı Yükle' veya 'Ana Ekrana Ekle' seçeneğini seçebilirsiniz.");
    }
  };

  // Show iOS banner after initial load if iOS and not installed
  if (isIos && !isDismissed()) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        createInstallBanner();
      }, 2000);
    });
  }

  // Listen for installed event
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Mirket app was successfully installed');
    dismissBanner();
  });
})();
