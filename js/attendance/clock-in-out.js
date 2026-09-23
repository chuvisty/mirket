// --- CLOCK IN/OUT: Core attendance engine, geo validation & auto-close ---
// --- AUTO-END SHIFT LOGIC FOR EXPIRED & UNCLOSED SHIFTS ---
async function autoCloseExpiredShifts(restaurantId) {
  if (!restaurantId) return;

  try {
    const userSnap = await window.firebaseFirestore.getDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId)
    );
    if (!userSnap.exists()) return;
    const userData = userSnap.data();

    const openingHour = typeof userData.openingHour === 'number' ? userData.openingHour : 6;
    let closingHour = typeof userData.closingHour === 'number' ? userData.closingHour : 23;
    if (closingHour === 24) closingHour = 0;

    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('status', '==', 'active')
    );
    const snap = await window.firebaseFirestore.getDocs(q);
    if (snap.empty) return;

    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentHourMin = now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });

    const expiredShifts = [];

    snap.forEach(docSnap => {
      const data = docSnap.data();
      let shiftDate = data.date;
      if (!shiftDate && data.checkInTime && typeof data.checkInTime.toDate === 'function') {
        shiftDate = getLocalDateString(data.checkInTime.toDate());
      }
      if (!shiftDate) shiftDate = todayStr;

      // Calculate restaurant closing Date for this shift
      let isExpired = false;
      let checkOutTimestamp = null;

      try {
        const parts = shiftDate.split('-').map(Number);
        if (parts.length === 3) {
          const [sYear, sMonth, sDay] = parts;
          const shiftClosingDate = new Date(sYear, sMonth - 1, sDay, closingHour, 0, 0);

          // If closingHour <= openingHour, restaurant closes on the following morning (e.g. 08:00 -> 01:00)
          if (closingHour <= openingHour) {
            shiftClosingDate.setDate(shiftClosingDate.getDate() + 1);
          }

          if (now >= shiftClosingDate) {
            isExpired = true;
            checkOutTimestamp = window.firebaseFirestore.Timestamp.fromDate(shiftClosingDate);
          }
        }
      } catch (dateErr) {
        console.warn("Date parsing error in autoCloseExpiredShifts:", dateErr);
      }

      // Also check if scheduled endTime has passed AND restaurant has autoEndShiftAtScheduledTime enabled
      if (!isExpired && userData.autoEndShiftAtScheduledTime && data.endTime) {
        if (shiftDate < todayStr || (shiftDate === todayStr && currentHourMin >= data.endTime)) {
          isExpired = true;
          checkOutTimestamp = data.endTime;
        }
      }

      // If shift is older than yesterday, it is unconditionally expired
      if (!isExpired && shiftDate < todayStr) {
        isExpired = true;
        checkOutTimestamp = checkOutTimestamp || window.firebaseFirestore.Timestamp.fromDate(now);
      }

      if (isExpired) {
        expiredShifts.push({
          id: docSnap.id,
          checkOutTime: checkOutTimestamp || `${String(closingHour).padStart(2, '0')}:00`,
          ...data
        });
      }
    });

    if (expiredShifts.length > 0) {
      const batch = window.firebaseFirestore.writeBatch(window.db);
      expiredShifts.forEach(shift => {
        const ref = window.firebaseFirestore.doc(window.db, 'shifts', shift.id);
        batch.update(ref, {
          status: 'completed',
          checkOutTime: shift.checkOutTime,
          autoEnded: true
        });
      });
      await batch.commit();
      console.info(`[Auto-End Shift] Automatically completed ${expiredShifts.length} unclosed shift(s) at restaurant closing time.`);
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
        ? currentActiveShift.checkInTime.toDate().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
        : 'Belirtilmedi';
        
      statusContainer.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #22c55e; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
            <div>
              <span style="background: #166534; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">● AKTİF MESAİDE</span>
              <h3 style="margin: 8px 0 2px 0; color: #1e293b; font-size: 18px;">${currentActiveShift.restaurantName || 'Restoran'}</h3>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Giriş Saati: <strong style="color: #0f172a;">${checkInTimeStr}</strong></p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn primary" onclick="openQrScanModal()" style="background: #ef4444; border: none; padding: 12px 18px; font-size: 14px; display: inline-flex; align-items: center; gap: 8px;">
                <span>🚪 Çıkış Yap (QR)</span>
              </button>
              <button class="btn secondary" onclick="openPinModal('checkout')" style="padding: 12px 18px; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #ef4444; color: #ef4444;">
                <span>🔢 PIN ile Çıkış</span>
              </button>
            </div>
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
              <p style="margin: 0; font-size: 13px; color: #64748b;">İş yerinize ulaştığınızda restoran ekranındaki QR kodu okutarak veya 4 haneli şube PIN kodunuzu girerek mesainizi başlatın.</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn primary" onclick="openQrScanModal()" style="padding: 12px 20px; font-size: 14px; display: inline-flex; align-items: center; gap: 8px;">
                <span>📷 QR Kod Okut</span>
              </button>
              <button class="btn secondary" onclick="openPinModal('checkin')" style="padding: 12px 18px; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #d97706; color: #b45309; background: #fffbeb;">
                <span>🔢 PIN ile Başlat</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error checking worker active shift:", error);
  }
}
window.checkWorkerActiveShift = checkWorkerActiveShift;

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

      const nowTimeStr = checkOutDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

      const updateData = {
        status: 'completed',
        checkOutTime: window.firebaseFirestore.serverTimestamp(),
        totalWorkedMinutes: totalMinutes,
        exitMethod: 'qr_live',
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
      const nowTimeStr = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

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
            entryMethod: 'qr_live',
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
            entryMethod: 'qr_live',
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
window.processClockInOut = processClockInOut;

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
window.getCurrentGeoLocationAndSave = getCurrentGeoLocationAndSave;

// --- 5. CLOCK-IN / OUT VIA 4-DIGIT BRANCH ATTENDANCE PIN ---
async function processPinClockInOut(enteredPin, workerCoords) {
  const msgEl = document.getElementById('pinAttendanceMessage');

  try {
    if (!enteredPin || !/^\d{4}$/.test(enteredPin)) {
      throw new Error('Lütfen 4 haneli geçerli bir şube PIN kodu giriniz.');
    }

    const workerUser = window.auth.currentUser;
    if (!workerUser) {
      throw new Error('Oturum açmış kullanıcı bulunamadı.');
    }

    // 1. Query restaurants matching attendancePin
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'users'),
      window.firebaseFirestore.where('attendancePin', '==', enteredPin)
    );
    const snap = await window.firebaseFirestore.getDocs(q);

    if (snap.empty) {
      throw new Error('Geçersiz Şube PIN Kodu. Lütfen işletme panosundaki 4 haneli kodu kontrol ediniz.');
    }

    // Filter business/restaurant users
    const candidateDocs = snap.docs.filter(d => {
      const data = d.data();
      return data.userType === 'restaurant' || data.role === 'business';
    });

    if (candidateDocs.length === 0) {
      throw new Error('Bu PIN kodu ile eşleşen bir işletme bulunamadı.');
    }

    // 2. Resolve Candidate Restaurant by Location (GPS distance)
    let selectedRestaurantId = null;
    let selectedRestData = null;
    let minDistance = Infinity;

    for (const docSnap of candidateDocs) {
      const data = docSnap.data();
      const loc = data.location;
      if (!loc || !loc.latitude || !loc.longitude) continue;

      const allowedRadius = loc.radiusMeters || 150;
      const dist = calculateDistanceMeters(
        workerCoords.lat,
        workerCoords.lng,
        loc.latitude,
        loc.longitude
      );

      if (dist <= allowedRadius && dist < minDistance) {
        minDistance = dist;
        selectedRestaurantId = docSnap.id;
        selectedRestData = data;
      }
    }

    // If none within radius, give informative error with closest distance
    if (!selectedRestaurantId) {
      let closestDist = null;
      for (const docSnap of candidateDocs) {
        const loc = docSnap.data().location;
        if (loc?.latitude && loc?.longitude) {
          const d = calculateDistanceMeters(workerCoords.lat, workerCoords.lng, loc.latitude, loc.longitude);
          if (closestDist === null || d < closestDist) closestDist = Math.round(d);
        }
      }
      const distInfo = closestDist !== null ? ` (Mesafe: ${closestDist}m, İzin Verilen: 150m)` : '';
      throw new Error(`Konum Doğrulanamadı: İşletmeden çok uzaktasınız.${distInfo} Mesai başlatmak için restoran sınırları içinde olmalısınız.`);
    }

    // 3. Check if restaurant allows PIN attendance
    if (selectedRestData.allowPinAttendance === false) {
      throw new Error('Bu işletmede PIN kodu ile mesai başlatma yetkisi kapatılmıştır. Lütfen restoran ekranındaki canlı QR kodu okutunuz.');
    }

    const restaurantId = selectedRestaurantId;
    const restData = selectedRestData;
    const distanceMeters = minDistance;

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

    // 4. Check if there's an ACTIVE shift for this worker TODAY
    const shiftQ = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('workerId', '==', workerUser.uid),
      window.firebaseFirestore.where('status', '==', 'active')
    );
    const activeShiftSnap = await window.firebaseFirestore.getDocs(shiftQ);

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
      const nowTimeStr = checkOutDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

      const updateData = {
        status: 'completed',
        checkOutTime: window.firebaseFirestore.serverTimestamp(),
        totalWorkedMinutes: totalMinutes,
        exitMethod: 'pin_code',
        exitPin: enteredPin,
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
        msgEl.classList.remove('hidden');
      }

    } else {
      // --- CLOCK-IN ACTION ---
      const nowTimeStr = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

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
            entryMethod: 'pin_code',
            entryPin: enteredPin,
            startTime: assignedShiftInfo.startTime || nowTimeStr,
            endTime: assignedShiftInfo.endTime || null
          }
        );

        if (msgEl) {
          const vardiaDuration = assignedShiftInfo.endTime ? ` (${assignedShiftInfo.startTime} - ${assignedShiftInfo.endTime})` : '';
          msgEl.textContent = `✅ ${restData.businessName || 'Restoran'} Girişi Yapıldı! Mesainiz başlatıldı${vardiaDuration}. İyi çalışmalar!`;
          msgEl.className = 'auth-message success';
          msgEl.classList.remove('hidden');
        }
      } else {
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
            entryMethod: 'pin_code',
            entryPin: enteredPin,
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
          msgEl.textContent = `✅ ${restData.businessName || 'Restoran'} Girişi Yapıldı! Mesainiz başlatıldı (${nowTimeStr}). İyi çalışmalar!`;
          msgEl.className = 'auth-message success';
          msgEl.classList.remove('hidden');
        }
      }
    }

    // Refresh UI & Close modal after 2.2 seconds
    setTimeout(() => {
      if (typeof closePinModal === 'function') closePinModal();
      checkWorkerActiveShift(workerUser.uid);
    }, 2200);

  } catch (err) {
    console.error("PIN clock in/out error:", err);
    if (msgEl) {
      msgEl.textContent = err.message || 'İşlem gerçekleştirilemedi.';
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
  }
}
window.processPinClockInOut = processPinClockInOut;

// --- PIN ATTENDANCE UI MODAL HANDLERS ---
let currentPinActionType = 'checkin';

function openPinModal(actionType = 'checkin') {
  currentPinActionType = actionType;
  const modal = document.getElementById('pinAttendanceModal');
  const title = document.getElementById('pinModalTitle');
  const desc = document.getElementById('pinModalDesc');
  const input = document.getElementById('attendancePinInput');
  const msgEl = document.getElementById('pinAttendanceMessage');
  const btn = document.getElementById('pinSubmitBtn');

  if (title) {
    title.textContent = actionType === 'checkout' ? 'Şube PIN Kodu ile Çıkış' : 'Şube PIN Kodu ile Giriş';
  }
  if (desc) {
    desc.textContent = actionType === 'checkout'
      ? 'Restoran panosundaki 4 haneli şube kodunu giriniz. Konumunuz doğrulanarak mesainiz sonlandırılacaktır.'
      : 'Restoran panosundaki 4 haneli şube kodunu giriniz. Konumunuz doğrulanarak mesainiz başlatılacaktır.';
  }
  if (btn) {
    btn.innerHTML = actionType === 'checkout'
      ? '<span>📍 Konumu Doğrula ve Çıkış Yap</span>'
      : '<span>📍 Konumu Doğrula ve Başlat</span>';
  }
  if (input) {
    input.value = '';
  }
  if (msgEl) {
    msgEl.className = 'auth-message hidden';
    msgEl.textContent = '';
  }
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => input?.focus(), 150);
  }
}

function closePinModal() {
  const modal = document.getElementById('pinAttendanceModal');
  if (modal) modal.classList.add('hidden');
}

async function submitPinAttendance() {
  const input = document.getElementById('attendancePinInput');
  const msgEl = document.getElementById('pinAttendanceMessage');
  const btn = document.getElementById('pinSubmitBtn');

  if (!input) return;
  const enteredPin = input.value.trim();

  if (!/^\d{4}$/.test(enteredPin)) {
    if (msgEl) {
      msgEl.textContent = 'Lütfen 4 haneli şube kodunu eksiksiz giriniz.';
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  if (msgEl) {
    msgEl.textContent = 'Konumunuz alınıyor ve doğrulanıyor...';
    msgEl.className = 'auth-message info';
    msgEl.classList.remove('hidden');
  }
  if (btn) btn.disabled = true;

  if (!navigator.geolocation) {
    if (msgEl) {
      msgEl.textContent = 'Cihazınızda konum servisi desteklenmiyor.';
      msgEl.className = 'auth-message error';
    }
    if (btn) btn.disabled = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const workerCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      try {
        await processPinClockInOut(enteredPin, workerCoords);
      } catch (err) {
        // Handled inside processPinClockInOut
      } finally {
        if (btn) btn.disabled = false;
      }
    },
    (geoError) => {
      console.error("PIN Geolocation error:", geoError);
      if (msgEl) {
        msgEl.textContent = 'Konumunuza erişilemedi. Lütfen tarayıcınızdan konum izni veriniz.';
        msgEl.className = 'auth-message error';
        msgEl.classList.remove('hidden');
      }
      if (btn) btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

window.openPinModal = openPinModal;
window.closePinModal = closePinModal;
window.submitPinAttendance = submitPinAttendance;
