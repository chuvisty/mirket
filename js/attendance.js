// Vardiyan - Attendance & Clock-In / Clock-Out System

let dynamicQrInterval = null;
let html5QrScanner = null;
let currentActiveShift = null;

// --- 1. HAVERSINE DISTANCE CALCULATION (In Meters) ---
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- 2. DYNAMIC QR TOKEN GENERATION & PARSING ---
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

// --- 4. WORKER ACTIVE SHIFT CHECK & UI UPDATE ---
async function checkWorkerActiveShift(workerUid) {
  const statusContainer = document.getElementById('workerShiftStatus');
  if (!statusContainer) return;
  
  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('workerId', '==', workerUid),
      window.firebaseFirestore.where('status', '==', 'active')
    );
    const snapshot = await window.firebaseFirestore.getDocs(q);
    
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      currentActiveShift = { id: docSnap.id, ...docSnap.data() };
      
      const checkInTimeStr = currentActiveShift.checkInTime && typeof currentActiveShift.checkInTime.toDate === 'function'
        ? currentActiveShift.checkInTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : 'Belirtilmedi';
        
      statusContainer.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #22c55e; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
            <div>
              <span style="background: #166534; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">● AKTİF MESAİDE</span>
              <h3 style="margin: 8px 0 2px 0; color: #1e293b; font-size: 18px;">${currentActiveShift.restaurantName || 'Restoran'}</h3>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Giriş Saati: <strong style="color: #0f172a;">${checkInTimeStr}</strong></p>
            </div>
            <button class="btn primary" onclick="openQrScanModal()" style="background: #ef4444; border: none; padding: 12px 22px; font-size: 15px; display: inline-flex; align-items: center; gap: 8px;">
              <span>🚪 Çıkış Yap (Clock-Out)</span>
            </button>
          </div>
        </div>
      `;
    } else {
      currentActiveShift = null;
      statusContainer.innerHTML = `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid #f68709; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
            <div>
              <h3 style="margin: 0 0 4px 0; color: #1e293b; font-size: 18px;">Vardiya Giriş / Çıkış (Clock-In)</h3>
              <p style="margin: 0; font-size: 13px; color: #64748b;">İş yerinize ulaştığınızda restoran ekranındaki QR kodu okutarak mesainizi başlatın veya bitirin.</p>
            </div>
            <button class="btn primary" onclick="openQrScanModal()" style="padding: 12px 22px; font-size: 15px; display: inline-flex; align-items: center; gap: 8px;">
              <span>📷 QR Kod Okut (Giriş / Çıkış)</span>
            </button>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error checking worker active shift:", error);
  }
}

// --- 5. WORKER QR SCANNER & CLOCK-IN / OUT LOGIC ---
function openQrScanModal() {
  const modal = document.getElementById('qrScanModal');
  const msgEl = document.getElementById('qrScanMessage');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  if (msgEl) {
    msgEl.textContent = 'Konumunuz alınıyor ve kamera hazırlanıyor...';
    msgEl.className = 'auth-message info';
  }
  
  // Start Geolocation & Camera Scan
  startQrCameraScanner();
}

function closeQrScanModal() {
  const modal = document.getElementById('qrScanModal');
  if (modal) modal.classList.add('hidden');
  stopQrCameraScanner();
}

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

function startQrCameraScanner() {
  const msgEl = document.getElementById('qrScanMessage');

  if (!navigator.geolocation) {
    if (msgEl) {
      msgEl.textContent = 'Cihazınızda / Tarayıcınızda konum servisi desteklenmiyor.';
      msgEl.className = 'auth-message error';
    }
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
      if (msgEl) {
        msgEl.textContent = 'Konumunuz alınamadı. Lütfen tarayıcınızın konum iznini kontrol edin.';
        msgEl.className = 'auth-message error';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// Process Clock-In / Clock-Out transaction
async function processClockInOut(scannedToken, workerCoords) {
  const msgEl = document.getElementById('qrScanMessage');
  
  try {
    // 1. Token validation
    const parsed = parseQrToken(scannedToken);
    if (!parsed) {
      throw new Error('Geçersiz QR Kod. Lütfen Vardiyan Restoran QR kodunu okutunuz.');
    }
    if (!parsed.valid) {
      throw new Error(parsed.error);
    }
    
    const restaurantId = parsed.restaurantId;
    const workerUser = window.auth.currentUser;
    if (!workerUser) {
      throw new Error('Oturum açmış kullanıcı bulunamadı.');
    }

    // 2. Fetch Restaurant Data for Location
    const restDocRef = window.firebaseFirestore.doc(window.db, 'users', restaurantId);
    const restSnap = await window.firebaseFirestore.getDoc(restDocRef);
    
    if (!restSnap.exists()) {
      throw new Error('Restoran kaydı bulunamadı.');
    }

    const restData = restSnap.data();
    const restLocation = restData.location;
    
    if (!restLocation || !restLocation.latitude || !restLocation.longitude) {
      throw new Error('Bu restoran henüz işletme konumunu sisteme kaydetmemiş. Lütfen yetkiliye bildiriniz.');
    }

    const allowedRadius = restLocation.radiusMeters || 150;
    const distanceMeters = calculateDistanceMeters(
      workerCoords.lat,
      workerCoords.lng,
      restLocation.latitude,
      restLocation.longitude
    );

    if (distanceMeters > allowedRadius) {
      throw new Error(`Konum Doğrulanamadı: Restorandan çok uzaktasınız. (Mesafe: ${Math.round(distanceMeters)}m, İzin Verilen Maksimum: ${allowedRadius}m)`);
    }

    // Fetch Worker user info to get name/phone
    let workerName = 'Çalışan';
    let workerPhone = '';
    const workerDocRef = window.firebaseFirestore.doc(window.db, 'users', workerUser.uid);
    const workerSnap = await window.firebaseFirestore.getDoc(workerDocRef);
    if (workerSnap.exists()) {
      const wData = workerSnap.data();
      workerName = wData.employeeName || wData.authorizedName || workerUser.displayName || 'Çalışan';
      workerPhone = wData.employeePhone || wData.authorizedPhone || wData.phone || '';
    }

    // 3. Check if there's an ACTIVE shift for this worker
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('workerId', '==', workerUser.uid),
      window.firebaseFirestore.where('status', '==', 'active')
    );
    const activeShiftSnap = await window.firebaseFirestore.getDocs(q);

    const todayStr = new Date().toISOString().split('T')[0];
    const matchingActiveDoc = activeShiftSnap.docs.find(d => d.data().restaurantId === restaurantId);

    if (matchingActiveDoc) {
      // --- CLOCK-OUT ACTION ---
      const activeDoc = matchingActiveDoc;
      const shiftData = activeDoc.data();
      
      const checkInDate = shiftData.checkInTime && typeof shiftData.checkInTime.toDate === 'function'
        ? shiftData.checkInTime.toDate()
        : new Date();
      const checkOutDate = new Date();
      const totalMinutes = Math.max(1, Math.round((checkOutDate - checkInDate) / 60000));

      const nowTimeStr = checkOutDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      await window.firebaseFirestore.updateDoc(
        window.firebaseFirestore.doc(window.db, 'shifts', activeDoc.id),
        {
          status: 'completed',
          checkOutTime: window.firebaseFirestore.serverTimestamp(),
          endTime: nowTimeStr,
          totalWorkedMinutes: totalMinutes,
          checkOutGeo: {
            lat: workerCoords.lat,
            lng: workerCoords.lng,
            distanceMeters: Math.round(distanceMeters)
          }
        }
      );

      if (msgEl) {
        msgEl.textContent = `✅ Mesainiz Başarıyla Sonlandırıldı! Toplam Süre: ${Math.floor(totalMinutes / 60)}sa ${totalMinutes % 60}dk`;
        msgEl.className = 'auth-message success';
      }

    } else {
      // --- CLOCK-IN ACTION ---
      const nowTimeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      await window.firebaseFirestore.addDoc(
        window.firebaseFirestore.collection(window.db, 'shifts'),
        {
          restaurantId: restaurantId,
          restaurantName: restData.businessName || 'Restoran',
          workerId: workerUser.uid,
          workerName: workerName,
          workerPhone: workerPhone,
          date: todayStr,
          startTime: nowTimeStr,
          endTime: null,
          checkInTime: window.firebaseFirestore.serverTimestamp(),
          checkOutTime: null,
          status: 'active',
          checkInGeo: {
            lat: workerCoords.lat,
            lng: workerCoords.lng,
            distanceMeters: Math.round(distanceMeters)
          },
          checkOutGeo: null,
          totalWorkedMinutes: 0,
          isManualOverride: false
        }
      );

      if (msgEl) {
        msgEl.textContent = `✅ Restorana Giriş Yapıldı! Mesainiz başlatıldı (${nowTimeStr}). İyi çalışmalar!`;
        msgEl.className = 'auth-message success';
      }
    }

    // Refresh UI & Close scanner modal after 2.5 seconds
    setTimeout(() => {
      closeQrScanModal();
      checkWorkerActiveShift(workerUser.uid);
    }, 2500);

  } catch (err) {
    console.error("Clock In/Out processing error:", err);
    if (msgEl) {
      msgEl.textContent = err.message || 'Giriş/Çıkış işlemi yapılırken bir hata oluştu.';
      msgEl.className = 'auth-message error';
    }
    // Resume camera scanning if user wants to try again
    if (html5QrScanner) {
      setTimeout(() => {
        try { html5QrScanner.resume(); } catch(e){}
      }, 3000);
    }
  }
}

// --- 6. RESTORAN RESTAURANT LOCATION MANAGEMENT ---
async function getCurrentGeoLocationAndSave(restaurantUid) {
  const msgEl = document.getElementById('locationSaveMessage');
  if (!navigator.geolocation) {
    if (msgEl) {
      msgEl.textContent = 'Cihazınızda konum servisi desteklenmiyor.';
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  if (msgEl) {
    msgEl.textContent = 'Mevcut konumunuz alınıyor...';
    msgEl.className = 'auth-message info';
    msgEl.classList.remove('hidden');
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const radius = parseInt(document.getElementById('restaurantGeofenceRadius')?.value || 150, 10);

      try {
        await window.firebaseFirestore.updateDoc(
          window.firebaseFirestore.doc(window.db, 'users', restaurantUid),
          {
            location: {
              latitude: lat,
              longitude: lng,
              radiusMeters: radius,
              updatedAt: window.firebaseFirestore.serverTimestamp()
            }
          }
        );

        if (document.getElementById('restaurantLat')) document.getElementById('restaurantLat').value = lat.toFixed(6);
        if (document.getElementById('restaurantLng')) document.getElementById('restaurantLng').value = lng.toFixed(6);

        if (msgEl) {
          msgEl.textContent = `✅ Restoran konumu kaydedildi: Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)} (${radius}m yarıçap)`;
          msgEl.className = 'auth-message success';
        }
      } catch (err) {
        console.error("Error saving restaurant location:", err);
        if (msgEl) {
          msgEl.textContent = 'Konum kaydedilirken bir hata oluştu.';
          msgEl.className = 'auth-message error';
        }
      }
    },
    (err) => {
      console.error("Location error:", err);
      if (msgEl) {
        msgEl.textContent = 'Konum alınamadı. Lütfen konum izinlerinizi kontrol edin.';
        msgEl.className = 'auth-message error';
      }
    },
    { enableHighAccuracy: true }
  );
}

// --- 7. ATTENDANCE REPORTING & CSV EXPORT ---
let loadedAttendanceShifts = [];

async function loadAttendanceLogs(restaurantId, filterPeriod = 'today') {
  const tableBody = document.getElementById('attendanceLogsTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Mesai kayıtları yükleniyor...</td></tr>';

  try {
    let q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId)
    );

    const snapshot = await window.firebaseFirestore.getDocs(q);
    let shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Date filtering client-side for flexibility
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (filterPeriod === 'today') {
      shifts = shifts.filter(s => s.date === todayStr);
    } else if (filterPeriod === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      shifts = shifts.filter(s => s.date >= weekAgoStr);
    } else if (filterPeriod === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(now.getMonth() - 1);
      const monthAgoStr = monthAgo.toISOString().split('T')[0];
      shifts = shifts.filter(s => s.date >= monthAgoStr);
    }

    // Sort by checkInTime descending
    shifts.sort((a, b) => {
      const tA = a.checkInTime && typeof a.checkInTime.toDate === 'function' ? a.checkInTime.toDate() : new Date(a.date);
      const tB = b.checkInTime && typeof b.checkInTime.toDate === 'function' ? b.checkInTime.toDate() : new Date(b.date);
      return tB - tA;
    });

    loadedAttendanceShifts = shifts;
    renderAttendanceTable(shifts);

  } catch (error) {
    console.error("Error loading attendance logs:", error);
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#ef4444;">Kayıtlar yüklenirken hata oluştu.</td></tr>';
  }
}

function renderAttendanceTable(shifts) {
  const tableBody = document.getElementById('attendanceLogsTableBody');
  if (!tableBody) return;

  if (shifts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">Seçilen dönemde mesai kaydı bulunamadı.</td></tr>';
    return;
  }

  tableBody.innerHTML = shifts.map(shift => {
    const inTime = shift.checkInTime && typeof shift.checkInTime.toDate === 'function'
      ? shift.checkInTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (shift.startTime || '-');

    const outTime = shift.checkOutTime && typeof shift.checkOutTime.toDate === 'function'
      ? shift.checkOutTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (shift.status === 'active' ? '<span style="color:#eab308; font-weight:700;">Devam Ediyor</span>' : (shift.endTime || '-'));

    let totalDuration = '-';
    if (shift.totalWorkedMinutes) {
      const hrs = Math.floor(shift.totalWorkedMinutes / 60);
      const mins = shift.totalWorkedMinutes % 60;
      totalDuration = `${hrs}sa ${mins}dk`;
    }

    const geoBadge = shift.checkInGeo
      ? `<span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px;" title="GPS ile doğrulandı (${shift.checkInGeo.distanceMeters}m)">✓ GPS Doğrulandı</span>`
      : `<span style="font-size:11px; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">Manuel</span>`;

    const statusBadge = shift.status === 'active'
      ? `<span style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Aktif</span>`
      : `<span style="background:#10b981; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Tamamlandı</span>`;

    const overrideBtn = shift.status === 'active'
      ? `<button class="btn ghost" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="manualOverrideClockOut('${shift.id}')">Manuel Kapat</button>`
      : '';

    return `
      <tr>
        <td><strong>${shift.workerName || 'Çalışan'}</strong><br><span style="font-size:11px; color:#64748b;">${shift.workerPhone || ''}</span></td>
        <td>${shift.date}</td>
        <td>${inTime}</td>
        <td>${outTime}</td>
        <td>${totalDuration}</td>
        <td>${statusBadge} ${geoBadge} ${overrideBtn}</td>
      </tr>
    `;
  }).join('');
}

async function manualOverrideClockOut(shiftId) {
  if (!confirm("Bu çalışanın devam eden vardiyasını manuel olarak kapatmak istediğinize emin misiniz?")) return;

  try {
    const shiftRef = window.firebaseFirestore.doc(window.db, 'shifts', shiftId);
    const snap = await window.firebaseFirestore.getDoc(shiftRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const checkInDate = data.checkInTime && typeof data.checkInTime.toDate === 'function' ? data.checkInTime.toDate() : new Date();
    const checkOutDate = new Date();
    const totalMinutes = Math.max(1, Math.round((checkOutDate - checkInDate) / 60000));

    await window.firebaseFirestore.updateDoc(shiftRef, {
      status: 'completed',
      checkOutTime: window.firebaseFirestore.serverTimestamp(),
      endTime: checkOutDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      totalWorkedMinutes: totalMinutes,
      isManualOverride: true
    });

    alert("Vardiya manuel olarak kapatıldı.");
    if (window.auth.currentUser) {
      loadAttendanceLogs(window.auth.currentUser.uid);
    }
  } catch (err) {
    console.error("Error overriding shift:", err);
    alert("Vardiya kapatılırken hata oluştu.");
  }
}

function exportAttendanceToCSV() {
  if (!loadedAttendanceShifts || loadedAttendanceShifts.length === 0) {
    alert("Dışa aktarılacak mesai kaydı bulunamadı.");
    return;
  }

  const headers = ["Çalışan Adı", "Telefon", "Tarih", "Giriş Saati", "Çıkış Saati", "Toplam Dakika", "Durum", "GPS Doğrulama"];
  const rows = loadedAttendanceShifts.map(s => {
    const inTime = s.checkInTime && typeof s.checkInTime.toDate === 'function'
      ? s.checkInTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (s.startTime || '');
    const outTime = s.checkOutTime && typeof s.checkOutTime.toDate === 'function'
      ? s.checkOutTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (s.endTime || '');

    return [
      `"${s.workerName || ''}"`,
      `"${s.workerPhone || ''}"`,
      `"${s.date || ''}"`,
      `"${inTime}"`,
      `"${outTime}"`,
      `"${s.totalWorkedMinutes || 0}"`,
      `"${s.status === 'active' ? 'Aktif' : 'Tamamlandı'}"`,
      `"${s.checkInGeo ? 'GPS Doğrulandı (' + s.checkInGeo.distanceMeters + 'm)' : 'Manuel'}"`
    ].join(',');
  });

  const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `vardiyan_mesai_raporu_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
