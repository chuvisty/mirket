// --- CLOCK IN/OUT: Core attendance engine, geo validation & auto-close ---
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
    const currentHourMin = now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });

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
