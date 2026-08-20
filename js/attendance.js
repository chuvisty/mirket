// Vardiyan - Attendance & Clock-In / Clock-Out System

let dynamicQrInterval = null;
let html5QrScanner = null;
let currentActiveShift = null;

function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

// --- 3A. FIND ASSIGNED SHIFT FOR WORKER ---
async function findAssignedShiftForWorker(restaurantId, workerId, dateStr) {
  try {
    const workerDocRef = window.firebaseFirestore.doc(window.db, 'users', workerId);
    const workerSnap = await window.firebaseFirestore.getDoc(workerDocRef);
    let workerPhone = '';
    let workerName = '';
    if (workerSnap.exists()) {
      const wData = workerSnap.data();
      workerPhone = wData.employeePhone || wData.phone || '';
      workerName = wData.employeeName || wData.authorizedName || '';
    }

    const staffRef = window.firebaseFirestore.collection(window.db, 'restaurantStaff');
    const staffCandidates = [];

    const staffQ = window.firebaseFirestore.query(
      staffRef,
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('vardiyanUserId', '==', workerId)
    );
    const staffSnapshot = await window.firebaseFirestore.getDocs(staffQ);
    staffSnapshot.forEach(doc => staffCandidates.push({ id: doc.id, ...doc.data() }));

    if (workerPhone) {
      const phoneQ = window.firebaseFirestore.query(
        staffRef,
        window.firebaseFirestore.where('restaurantId', '==', restaurantId)
      );
      const phoneSnapshot = await window.firebaseFirestore.getDocs(phoneQ);
      phoneSnapshot.forEach(doc => {
        const data = doc.data();
        const normalizedStaffPhone = typeof window.normalizePhone === 'function'
          ? window.normalizePhone(data.phone)
          : '';
        const normalizedWorkerPhone = typeof window.normalizePhone === 'function'
          ? window.normalizePhone(workerPhone)
          : '';
        if (normalizedStaffPhone && normalizedWorkerPhone && normalizedStaffPhone === normalizedWorkerPhone) {
          if (!staffCandidates.some(candidate => candidate.id === doc.id)) {
            staffCandidates.push({ id: doc.id, ...data });
          }
        }
      });
    }

    const preferredStaffIds = new Set(staffCandidates.map(candidate => candidate.id));

    const shiftQ = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('date', '==', dateStr)
    );
    const shiftSnapshot = await window.firebaseFirestore.getDocs(shiftQ);

    if (shiftSnapshot.empty) {
      return null;
    }

    const shiftsForDay = shiftSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const directMatch = shiftsForDay.find(shift => preferredStaffIds.has(shift.staffId));
    if (directMatch) {
      console.info('[QR Shift Match]', 'direct', { dateStr, workerId, shiftId: directMatch.id, staffId: directMatch.staffId, startTime: directMatch.startTime, endTime: directMatch.endTime });
      return formatShiftMatch(directMatch);
    }

    const workerMatch = shiftsForDay.find(shift => shift.workerId === workerId);
    if (workerMatch) {
      console.info('[QR Shift Match]', 'workerId', { dateStr, workerId, shiftId: workerMatch.id, staffId: workerMatch.staffId, startTime: workerMatch.startTime, endTime: workerMatch.endTime });
      return formatShiftMatch(workerMatch);
    }

    const nameMatch = shiftsForDay.find(shift => shift.workerName === workerName);
    if (nameMatch) {
      console.info('[QR Shift Match]', 'workerName', { dateStr, workerId, shiftId: nameMatch.id, staffId: nameMatch.staffId, startTime: nameMatch.startTime, endTime: nameMatch.endTime });
      return formatShiftMatch(nameMatch);
    }

    const unassignedMatch = shiftsForDay.find(shift => !shift.workerId && !shift.workerName && !shift.checkInTime && !shift.checkOutTime);
    if (unassignedMatch) {
      console.info('[QR Shift Match]', 'unassigned', { dateStr, workerId, shiftId: unassignedMatch.id, staffId: unassignedMatch.staffId, startTime: unassignedMatch.startTime, endTime: unassignedMatch.endTime });
      return formatShiftMatch(unassignedMatch);
    }

    const singleShift = shiftsForDay.length === 1 ? shiftsForDay[0] : null;
    if (singleShift) {
      console.info('[QR Shift Match]', 'single', { dateStr, workerId, shiftId: singleShift.id, staffId: singleShift.staffId, startTime: singleShift.startTime, endTime: singleShift.endTime });
      return formatShiftMatch(singleShift);
    }

    return null;
  } catch (error) {
    console.error("Error finding assigned shift for worker:", error);
    return null;
  }
}

function formatShiftMatch(shiftData) {
  return {
    shiftDocId: shiftData.id,
    shiftId: shiftData.id,
    startTime: shiftData.startTime || null,
    endTime: shiftData.endTime || null,
    role: shiftData.role || null,
    notes: shiftData.notes || null
  };
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

// --- AUTO-END SHIFT LOGIC FOR EXPIRED SHIFTS ---
async function autoCloseExpiredShifts(restaurantId) {
  if (!restaurantId) return;

  try {
    const userSnap = await window.firebaseFirestore.getDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId)
    );
    if (!userSnap.exists()) return;
    const userData = userSnap.data();

    // Check if feature flag autoEndShiftAtScheduledTime is enabled for restaurant
    if (!userData.autoEndShiftAtScheduledTime) return;

    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('status', '==', 'active')
    );
    const snap = await window.firebaseFirestore.getDocs(q);
    if (snap.empty) return;

    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentHourMin = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false });

    const expiredShifts = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.date || !data.endTime) return;

      // Auto close if shift date is in the past OR shift date is today and current time >= endTime
      if (data.date < todayStr || (data.date === todayStr && currentHourMin >= data.endTime)) {
        expiredShifts.push({ id: docSnap.id, ...data });
      }
    });

    if (expiredShifts.length > 0) {
      const batch = window.firebaseFirestore.writeBatch(window.db);
      expiredShifts.forEach(shift => {
        const ref = window.firebaseFirestore.doc(window.db, 'shifts', shift.id);
        batch.update(ref, {
          status: 'completed',
          checkOutTime: shift.endTime,
          autoEnded: true
        });
      });
      await batch.commit();
      console.info(`[Auto-End Shift] Automatically completed ${expiredShifts.length} expired shift(s).`);
    }
  } catch (err) {
    console.error("Error auto closing expired shifts:", err);
  }
}

window.autoCloseExpiredShifts = autoCloseExpiredShifts;

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
      const shiftData = docSnap.data();

      // Check auto-end rule for this shift's restaurant
      if (shiftData.restaurantId) {
        await autoCloseExpiredShifts(shiftData.restaurantId);
        // Re-check doc state after potential auto-close
        const freshSnap = await window.firebaseFirestore.getDoc(docSnap.ref);
        if (freshSnap.exists() && freshSnap.data().status === 'completed') {
          return checkWorkerActiveShift(workerUid); // refresh UI for completed state
        }
      }

      currentActiveShift = { id: docSnap.id, ...shiftData };
      
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

// --- 5. WORKER QR SCANNER & LOCATION PERMISSION MODALS ---
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

async function toggleChecklistItem(shiftId, taskId, isCompleted) {
  try {
    const shiftRef = window.firebaseFirestore.doc(window.db, 'shifts', shiftId);
    const snap = await window.firebaseFirestore.getDoc(shiftRef);
    if (!snap.exists()) return;

    const data = snap.data();
    if (!data.checklist) return;

    const updatedChecklist = data.checklist.map(item => {
      if (item.id === taskId) {
        return { ...item, completed: isCompleted, completedAt: isCompleted ? new Date().toISOString() : null };
      }
      return item;
    });

    await window.firebaseFirestore.updateDoc(shiftRef, { checklist: updatedChecklist });
    
    // Update local state if active
    if (currentActiveShift && currentActiveShift.id === shiftId) {
      currentActiveShift.checklist = updatedChecklist;
      const workerUid = window.auth?.currentUser?.uid;
      if (workerUid) checkWorkerActiveShift(workerUid);
    }
  } catch (err) {
    console.error("Error toggling checklist item:", err);
  }
}
window.toggleChecklistItem = toggleChecklistItem;

// --- CHECKLIST DETAIL MODAL FOR REPORTING ---
function openShiftChecklistDetailModal(shiftId) {
  const modal = document.getElementById('shiftChecklistDetailModal');
  const subtitle = document.getElementById('checklistDetailSubtitle');
  const content = document.getElementById('checklistDetailContent');
  if (!modal || !content) return;

  const allShifts = loadedAttendanceShifts && loadedAttendanceShifts.length > 0 ? loadedAttendanceShifts : (window.currentShifts || []);
  const shift = allShifts.find(s => s.id === shiftId);
  if (!shift || !shift.checklist || shift.checklist.length === 0) {
    alert("Bu vardiyaya ait görev bulunamadı.");
    return;
  }

  if (subtitle) {
    subtitle.textContent = `${shift.workerName || 'Çalışan'} - ${shift.date} (${shift.startTime || ''}-${shift.endTime || ''})`;
  }

  content.innerHTML = shift.checklist.map((item, idx) => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: ${item.completed ? '#f0fdf4' : '#f8fafc'}; border: 1px solid ${item.completed ? '#bbf7d0' : '#e2e8f0'}; border-radius: 8px; padding: 10px 12px; font-size: 13px;">
      <span style="color: ${item.completed ? '#166534' : '#334155'}; font-weight: 500;">
        ${item.completed ? '✅' : '⏳'} ${idx + 1}. ${item.task}
      </span>
      <span style="font-size: 11px; color: ${item.completed ? '#15803d' : '#94a3b8'};">
        ${item.completed ? 'Tamamlandı' : 'Bekliyor'}
      </span>
    </div>
  `).join('');

  modal.classList.remove('hidden');
}

function closeShiftChecklistDetailModal() {
  const modal = document.getElementById('shiftChecklistDetailModal');
  if (modal) modal.classList.add('hidden');
}

window.openShiftChecklistDetailModal = openShiftChecklistDetailModal;
window.closeShiftChecklistDetailModal = closeShiftChecklistDetailModal;

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

// Process Clock-In / Clock-Out transaction
async function processClockInOut(scannedToken, workerCoords) {
  const msgEl = document.getElementById('qrScanMessage');
  
  try {
    // 1. Token validation
    const parsed = parseQrToken(scannedToken);
    if (!parsed) {
      throw new Error('Geçersiz QR Kod. Lütfen Mirket Restoran QR kodunu okutunuz.');
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

    // 3. Check if there's an ACTIVE shift for this worker TODAY
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('workerId', '==', workerUser.uid),
      window.firebaseFirestore.where('status', '==', 'active')
    );
    const activeShiftSnap = await window.firebaseFirestore.getDocs(q);

    const todayStr = getLocalDateString();
    const matchingActiveDoc = activeShiftSnap.docs.find(d => {
      const data = d.data();
      return data.restaurantId === restaurantId && data.date === todayStr;
    });

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

      const updateData = {
        status: 'completed',
        checkOutTime: window.firebaseFirestore.serverTimestamp(),
        totalWorkedMinutes: totalMinutes,
        checkOutGeo: {
          lat: workerCoords.lat,
          lng: workerCoords.lng,
          distanceMeters: Math.round(distanceMeters)
        }
      };

      if (!shiftData.endTime || shiftData.endTime === null || shiftData.endTime === '') {
        updateData.endTime = nowTimeStr;
      }

      await window.firebaseFirestore.updateDoc(
        window.firebaseFirestore.doc(window.db, 'shifts', activeDoc.id),
        updateData
      );

      if (msgEl) {
        msgEl.textContent = `✅ Mesainiz Başarıyla Sonlandırıldı! Toplam Süre: ${Math.floor(totalMinutes / 60)}sa ${totalMinutes % 60}dk`;
        msgEl.className = 'auth-message success';
      }

    } else {
      // --- CLOCK-IN ACTION ---
      const nowTimeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      let assignedShiftInfo = await findAssignedShiftForWorker(restaurantId, workerUser.uid, todayStr);

      if (assignedShiftInfo) {
        await window.firebaseFirestore.updateDoc(
          window.firebaseFirestore.doc(window.db, 'shifts', assignedShiftInfo.shiftDocId),
          {
            checkInTime: window.firebaseFirestore.serverTimestamp(),
            checkInGeo: {
              lat: workerCoords.lat,
              lng: workerCoords.lng,
              distanceMeters: Math.round(distanceMeters)
            },
            workerId: workerUser.uid,
            workerName: workerName,
            workerPhone: workerPhone,
            status: 'active',
            startTime: assignedShiftInfo.startTime || nowTimeStr,
            endTime: assignedShiftInfo.endTime || null
          }
        );
        
        if (msgEl) {
          const vardiaDuration = assignedShiftInfo.endTime ? ` (${assignedShiftInfo.startTime} - ${assignedShiftInfo.endTime})` : '';
          msgEl.textContent = `✅ Restorana Giriş Yapıldı! Mesainiz başlatıldı${vardiaDuration}. İyi çalışmalar!`;
          msgEl.className = 'auth-message success';
        }
      } else {
        console.warn('No assigned shift matched for QR clock-in; creating new shift card', {
          restaurantId,
          workerId: workerUser.uid,
          workerName,
          workerPhone,
          date: todayStr,
          reason: 'planned shift could not be matched by staff linkage or phone fallback'
        });
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

  tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748b;">Mesai kayıtları yükleniyor...</td></tr>';

  try {
    await autoCloseExpiredShifts(restaurantId);

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
      monthAgo.setMonth(monthAgo.getMonth() - 1);
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
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#ef4444;">Kayıtlar yüklenirken hata oluştu.</td></tr>';
  }
}

function renderAttendanceTable(shifts) {
  const tableBody = document.getElementById('attendanceLogsTableBody');
  if (!tableBody) return;

  if (shifts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">Seçilen dönemde mesai kaydı bulunamadı.</td></tr>';
    return;
  }

  const staffList = window.staffMembers || [];
  let totalWorkedHoursPeriod = 0;
  let totalPayrollPeriod = 0;

  const rowsHtml = shifts.map(shift => {
    // 1. Clock times
    const checkInDate = shift.checkInTime && typeof shift.checkInTime.toDate === 'function' ? shift.checkInTime.toDate() : null;
    const checkOutDate = shift.checkOutTime && typeof shift.checkOutTime.toDate === 'function' ? shift.checkOutTime.toDate() : null;

    const inTime = checkInDate
      ? checkInDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (shift.startTime || '-');

    const outTime = checkOutDate
      ? checkOutDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (shift.status === 'active' ? '<span style="color:#eab308; font-weight:700;">Devam Ediyor</span>' : (shift.endTime || '-'));

    // 2. Worked Hours & Wage Calculation
    let workedHours = 0;
    if (shift.totalWorkedMinutes) {
      workedHours = shift.totalWorkedMinutes / 60;
    } else if (checkInDate && checkOutDate) {
      workedHours = (checkOutDate - checkInDate) / 3600000;
    } else if (shift.startTime && shift.endTime && shift.status === 'completed') {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins <= 0) mins += 24 * 60;
      workedHours = mins / 60;
    }

    totalWorkedHoursPeriod += workedHours;

    // Find staff wage info
    const staff = shift.staffId ? staffList.find(s => s.id === shift.staffId) : null;
    let earnings = 0;
    let wageLabel = '-';

    if (staff && staff.wageAmount) {
      if (staff.wageType === 'daily') {
        earnings = staff.wageAmount;
        wageLabel = `${earnings.toLocaleString('tr-TR')} ₺ (Günlük)`;
      } else {
        earnings = workedHours * staff.wageAmount;
        wageLabel = `${Math.round(earnings).toLocaleString('tr-TR')} ₺ (${staff.wageAmount} TL/s)`;
      }
    }
    totalPayrollPeriod += earnings;

    // 3. Punctuality status badge
    let punctualityBadge = '';
    if (checkInDate && shift.startTime) {
      const actualMins = checkInDate.getHours() * 60 + checkInDate.getMinutes();
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const schedMins = sh * 60 + sm;
      const diff = actualMins - schedMins;

      if (diff <= 5) {
        punctualityBadge = `<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">🟢 Zamanında</span>`;
      } else if (diff <= 15) {
        punctualityBadge = `<span style="background:#f59e0b; color:white; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">🟡 +${diff} dk</span>`;
      } else {
        punctualityBadge = `<span style="background:#ef4444; color:white; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">🔴 +${diff} dk</span>`;
      }
    }

    // 4. Checklist status badge
    let checklistBadge = '<span style="color:#94a3b8;">-</span>';
    if (shift.checklist && shift.checklist.length > 0) {
      const done = shift.checklist.filter(c => c.completed).length;
      const total = shift.checklist.length;
      const pct = Math.round((done / total) * 100);
      const isAllDone = done === total;
      checklistBadge = `
        <button type="button" class="btn ghost" style="padding:2px 8px; font-size:11px; border:1px solid ${isAllDone ? '#bbf7d0' : '#cbd5e1'}; background:${isAllDone ? '#f0fdf4' : '#f8fafc'}; color:${isAllDone ? '#15803d' : '#334155'}; font-weight:600;" onclick="openShiftChecklistDetailModal('${shift.id}')">
          📋 %${pct} (${done}/${total})
        </button>
      `;
    }

    const geoBadge = shift.checkInGeo
      ? `<span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px;" title="GPS ile doğrulandı (${shift.checkInGeo.distanceMeters}m)">✓ GPS</span>`
      : `<span style="font-size:11px; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">Manuel</span>`;

    const statusBadge = shift.status === 'active'
      ? `<span style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Aktif</span>`
      : `<span style="background:#10b981; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Tamamlandı</span>`;

    const overrideBtn = shift.status === 'active'
      ? `<button class="btn ghost" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="manualOverrideClockOut('${shift.id}')">Kapat</button>`
      : '';

    const scheduledInfo = (shift.startTime && shift.endTime)
      ? `<div style="font-size:10px; color:#94a3b8; margin-top:2px;">📅 Plan: ${shift.startTime} - ${shift.endTime}</div>`
      : '';

    return `
      <tr>
        <td>
          <strong>${shift.workerName || (staff ? staff.name : 'Çalışan')}</strong><br>
          <span style="font-size:11px; color:#64748b;">${shift.workerPhone || (staff ? staff.phone : '') || ''}</span>
          ${scheduledInfo}
        </td>
        <td>${shift.date}</td>
        <td>${inTime}</td>
        <td>${outTime}</td>
        <td><strong>${workedHours > 0 ? workedHours.toFixed(1) + ' Sa' : '-'}</strong></td>
        <td><strong style="color: #047857;">${wageLabel}</strong></td>
        <td>${checklistBadge}</td>
        <td>${punctualityBadge} ${statusBadge} ${geoBadge} ${overrideBtn}</td>
      </tr>
    `;
  }).join('');

  // Add summary footer row
  const footerRow = `
    <tr style="background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0;">
      <td colspan="4" style="text-align: right; padding: 12px 10px;">TOPLAM (DÖNEM):</td>
      <td style="padding: 12px 10px; color: #0f172a;">${totalWorkedHoursPeriod.toFixed(1)} Saat</td>
      <td style="padding: 12px 10px; color: #047857;">${Math.round(totalPayrollPeriod).toLocaleString('tr-TR')} ₺</td>
      <td colspan="2"></td>
    </tr>
  `;

  tableBody.innerHTML = rowsHtml + footerRow;
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

  const staffList = window.staffMembers || [];

  const headers = ["Çalışan Adı", "Telefon", "Tarih", "Giriş Saati", "Çıkış Saati", "Çalışılan Saat", "Hakediş Tutarı (TL)", "Görev Tamamlama", "Zamanındalık", "Durum"];
  const rows = loadedAttendanceShifts.map(s => {
    const inTime = s.checkInTime && typeof s.checkInTime.toDate === 'function'
      ? s.checkInTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (s.startTime || '');
    const outTime = s.checkOutTime && typeof s.checkOutTime.toDate === 'function'
      ? s.checkOutTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (s.endTime || '');

    let workedHours = s.totalWorkedMinutes ? (s.totalWorkedMinutes / 60) : 0;
    const staff = s.staffId ? staffList.find(st => st.id === s.staffId) : null;
    let earnings = 0;
    if (staff && staff.wageAmount) {
      earnings = staff.wageType === 'daily' ? staff.wageAmount : (workedHours * staff.wageAmount);
    }

    let checklistStr = '-';
    if (s.checklist && s.checklist.length > 0) {
      const done = s.checklist.filter(c => c.completed).length;
      checklistStr = `${done}/${s.checklist.length} (%${Math.round((done/s.checklist.length)*100)})`;
    }

    let punctualityStr = 'Belirtilmedi';
    if (s.checkInTime && s.startTime) {
      const cDate = typeof s.checkInTime.toDate === 'function' ? s.checkInTime.toDate() : new Date(s.checkInTime);
      const actualMins = cDate.getHours() * 60 + cDate.getMinutes();
      const [sh, sm] = s.startTime.split(':').map(Number);
      const diff = actualMins - (sh * 60 + sm);
      punctualityStr = diff <= 5 ? 'Zamanında' : `+${diff} dk Geç`;
    }

    return [
      `"${s.workerName || (staff ? staff.name : '')}"`,
      `"${s.workerPhone || (staff ? staff.phone : '') || ''}"`,
      `"${s.date || ''}"`,
      `"${inTime}"`,
      `"${outTime}"`,
      `"${workedHours.toFixed(1)}"`,
      `"${Math.round(earnings)}"`,
      `"${checklistStr}"`,
      `"${punctualityStr}"`,
      `"${s.status === 'active' ? 'Aktif' : 'Tamamlandı'}"`
    ].join(',');
  });

  const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `mirket_mesai_raporu_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
