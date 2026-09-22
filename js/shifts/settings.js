// --- SETTINGS: Restaurant settings save, shift templates & QR modal ---


function unlockProtectedSections() {
  const input = document.getElementById('restaurantPinInput').value;
  const errorMsg = document.getElementById('pinErrorMessage');
  const targetPin = window.restaurantPin || '0068';
  
  if (input === targetPin) {
    document.getElementById('pinEntrySection').style.display = 'none';
    document.getElementById('protectedSections').style.display = 'block';
  } else {
    errorMsg.style.display = 'block';
  }
}

async function saveRestaurantSettings() {
  const opening = parseInt(document.getElementById('restaurantOpeningHour').value);
  const closing = parseInt(document.getElementById('restaurantClosingHour').value);
  const autoEndVal = document.getElementById('autoEndShiftToggle') ? document.getElementById('autoEndShiftToggle').checked : false;
  const whatsappNotifyVal = document.getElementById('whatsappShiftNotificationToggle') ? document.getElementById('whatsappShiftNotificationToggle').checked : false;
  const allowPinVal = document.getElementById('allowPinAttendanceToggle') ? document.getElementById('allowPinAttendanceToggle').checked : true;

  if (isNaN(opening) || isNaN(closing)) {
    alert('Lütfen geçerli açılış ve kapanış saatleri giriniz.');
    return;
  }

  if (opening === closing) {
    alert('Açılış saati ile kapanış saati aynı olamaz.');
    return;
  }
  
  try {
    const updatePayload = {
      openingHour: opening,
      closingHour: closing,
      autoEndShiftAtScheduledTime: autoEndVal,
      whatsappShiftNotifications: whatsappNotifyVal,
      allowPinAttendance: allowPinVal
    };
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      updatePayload
    );
    restaurantOpeningHour = opening;
    restaurantClosingHour = closing;
    autoEndShiftAtScheduledTime = autoEndVal;
    whatsappShiftNotifications = whatsappNotifyVal;
    window.allowPinAttendance = allowPinVal;
    alert('İşletme ayarları kaydedildi.');
    renderCalendar();
  } catch (error) {
    console.error("Error saving restaurant settings:", error);
    alert('Ayarlar kaydedilemedi.');
  }
}

function renderCustomShiftTemplatesList() {
  const listContainer = document.getElementById('customShiftTemplatesList');
  if (!listContainer) return;
  
  if (!customShiftTemplates || customShiftTemplates.length === 0) {
    listContainer.innerHTML = '<span style="font-size: 12px; color: #94a3b8;">Henüz özel vardiya şablonu eklenmedi.</span>';
    return;
  }

  listContainer.innerHTML = customShiftTemplates.map((t, idx) => `
    <div style="display: inline-flex; align-items: center; gap: 8px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 20px; padding: 5px 12px; font-size: 13px; color: #1e293b;">
      <span style="font-weight: 600;">${t.name}</span>
      <span style="color: #64748b; font-size: 12px;">(${t.startTime} - ${t.endTime})</span>
      <button type="button" onclick="deleteCustomShiftTemplate(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; font-weight: bold; padding: 0 2px;">&times;</button>
    </div>
  `).join('');
}

function renderShiftTemplatesUI() {
  const container = document.getElementById('shiftTemplatesContainer');
  if (!container) return;

  const defaultTemplates = [
    { name: 'Sabah', startTime: '08:00', endTime: '16:00' },
    { name: 'Akşam', startTime: '16:00', endTime: '00:00' },
    { name: 'Tam Gün', startTime: '08:00', endTime: '20:00' }
  ];

  const allTemplates = customShiftTemplates.length > 0 ? customShiftTemplates : defaultTemplates;

  container.innerHTML = allTemplates.map(t => `
    <button type="button" class="shift-template-btn" onclick="applyShiftTemplate('${t.startTime}', '${t.endTime}')">
      ${t.name} (${t.startTime}-${t.endTime})
    </button>
  `).join('');

  // If custom templates exist, also add a reset/default option if needed
  if (customShiftTemplates.length > 0) {
    container.innerHTML += `
      <button type="button" class="shift-template-btn" style="border-style: dashed; opacity: 0.8;" onclick="applyShiftTemplate('08:00', '16:00')">Sabah (08-16)</button>
      <button type="button" class="shift-template-btn" style="border-style: dashed; opacity: 0.8;" onclick="applyShiftTemplate('16:00', '00:00')">Akşam (16-00)</button>
    `;
  }
}

async function addCustomShiftTemplate() {
  const nameInput = document.getElementById('newTemplateName');
  const startInput = document.getElementById('newTemplateStart');
  const endInput = document.getElementById('newTemplateEnd');

  if (!nameInput || !startInput || !endInput) return;

  const name = nameInput.value.trim();
  const startTime = startInput.value;
  const endTime = endInput.value;

  if (!name || !startTime || !endTime) {
    alert('Lütfen şablon adı, başlangıç ve bitiş saatini eksiksiz giriniz.');
    return;
  }

  const newTemplate = { id: Date.now().toString(), name, startTime, endTime };
  customShiftTemplates.push(newTemplate);

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      { shiftTemplates: customShiftTemplates }
    );

    nameInput.value = '';
    startInput.value = '';
    endInput.value = '';

    renderCustomShiftTemplatesList();
    renderShiftTemplatesUI();
    alert('Yeni şablon eklendi.');
  } catch (error) {
    console.error("Error adding custom shift template:", error);
    alert('Şablon eklenirken hata oluştu.');
  }
}

async function deleteCustomShiftTemplate(index) {
  if (index < 0 || index >= customShiftTemplates.length) return;
  customShiftTemplates.splice(index, 1);

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      { shiftTemplates: customShiftTemplates }
    );

    renderCustomShiftTemplatesList();
    renderShiftTemplatesUI();
  } catch (error) {
    console.error("Error deleting custom shift template:", error);
    alert('Şablon silinirken hata oluştu.');
  }
}

// --- ATTENDANCE PIN: Unique 4-digit code generation & management ---
async function generateUniqueAttendancePin(excludeRestaurantId = null) {
  let isUnique = false;
  let attempts = 0;
  let candidatePin = '';

  while (!isUnique && attempts < 25) {
    attempts++;
    candidatePin = String(Math.floor(1000 + Math.random() * 9000));

    try {
      const q = window.firebaseFirestore.query(
        window.firebaseFirestore.collection(window.db, 'users'),
        window.firebaseFirestore.where('attendancePin', '==', candidatePin)
      );
      const snap = await window.firebaseFirestore.getDocs(q);

      if (snap.empty) {
        isUnique = true;
      } else {
        const otherDocs = snap.docs.filter(d => d.id !== excludeRestaurantId);
        if (otherDocs.length === 0) {
          isUnique = true;
        }
      }
    } catch (err) {
      console.warn("PIN uniqueness check error, retrying:", err);
    }
  }

  return candidatePin;
}
window.generateUniqueAttendancePin = generateUniqueAttendancePin;

async function regenerateBranchPin() {
  const rId = window.restaurantId || (window.auth?.currentUser?.uid);
  if (!rId) {
    alert("Restoran oturumu bulunamadı.");
    return;
  }

  const confirmGen = confirm("Yeni bir 4 haneli şube PIN kodu üretmek istediğinizden emin misiniz? Eski kod geçersiz olacaktır.");
  if (!confirmGen) return;

  const btn = document.getElementById('regenBranchPinBtn');
  if (btn) btn.disabled = true;

  try {
    const newPin = await generateUniqueAttendancePin(rId);
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', rId),
      { attendancePin: newPin }
    );
    window.attendancePin = newPin;

    if (document.getElementById('branchPinInput')) {
      document.getElementById('branchPinInput').value = newPin;
    }
    if (document.getElementById('branchPinDisplayBadge')) {
      document.getElementById('branchPinDisplayBadge').textContent = newPin;
    }
    const msgEl = document.getElementById('branchPinSaveMessage');
    if (msgEl) {
      msgEl.textContent = `✅ Yeni şube kodunuz başarıyla tanımlandı: ${newPin}`;
      msgEl.className = 'auth-message success';
      msgEl.classList.remove('hidden');
      setTimeout(() => msgEl.classList.add('hidden'), 4000);
    } else {
      alert(`Yeni şube kodunuz başarıyla tanımlandı: ${newPin}`);
    }
  } catch (err) {
    console.error("Error regenerating branch pin:", err);
    alert("Yeni kod üretilirken bir hata oluştu.");
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.regenerateBranchPin = regenerateBranchPin;

async function saveBranchPinSettings() {
  const rId = window.restaurantId || (window.auth?.currentUser?.uid);
  if (!rId) {
    alert("Restoran oturumu bulunamadı.");
    return;
  }

  const pinInput = document.getElementById('branchPinInput');
  const allowToggle = document.getElementById('allowPinAttendanceToggle');
  const msgEl = document.getElementById('branchPinSaveMessage');

  if (!pinInput) return;
  const enteredPin = pinInput.value.trim();
  const allowVal = allowToggle ? allowToggle.checked : true;

  if (!/^\d{4}$/.test(enteredPin)) {
    if (msgEl) {
      msgEl.textContent = 'Şube PIN kodu tam olarak 4 haneli bir sayı olmalıdır (Örn: 5824).';
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    } else {
      alert('Şube PIN kodu tam olarak 4 haneli bir sayı olmalıdır.');
    }
    return;
  }

  try {
    // Check collision with other restaurants
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'users'),
      window.firebaseFirestore.where('attendancePin', '==', enteredPin)
    );
    const snap = await window.firebaseFirestore.getDocs(q);
    const isTakenByAnother = snap.docs.some(d => d.id !== rId);

    if (isTakenByAnother) {
      if (msgEl) {
        msgEl.textContent = `Bu PIN kodu (${enteredPin}) başka bir işletme tarafından kullanılmaktadır. Lütfen farklı bir 4 haneli kod seçiniz veya 'Yeni Kod Üret' butonunu kullanınız.`;
        msgEl.className = 'auth-message error';
        msgEl.classList.remove('hidden');
      } else {
        alert(`Bu PIN kodu (${enteredPin}) başka bir işletme tarafından kullanılmaktadır. Lütfen farklı bir kod giriniz.`);
      }
      return;
    }

    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', rId),
      {
        attendancePin: enteredPin,
        allowPinAttendance: allowVal
      }
    );

    window.attendancePin = enteredPin;
    window.allowPinAttendance = allowVal;

    if (document.getElementById('branchPinDisplayBadge')) {
      document.getElementById('branchPinDisplayBadge').textContent = enteredPin;
    }

    if (msgEl) {
      msgEl.textContent = `✅ Şube PIN kodu ve ayarları başarıyla kaydedildi: ${enteredPin}`;
      msgEl.className = 'auth-message success';
      msgEl.classList.remove('hidden');
      setTimeout(() => msgEl.classList.add('hidden'), 4000);
    } else {
      alert('Şube PIN ayarları kaydedildi.');
    }
  } catch (err) {
    console.error("Error saving branch pin:", err);
    if (msgEl) {
      msgEl.textContent = 'Ayarlar kaydedilirken hata oluştu: ' + err.message;
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
  }
}
window.saveBranchPinSettings = saveBranchPinSettings;

