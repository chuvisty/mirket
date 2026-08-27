// --- QR SCANNER: Camera scanner, location permission modals ---
function openLocationPermissionModal() {
  const modal = document.getElementById('locationPermissionModal');
  if (modal) modal.classList.remove('hidden');
}

function closeLocationPermissionModal() {
  const modal = document.getElementById('locationPermissionModal');
  if (modal) modal.classList.add('hidden');
}

function openLocationGuideModal(os = null) {
  const modal = document.getElementById('locationGuideModal');
  if (!modal) return;

  if (!os) {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    os = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream ? 'ios' : 'android';
  }

  switchLocationGuideTab(os);
  modal.classList.remove('hidden');
}

function closeLocationGuideModal() {
  const modal = document.getElementById('locationGuideModal');
  if (modal) modal.classList.add('hidden');
}

function switchLocationGuideTab(os) {
  const iosBtn = document.getElementById('tabIosBtn');
  const androidBtn = document.getElementById('tabAndroidBtn');
  const iosContent = document.getElementById('guideIosContent');
  const androidContent = document.getElementById('guideAndroidContent');

  if (!iosBtn || !androidBtn || !iosContent || !androidContent) return;

  if (os === 'ios') {
    iosBtn.className = 'btn secondary';
    androidBtn.className = 'btn ghost';
    iosContent.classList.remove('hidden');
    androidContent.classList.add('hidden');
  } else {
    androidBtn.className = 'btn secondary';
    iosBtn.className = 'btn ghost';
    androidContent.classList.remove('hidden');
    iosContent.classList.add('hidden');
  }
}

function retryLocationPermission() {
  closeLocationGuideModal();
  proceedWithLocationAndCamera();
}

function proceedWithLocationAndCamera() {
  closeLocationPermissionModal();
  const modal = document.getElementById('qrScanModal');
  const msgEl = document.getElementById('qrScanMessage');
  if (modal) modal.classList.remove('hidden');
  if (msgEl) {
    msgEl.textContent = 'Konumunuz alınıyor ve kamera hazırlanıyor...';
    msgEl.className = 'auth-message info';
  }
  startQrCameraScanner();
}

function openQrScanModal() {
  openLocationPermissionModal();
}

function closeQrScanModal() {
  const modal = document.getElementById('qrScanModal');
  if (modal) modal.classList.add('hidden');
  stopQrCameraScanner();
}

window.openLocationPermissionModal = openLocationPermissionModal;
window.closeLocationPermissionModal = closeLocationPermissionModal;
window.openLocationGuideModal = openLocationGuideModal;
window.closeLocationGuideModal = closeLocationGuideModal;
window.switchLocationGuideTab = switchLocationGuideTab;
window.retryLocationPermission = retryLocationPermission;
window.proceedWithLocationAndCamera = proceedWithLocationAndCamera;
window.openQrScanModal = openQrScanModal;
window.closeQrScanModal = closeQrScanModal;

function stopQrCameraScanner() {
  if (html5QrScanner) {
    html5QrScanner.stop().then(() => {
      html5QrScanner.clear();
      html5QrScanner = null;
    }).catch(err => {
      console.warn("QR Scanner stop error:", err);
      html5QrScanner = null;
    });
  }
}
window.stopQrCameraScanner = stopQrCameraScanner;

function startQrCameraScanner() {
  const msgEl = document.getElementById('qrScanMessage');

  if (!navigator.geolocation) {
    closeQrScanModal();
    openLocationGuideModal();
    return;
  }

  // Fetch current position first
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const workerCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      
      if (msgEl) {
        msgEl.textContent = 'Konum doğrulandı. Şimdi restoran QR kodunu kameraya gösteriniz.';
        msgEl.className = 'auth-message info';
      }

      // Initialize Html5Qrcode
      if (!window.Html5Qrcode) {
        if (msgEl) {
          msgEl.textContent = 'QR Okuyucu kütüphanesi yüklenemedi.';
          msgEl.className = 'auth-message error';
        }
        return;
      }

      const qrRegionId = 'qrReader';
      if (html5QrScanner) {
        html5QrScanner.clear();
      }
      
      html5QrScanner = new Html5Qrcode(qrRegionId);
      html5QrScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          // Temporarily pause scanner to process
          html5QrScanner.pause(true);
          if (msgEl) {
            msgEl.textContent = 'QR Kod okundu, doğrulanıyor...';
            msgEl.className = 'auth-message info';
          }
          
          await processClockInOut(decodedText, workerCoords);
        },
        (errorMessage) => {
          // ignore scan errors during search
        }
      ).catch(err => {
        console.error("Camera access error:", err);
        if (msgEl) {
          msgEl.textContent = 'Kamera izni verilmedi veya kamera başlatılamadı.';
          msgEl.className = 'auth-message error';
        }
      });
    },
    (geoError) => {
      console.error("Geolocation error:", geoError);
      closeQrScanModal();
      openLocationGuideModal();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
window.startQrCameraScanner = startQrCameraScanner;
