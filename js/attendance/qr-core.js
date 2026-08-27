// --- QR CORE: Token generation, validation & dynamic QR display ---
function generateQrToken(restaurantId) {
  if (!restaurantId || restaurantId === 'undefined' || restaurantId === 'null') {
    console.error("Geçersiz restaurantId:", restaurantId);
    return null;
  }
  const windowTime = Math.floor(Date.now() / 60000);
  return `VARDIYAN_SHIFT|${restaurantId}|${windowTime}`;
}

function parseQrToken(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') return null;
  const parts = tokenString.split('|');
  if (parts.length !== 3 || parts[0] !== 'VARDIYAN_SHIFT') return null;
  
  const restaurantId = parts[1];
  if (!restaurantId || restaurantId === 'undefined' || restaurantId === 'null') {
    return { valid: false, error: 'QR Kod geçersiz (Restoran kimliği okunamadı). Lütfen ekranı yenileyiniz.' };
  }

  const tokenWindow = parseInt(parts[2], 10);
  const currentWindow = Math.floor(Date.now() / 60000);
  
  // Allow current 60s window or previous 60s window (tolerance for network drift)
  if (Math.abs(currentWindow - tokenWindow) > 1) {
    return { valid: false, error: 'QR kodun süresi dolmuş. Lütfen restoran ekranındaki yeni QR kodu okutun.' };
  }
  
  return { valid: true, restaurantId };
}

// --- 3. DYNAMIC QR DISPLAY (RESTAURANT TABLET / SCREEN MODE) ---
function startDynamicQrStream(restaurantId, containerId = 'qrcode') {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!restaurantId || restaurantId === 'undefined' || restaurantId === 'null') {
    container.innerHTML = '<p style="color:#ef4444; font-size:13px; padding:10px;">Restoran kimliği bulunamadı. Lütfen sayfayı yenileyiniz.</p>';
    return;
  }
  
  function renderQr() {
    container.innerHTML = '';
    const token = generateQrToken(restaurantId);
    if (!token) {
      container.innerHTML = '<p style="color:#ef4444; font-size:13px;">QR kod oluşturulamadı.</p>';
      return;
    }
    if (window.QRCode) {
      new QRCode(container, {
        text: token,
        width: 240,
        height: 240,
        colorDark: "#1e293b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    } else {
      container.textContent = 'QR kütüphanesi yüklenemedi.';
    }
  }

  renderQr();
  
  if (dynamicQrInterval) clearInterval(dynamicQrInterval);
  // Re-generate every 10 seconds to stay fresh
  dynamicQrInterval = setInterval(renderQr, 10000);
}

function stopDynamicQrStream() {
  if (dynamicQrInterval) {
    clearInterval(dynamicQrInterval);
    dynamicQrInterval = null;
  }
}

function openRestaurantQrModal() {
  const modal = document.getElementById('restaurantQrModal');
  if (modal) {
    const rId = window.restaurantId || (window.auth?.currentUser?.uid);
    if (!rId) {
      alert("Restoran kimliği bulunamadı. Lütfen sayfayı yenileyiniz.");
      return;
    }
    modal.classList.remove('hidden');
    if (typeof startDynamicQrStream === 'function') {
      startDynamicQrStream(rId, 'qrcodeContainer');
    }
  }
}

function closeRestaurantQrModal() {
  const modal = document.getElementById('restaurantQrModal');
  if (modal) {
    modal.classList.add('hidden');
    if (typeof stopDynamicQrStream === 'function') {
      stopDynamicQrStream();
    }
  }
}

window.openRestaurantQrModal = openRestaurantQrModal;
window.closeRestaurantQrModal = closeRestaurantQrModal;
