// Vardiyan Gözcü - Shift Management System
// Uses Modular JS structure like rest of the app.

let currentWeekStart = getStartOfWeek(new Date());
let staffMembers = [];
let currentShifts = [];
let restaurantId = null;
let restaurantOpeningHour = 6;
let restaurantClosingHour = 23;
let customShiftTemplates = [];
let autoEndShiftAtScheduledTime = false;

function initGozcuPage() {
  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, async (user) => {
    if (user) {
      restaurantId = user.uid;
      window.restaurantId = user.uid;
      const isSub = await checkSubscriptionStatus(user.uid);
      const paywallEl = document.getElementById('paywallOverlay');
      const gozcuContentEl = document.getElementById('gozcuContent');
      if (isSub) {
        if (paywallEl) paywallEl.classList.add('hidden');
        if (gozcuContentEl) gozcuContentEl.classList.remove('blurred');
        
        // Load data
        await loadRestaurantSettings();
        await loadStaff();
        await loadShiftsForCurrentWeek();
        if (typeof loadAttendanceLogs === 'function') {
          await loadAttendanceLogs(restaurantId, 'today');
        }
      } else {
        if (paywallEl) paywallEl.classList.remove('hidden');
        if (gozcuContentEl) gozcuContentEl.classList.add('blurred');
      }
    } else {
      // Redirect to login if not authenticated
      window.location.href = 'login.html';
    }
  });
  }
}

async function loadRestaurantSettings() {
  try {
    const userDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', restaurantId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      restaurantOpeningHour = data.openingHour || 6;
      restaurantClosingHour = data.closingHour || 23;
      customShiftTemplates = data.shiftTemplates || [];
      autoEndShiftAtScheduledTime = !!data.autoEndShiftAtScheduledTime;
      
      if (document.getElementById('restaurantOpeningHour')) document.getElementById('restaurantOpeningHour').value = restaurantOpeningHour;
      if (document.getElementById('restaurantClosingHour')) document.getElementById('restaurantClosingHour').value = restaurantClosingHour;
      if (document.getElementById('autoEndShiftToggle')) document.getElementById('autoEndShiftToggle').checked = autoEndShiftAtScheduledTime;
      
      if (data.location) {
        if (document.getElementById('restaurantGeofenceRadius')) {
          document.getElementById('restaurantGeofenceRadius').value = data.location.radiusMeters || 150;
        }
        const msgEl = document.getElementById('locationSaveMessage');
        if (msgEl && data.location.latitude && data.location.longitude) {
          msgEl.textContent = `📍 Tanımlı İşletme Konumu: Lat ${data.location.latitude.toFixed(4)}, Lng ${data.location.longitude.toFixed(4)} (${data.location.radiusMeters || 150}m yarıçap)`;
          msgEl.className = 'auth-message info';
          msgEl.classList.remove('hidden');
        }
      }

      renderCustomShiftTemplatesList();
      renderShiftTemplatesUI();
    }
  } catch (error) {
    console.error("Error loading restaurant settings:", error);
  }
}

function openRestaurantQrModal() {
  const modal = document.getElementById('restaurantQrModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (typeof startDynamicQrStream === 'function' && restaurantId) {
      startDynamicQrStream(restaurantId, 'qrcodeContainer');
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

async function saveRestaurantSettings() {
  const opening = parseInt(document.getElementById('restaurantOpeningHour').value);
  const closing = parseInt(document.getElementById('restaurantClosingHour').value);
  const autoEndVal = document.getElementById('autoEndShiftToggle') ? document.getElementById('autoEndShiftToggle').checked : false;

  if (opening >= closing) {
    alert('Açılış saati kapatılış saatinden önce olmalıdır.');
    return;
  }
  
  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      {
        openingHour: opening,
        closingHour: closing,
        autoEndShiftAtScheduledTime: autoEndVal
      }
    );
    restaurantOpeningHour = opening;
    restaurantClosingHour = closing;
    autoEndShiftAtScheduledTime = autoEndVal;
    alert('İşletme ayarları kaydedildi.');
    renderCalendar();
  } catch (error) {
    console.error("Error saving restaurant settings:", error);
    alert('Ayarlar kaydedilemedi.');
  }
}

// --- CUSTOM SHIFT TEMPLATES MANAGEMENT ---
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

async function checkSubscriptionStatus(uid) {
  try {
    const userDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      console.log("Vardiyan Gözcü - User Data Loaded:", data); // DEBUG
      // Ensure only restaurants can access this
      if (data.userType !== 'restaurant') {
        window.location.href = 'index.html';
        return false;
      }
      // Check for boolean true or string 'true' (case insensitive)
      const isSub = data.isSubscribed === true || String(data.isSubscribed).toLowerCase() === 'true';
      console.log("Vardiyan Gözcü - isSubscribed evaluated as:", isSub); // DEBUG
      return isSub;
    }
    console.warn("Vardiyan Gözcü - User document not found for uid:", uid);
    return false;
  } catch (error) {
    console.error("Error checking subscription:", error);
    return false;
  }
}

// --- STAFF CRUD ---

async function loadStaff() {
  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'restaurantStaff'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId)
    );
    const snapshot = await window.firebaseFirestore.getDocs(q);
    staffMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderStaffList();
    updateStaffSelectDropdown();
  } catch (error) {
    console.error("Error loading staff:", error);
    showStaffMessage("Personel listesi yüklenemedi.", "error");
  }
}

function renderStaffList() {
  const staffListEl = document.getElementById('staffList');
  staffListEl.innerHTML = '';
  
  if (staffMembers.length === 0) {
    staffListEl.innerHTML = '<p style="text-align: center; color: #94a3b8;">Henüz personel eklenmedi.</p>';
    return;
  }
  
  staffMembers.forEach(staff => {
    const item = document.createElement('div');
    item.className = 'staff-item';
    
    // Check if vardiyanUserId exists to show a badge
    const vardiyanBadge = staff.vardiyanUserId 
      ? `<span style="font-size: 10px; background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Mirket'e Bağlı</span>` 
      : '';
      
    // Calculate weekly hours
    let week1Hours = 0;
    let week2Hours = 0;
    
    const week2Start = new Date(currentWeekStart);
    week2Start.setDate(week2Start.getDate() + 7);
    const week2StartStr = formatDateForDB(week2Start);

    currentShifts.forEach(shift => {
      if (shift.staffId === staff.id) {
        if (shift.date < week2StartStr) {
          week1Hours += calculateShiftHours(shift.startTime, shift.endTime);
        } else {
          week2Hours += calculateShiftHours(shift.startTime, shift.endTime);
        }
      }
    });
    
    let hoursBadge = '';
    if (week1Hours > 0 || week2Hours > 0) {
      hoursBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">1. Hafta: ${week1Hours.toFixed(1)}s | 2. Hafta: ${week2Hours.toFixed(1)}s</span>`;
    }

    let wageBadge = '';
    if (staff.wageAmount) {
      const label = staff.wageType === 'daily' ? 'TL/Gün' : 'TL/Saat';
      wageBadge = `<span style="font-size: 11px; background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 6px;">💰 ${staff.wageAmount} ${label}</span>`;
    }

    item.innerHTML = `
      <div class="staff-info">
        <span class="staff-name">${staff.name} ${vardiyanBadge} ${wageBadge} ${hoursBadge}</span>
        <span class="staff-role">${staff.role} | ${staff.phone || 'Telefon yok'}</span>
      </div>
      <div class="staff-actions">
        <button class="btn ghost" onclick="editStaff('${staff.id}')">Düzenle</button>
        <button class="btn ghost" style="color: #ef4444;" onclick="deleteStaff('${staff.id}')">Sil</button>
      </div>
    `;
    staffListEl.appendChild(item);
  });
}

function updateStaffSelectDropdown() {
  const select = document.getElementById('shiftStaffSelect');
  // Keep the first default option
  select.innerHTML = '<option value="">Mirket ile doldur</option>';
  
  staffMembers.forEach(staff => {
    const option = document.createElement('option');
    option.value = staff.id;
    option.textContent = `${staff.name} (${staff.role})`;
    select.appendChild(option);
  });
}

function openStaffModal() {
  document.getElementById('staffForm').reset();
  if (document.getElementById('quickWorkerCode')) document.getElementById('quickWorkerCode').value = '';
  if (document.getElementById('quickCodeStatus')) document.getElementById('quickCodeStatus').classList.add('hidden');
  document.getElementById('staffId').value = '';
  if (document.getElementById('staffWageType')) document.getElementById('staffWageType').value = 'hourly';
  if (document.getElementById('staffWageAmount')) document.getElementById('staffWageAmount').value = '';
  document.getElementById('staffModalTitle').textContent = 'Personel Ekle';
  document.getElementById('staffModalMessage').classList.add('hidden');
  document.getElementById('staffModal').classList.remove('hidden');
}

function closeStaffModal() {
  document.getElementById('staffModal').classList.add('hidden');
}

async function fetchWorkerByCode() {
  const codeInput = document.getElementById('quickWorkerCode');
  const statusEl = document.getElementById('quickCodeStatus');
  if (!codeInput || !statusEl) return;

  let code = codeInput.value.trim().toUpperCase().replace(/^VK-/, '');
  if (!code) {
    statusEl.textContent = 'Lütfen 6 haneli çalışan kodunu girin.';
    statusEl.className = 'auth-message warning';
    statusEl.classList.remove('hidden');
    return;
  }

  statusEl.textContent = 'Sorgulanıyor...';
  statusEl.className = 'auth-message info';
  statusEl.classList.remove('hidden');

  try {
    const usersRef = window.firebaseFirestore.collection(window.db, 'users');
    const q = window.firebaseFirestore.query(
      usersRef,
      window.firebaseFirestore.where('userType', '==', 'worker'),
      window.firebaseFirestore.where('workerCode', '==', code)
    );
    const snapshot = await window.firebaseFirestore.getDocs(q);

    if (snapshot.empty) {
      statusEl.textContent = `❌ '${code}' koduna ait onaylı bir çalışan hesabı bulunamadı. Kodu kontrol edin.`;
      statusEl.className = 'auth-message error';
      return;
    }

    const workerDoc = snapshot.docs[0];
    const wData = workerDoc.data();

    // Fill form automatically
    if (document.getElementById('staffName')) document.getElementById('staffName').value = wData.employeeName || '';
    if (document.getElementById('staffPhone')) document.getElementById('staffPhone').value = wData.employeePhone || wData.phone || '';
    if (document.getElementById('staffEmail')) document.getElementById('staffEmail').value = wData.email || '';

    // Auto select first role if available
    const roleSelect = document.getElementById('staffRole');
    if (roleSelect && wData.jobs && wData.jobs.length > 0) {
      const primaryJob = wData.jobs[0];
      const roleMap = {
        "garson": "Garson",
        "komi": "Komi",
        "sef-garson": "Şef Garson",
        "asci": "Aşçı",
        "bulasikci": "Bulaşıkçı",
        "host": "Host/Hostes",
        "barista": "Barista"
      };
      if (roleMap[primaryJob]) {
        roleSelect.value = roleMap[primaryJob];
      }
    }

    statusEl.innerHTML = `✅ <strong>${wData.employeeName || 'Çalışan'}</strong> bulundu ve bilgileri dolduruldu. 'Kaydet' butonuna basarak ekleyin.`;
    statusEl.className = 'auth-message success';
  } catch (error) {
    console.error("Error fetching worker by code:", error);
    statusEl.textContent = 'Sorgulama sırasında bir hata oluştu.';
    statusEl.className = 'auth-message error';
  }
}

function editStaff(staffId) {
  const staff = staffMembers.find(s => s.id === staffId);
  if (staff) {
    document.getElementById('staffId').value = staff.id;
    document.getElementById('staffName').value = staff.name;
    document.getElementById('staffRole').value = staff.role;
    document.getElementById('staffPhone').value = staff.phone || '';
    document.getElementById('staffEmail').value = staff.email || '';
    if (document.getElementById('staffWageType')) document.getElementById('staffWageType').value = staff.wageType || 'hourly';
    if (document.getElementById('staffWageAmount')) document.getElementById('staffWageAmount').value = staff.wageAmount || '';
    
    document.getElementById('staffModalTitle').textContent = 'Personel Düzenle';
    document.getElementById('staffModalMessage').classList.add('hidden');
    document.getElementById('staffModal').classList.remove('hidden');
  }
}

async function handleStaffSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('staffId').value;
  const name = document.getElementById('staffName').value.trim();
  const role = document.getElementById('staffRole').value.trim();
  const phone = document.getElementById('staffPhone').value.trim();
  const email = document.getElementById('staffEmail').value.trim();
  const wageType = document.getElementById('staffWageType') ? document.getElementById('staffWageType').value : 'hourly';
  const wageAmount = document.getElementById('staffWageAmount') ? parseFloat(document.getElementById('staffWageAmount').value) || 0 : 0;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Kaydediliyor...';
  
  try {
    let vardiyanUserId = null;
    
    // Vardiyan global worker search by normalized phone (only if phone is provided)
    if (phone) {
      const normInputPhone = normalizePhone(phone);
      if (normInputPhone) {
        const usersRef = window.firebaseFirestore.collection(window.db, 'users');
        const q = window.firebaseFirestore.query(
          usersRef, 
          window.firebaseFirestore.where('userType', '==', 'worker')
        );
        const snapshot = await window.firebaseFirestore.getDocs(q);
        for (const userDoc of snapshot.docs) {
          const wData = userDoc.data();
          const wPhone = normalizePhone(wData.employeePhone || wData.phone);
          if (wPhone && wPhone === normInputPhone) {
            vardiyanUserId = userDoc.id;
            break;
          }
        }
      }
    }
    
    const staffData = {
      restaurantId,
      name,
      role,
      phone,
      email,
      wageType,
      wageAmount,
      vardiyanUserId
    };
    
    if (id) {
      // Update
      await window.firebaseFirestore.updateDoc(
        window.firebaseFirestore.doc(window.db, 'restaurantStaff', id), 
        staffData
      );
    } else {
      // Create
      await window.firebaseFirestore.addDoc(
        window.firebaseFirestore.collection(window.db, 'restaurantStaff'), 
        staffData
      );
    }
    
    await loadStaff();
    closeStaffModal();
  } catch (error) {
    console.error("Error saving staff:", error);
    const msgEl = document.getElementById('staffModalMessage');
    msgEl.textContent = "Kaydedilirken bir hata oluştu.";
    msgEl.className = 'auth-message error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Kaydet';
  }
}

async function deleteStaff(id) {
  if (confirm("Bu personeli silmek istediğinize emin misiniz? Atanmış vardiyaları 'Boş Vardiya' durumuna düşebilir.")) {
    try {
      await window.firebaseFirestore.deleteDoc(window.firebaseFirestore.doc(window.db, 'restaurantStaff', id));
      await loadStaff();
    } catch (error) {
      console.error("Error deleting staff:", error);
      showStaffMessage("Personel silinemedi.", "error");
    }
  }
}

function showStaffMessage(msg, type) {
  const el = document.getElementById('staffMessage');
  el.textContent = msg;
  el.className = `auth-message ${type}`;
  setTimeout(() => el.classList.add('hidden'), 5000);
}


// --- CALENDAR & SHIFTS ---

function calculateShiftHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // crosses midnight
  }
  return (endMinutes - startMinutes) / 60;
}

function getRoleColor(role) {
  if (!role) return null;
  const roleLower = role.toLowerCase().trim();
  if (roleLower.includes('garson') || roleLower.includes('komi')) return 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
  if (roleLower.includes('mutfak') || roleLower.includes('aşçı')) return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
  if (roleLower.includes('kasiyer')) return 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)';
  if (roleLower.includes('temizlik') || roleLower.includes('bulaşık')) return 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)';
  
  const colors = [
    'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
    'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
  ];
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash += role.charCodeAt(i);
  return colors[hash % colors.length];
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

function formatDateForDB(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function changeWeek(offset) {
  currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 14));
  updateWeekLabel();
  loadShiftsForCurrentWeek();
}

function updateWeekLabel() {
  const endOfWeek = new Date(currentWeekStart);
  endOfWeek.setDate(currentWeekStart.getDate() + 13);
  
  const startStr = formatDisplayDate(currentWeekStart);
  const endStr = formatDisplayDate(endOfWeek);
  
  document.getElementById('currentWeekLabel').textContent = `${startStr} - ${endStr}`;
}

async function loadShiftsForCurrentWeek() {
  updateWeekLabel();
  
  const startDateStr = formatDateForDB(currentWeekStart);
  const endOfWeek = new Date(currentWeekStart);
  endOfWeek.setDate(currentWeekStart.getDate() + 13);
  const endDateStr = formatDateForDB(endOfWeek);
  
  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('date', '>=', startDateStr),
      window.firebaseFirestore.where('date', '<=', endDateStr)
    );
    
    const snapshot = await window.firebaseFirestore.getDocs(q);
    currentShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error loading shifts:", error);
  } finally {
    renderCalendar();
    renderStaffList(); // Update weekly hours in staff list after shifts are loaded
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';
  
  const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  
  for (let i = 0; i < 14; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr = formatDateForDB(d);
    
    const dayCol = document.createElement('div');
    dayCol.className = 'calendar-day';
    
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <div>
          ${dayNames[i % 7]}<br><span style="font-size:12px;color:#94a3b8;">${d.getDate()}</span>
        </div>
        <button type="button" title="Günü Temizle (Tüm Vardiyaları Sil)" onclick="event.stopPropagation(); clearDayShifts('${dateStr}')" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:12px; padding:2px 4px; opacity:0.7;" onmouseover="this.style.color='#ef4444'; this.style.opacity='1'" onmouseout="this.style.color='#94a3b8'; this.style.opacity='0.7'">🗑️</button>
      </div>
    `;
    dayCol.appendChild(header);
    
    // Shifts for this day - filter only shifts with restaurantId (both scheduled and clock-in)
    const dayShifts = currentShifts.filter(s => s.date === dateStr && s.restaurantId);
    
    // Sort by start time
    dayShifts.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    dayShifts.forEach(shift => {
      const staff = shift.staffId ? staffMembers.find(s => s.id === shift.staffId) : null;
      
      const hasClockIn = Boolean(shift.workerId) && (shift.status === 'active' || shift.status === 'completed');
      
      const shiftEl = document.createElement('div');
      shiftEl.className = 'shift-item';
      shiftEl.onclick = (event) => {
        event.stopPropagation();
        editShift(shift.id);
      };
      
      const statusClass = staff || hasClockIn ? 'shift-assigned' : 'shift-unassigned';
      let staffName = staff ? staff.name : (shift.workerName || 'Atanmadı');
      let displayName = staffName;
      let clockInInfo = '';
      let tooltipText;
      
      // If there's a clock-in, show the actual worker and real times
      if (hasClockIn) {
        displayName = shift.workerName || 'Çalışan';
        const statusText = shift.status === 'active' ? 'Devam Ediyor' : 'Tamamlandı';
        
        let realCheckInTimeStr = shift.startTime;
        if (shift.checkInTime && typeof shift.checkInTime.toDate === 'function') {
          realCheckInTimeStr = shift.checkInTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        }
        
        let realCheckOutTimeStr = '';
        if (shift.checkOutTime && typeof shift.checkOutTime.toDate === 'function') {
          realCheckOutTimeStr = ` - ${shift.checkOutTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        const plannedLabel = shift.startTime && shift.endTime ? `${shift.startTime} - ${shift.endTime}` : '';
        clockInInfo = `<div class="shift-clock-info">${realCheckInTimeStr}${realCheckOutTimeStr}</div>`;
        
        const plannedInfo = shift.startTime && shift.endTime 
          ? `\nPlanlanan: ${shift.startTime} - ${shift.endTime}` 
          : '';
        tooltipText = `Tarih: ${formatDisplayDate(new Date(shift.date))}\nGerçek Giriş: ${realCheckInTimeStr}${realCheckOutTimeStr}\nPersonel: ${displayName}\nDurum: ${statusText}${plannedInfo}\nGörev: ${shift.role || 'Belirtilmedi'}\nNot: ${shift.notes || '-'}`;
      } else {
        tooltipText = `Tarih: ${formatDisplayDate(new Date(shift.date))}\nSaat: ${shift.startTime} - ${shift.endTime}\nPersonel: ${staffName}\nGörev: ${shift.role || 'Belirtilmedi'}\nNot: ${shift.notes || '-'}`;
      }
      
      shiftEl.title = tooltipText;

      // Color coding
      if ((staff || hasClockIn) && shift.role) {
        const bg = getRoleColor(shift.role);
        if (bg) {
          shiftEl.style.borderLeftColor = 'transparent';
        }
      }
      
      shiftEl.innerHTML = `
        <div class="shift-time">${shift.startTime || ''} - ${shift.endTime || ''}</div>
        ${clockInInfo}
        <div class="shift-name ${statusClass}">${displayName}</div>
      `;
      
      dayCol.appendChild(shiftEl);
    });
    
    dayCol.onclick = (event) => {
      if (event.target.closest('.shift-item') || event.target.closest('.add-shift-btn') || event.target.closest('.day-action-menu')) {
        return;
      }
      openDayActionMenu(dateStr, dayCol);
    };
    
    // Add button
    const addBtn = document.createElement('div');
    addBtn.className = 'add-shift-btn';
    addBtn.innerHTML = '+ Vardiya';
    addBtn.onclick = () => openShiftModal(dateStr);
    dayCol.appendChild(addBtn);
    
    grid.appendChild(dayCol);
  }
}

async function copyShiftsToDate(sourceDateStr, targetDateStr, label) {
  const sourceShifts = currentShifts.filter(shift => shift.date === sourceDateStr && shift.restaurantId);
  if (sourceShifts.length === 0) {
    alert(`${label} için kopyalanacak vardiya bulunamadı.`);
    return;
  }

  let createdCount = 0;
  for (const shift of sourceShifts) {
    const existing = currentShifts.find(existing =>
      existing.date === targetDateStr &&
      existing.staffId === (shift.staffId || null) &&
      existing.startTime === shift.startTime &&
      existing.endTime === shift.endTime &&
      existing.role === (shift.role || '')
    );

    if (existing) continue;

    await window.firebaseFirestore.addDoc(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      {
        restaurantId,
        date: targetDateStr,
        startTime: shift.startTime,
        endTime: shift.endTime,
        staffId: shift.staffId || null,
        role: shift.role || '',
        notes: shift.notes || ''
      }
    );
    createdCount += 1;
  }

  if (createdCount > 0) {
    await loadShiftsForCurrentWeek();
    alert(`${createdCount} vardiya ${label} kopyalandı.`);
  } else {
    alert(`Seçilen tarihe ${label} kopyalanacak yeni vardiya bulunamadı.`);
  }
}

async function copyPreviousDayShifts(targetDateStr) {
  const targetDate = new Date(`${targetDateStr}T00:00:00`);
  const sourceDate = new Date(targetDate);
  sourceDate.setDate(sourceDate.getDate() - 1);
  await copyShiftsToDate(formatDateForDB(sourceDate), targetDateStr, 'önceki güne');
}

async function copyPreviousWeekShifts(targetDateStr) {
  const targetDate = new Date(`${targetDateStr}T00:00:00`);
  const weekStart = getStartOfWeek(targetDate);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const sourceShifts = currentShifts.filter(shift => {
    const shiftDate = new Date(`${shift.date}T00:00:00`);
    return shiftDate >= previousWeekStart && shiftDate < new Date(previousWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000) && shift.restaurantId;
  });

  if (sourceShifts.length === 0) {
    alert('Önceki hafta için kopyalanacak vardiya bulunamadı.');
    return;
  }

  let createdCount = 0;
  for (const shift of sourceShifts) {
    const shiftDate = new Date(`${shift.date}T00:00:00`);
    const dayOffset = Math.round((shiftDate - previousWeekStart) / (24 * 60 * 60 * 1000));
    const targetDateObj = new Date(weekStart);
    targetDateObj.setDate(weekStart.getDate() + dayOffset);
    const targetDateValue = formatDateForDB(targetDateObj);

    const existing = currentShifts.find(existing =>
      existing.date === targetDateValue &&
      existing.staffId === (shift.staffId || null) &&
      existing.startTime === shift.startTime &&
      existing.endTime === shift.endTime &&
      existing.role === (shift.role || '')
    );

    if (existing) continue;

    await window.firebaseFirestore.addDoc(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      {
        restaurantId,
        date: targetDateValue,
        startTime: shift.startTime,
        endTime: shift.endTime,
        staffId: shift.staffId || null,
        role: shift.role || '',
        notes: shift.notes || ''
      }
    );
    createdCount += 1;
  }

  if (createdCount > 0) {
    await loadShiftsForCurrentWeek();
    alert(`${createdCount} vardiya önceki haftadan kopyalandı.`);
  } else {
    alert('Seçilen haftaya kopyalanacak yeni vardiya bulunamadı.');
  }
}

async function clearDayShifts(dateStr) {
  if (!confirm(`${dateStr} tarihindeki tüm vardiyalar silinecektir. Bu işlem geri alınamaz! Emin misiniz?`)) return;

  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('date', '==', dateStr)
    );
    const snap = await window.firebaseFirestore.getDocs(q);
    if (snap.empty) {
      alert('Bu günde silinecek vardiya bulunamadı.');
      return;
    }

    const batch = window.firebaseFirestore.writeBatch(window.db);
    snap.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    await loadShiftsForCurrentWeek();
    alert(`${dateStr} tarihindeki ${snap.size} vardiya başarıyla temizlendi.`);
  } catch (err) {
    console.error("Error clearing day shifts:", err);
    alert("Vardiyalar silinirken bir hata oluştu.");
  }
}

async function clearWeekShifts() {
  const startStr = getLocalDateString(currentWeekStart);
  const endDate = new Date(currentWeekStart);
  endDate.setDate(endDate.getDate() + 6);
  const endStr = getLocalDateString(endDate);

  if (!confirm(`${startStr} ile ${endStr} tarihleri arasındaki TÜM vardiyalar silinecektir. Bu işlem geri alınamaz! Emin misiniz?`)) return;

  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId),
      window.firebaseFirestore.where('date', '>=', startStr),
      window.firebaseFirestore.where('date', '<=', endStr)
    );
    const snap = await window.firebaseFirestore.getDocs(q);
    if (snap.empty) {
      alert('Bu haftada silinecek vardiya bulunamadı.');
      return;
    }

    const batch = window.firebaseFirestore.writeBatch(window.db);
    snap.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();

    await loadShiftsForCurrentWeek();
    alert(`Seçilen haftadaki ${snap.size} vardiya başarıyla temizlendi.`);
  } catch (err) {
    console.error("Error clearing week shifts:", err);
    alert("Haftalık vardiyalar silinirken bir hata oluştu.");
  }
}

function openDayActionMenu(dateStr, dayCol) {
  closeDayActionMenu();
  let menu = document.getElementById('dayActionMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'dayActionMenu';
    menu.className = 'day-action-menu hidden';
  }
  menu.innerHTML = `
    <button type="button" onclick="copyPreviousDayShifts('${dateStr}'); closeDayActionMenu();">← Önceki Günü Kopyala</button>
    <button type="button" onclick="copyPreviousWeekShifts('${dateStr}'); closeDayActionMenu();">↺ Önceki Haftayı Kopyala</button>
    <button type="button" onclick="openShiftModal('${dateStr}'); closeDayActionMenu();">+ Vardiya</button>
    <button type="button" onclick="openDayDetail('${dateStr}'); closeDayActionMenu();">Günlük Detay</button>
    <button type="button" style="color: #ef4444;" onclick="clearDayShifts('${dateStr}'); closeDayActionMenu();">🗑️ Günü Temizle</button>
  `;
  menu.classList.remove('hidden');
  dayCol.appendChild(menu);
}

function closeDayActionMenu() {
  const menu = document.getElementById('dayActionMenu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
}

window.clearDayShifts = clearDayShifts;
window.clearWeekShifts = clearWeekShifts;
window.copyPreviousDayShifts = copyPreviousDayShifts;
window.copyPreviousWeekShifts = copyPreviousWeekShifts;
window.openDayActionMenu = openDayActionMenu;
window.closeDayActionMenu = closeDayActionMenu;

function openDayDetail(dateStr) {
  const title = document.getElementById('dayDetailTitle');
  const timeline = document.getElementById('dayDetailTimeline');
  title.textContent = `Günlük Detay - ${dateStr}`;
  timeline.innerHTML = '';

  const dayShifts = currentShifts.filter(shift => shift.date === dateStr);
  dayShifts.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const visibleStart = restaurantOpeningHour;
  const visibleEnd = restaurantClosingHour;
  const hours = [];
  for (let h = visibleStart; h < visibleEnd; h++) {
    hours.push(h);
  }

  const header = document.createElement('div');
  header.className = 'day-timeline-header';
  const staffColHeader = document.createElement('div');
  staffColHeader.className = 'day-timeline-staff-col';
  staffColHeader.textContent = 'Personel';
  header.appendChild(staffColHeader);
  const hoursRow = document.createElement('div');
  hoursRow.className = 'day-timeline-hours';
  hoursRow.style.gridTemplateColumns = `repeat(${hours.length}, minmax(0, 1fr))`;
  hours.forEach(h => {
    const cell = document.createElement('div');
    cell.className = 'day-timeline-hour-cell';
    cell.textContent = `${String(h).padStart(2, '0')}:00`;
    hoursRow.appendChild(cell);
  });
  header.appendChild(hoursRow);
  timeline.appendChild(header);

  const uniqueStaff = new Map();
  dayShifts.forEach(shift => {
    // For scheduled shifts: use staff name
    // For clock-in shifts: use worker name
    let staffName;
    if (shift.staffId) {
      const staff = staffMembers.find(s => s.id === shift.staffId);
      staffName = staff ? staff.name : 'Atanmadı';
    } else if (shift.workerId) {
      staffName = shift.workerName || 'Çalışan';
    } else {
      staffName = 'Atanmadı';
    }
    
    if (!uniqueStaff.has(staffName)) {
      uniqueStaff.set(staffName, []);
    }
    uniqueStaff.get(staffName).push(shift);
  });

  if (dayShifts.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.cssText = 'text-align: center; color: #94a3b8; padding: 20px;';
    emptyMsg.textContent = 'Bu gün için vardiya yok';
    timeline.appendChild(emptyMsg);
    document.getElementById('dayDetailSection').classList.remove('hidden');
    return;
  }

  uniqueStaff.forEach((shifts, staffName) => {
    let dailyHours = 0;
    shifts.forEach(s => {
      dailyHours += calculateShiftHours(s.startTime, s.endTime);
    });

    const row = document.createElement('div');
    row.className = 'day-timeline-row';
    const nameCell = document.createElement('div');
    nameCell.className = 'day-timeline-staff-name';
    nameCell.innerHTML = `${staffName} <span style="font-size:9px; color:#94a3b8; margin-left:4px;">(${dailyHours.toFixed(1)}s)</span>`;
    row.appendChild(nameCell);
    const shiftsContainer = document.createElement('div');
    shiftsContainer.className = 'day-timeline-shifts';
    shiftsContainer.style.gridTemplateColumns = `repeat(${hours.length}, minmax(0, 1fr))`;
    
    // Create background grid cells for borders
    hours.forEach((h, i) => {
      const cell = document.createElement('div');
      cell.className = 'day-timeline-bg-cell';
      cell.style.gridColumn = `${i + 1}`;
      cell.style.gridRow = '1';
      shiftsContainer.appendChild(cell);
    });
    
    shifts.forEach(shift => {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const startIdx = Math.max(0, startH - visibleStart);
      const endIdx = Math.min(hours.length, endH - visibleStart);
      const span = Math.max(1, endIdx - startIdx);
      
      const bar = document.createElement('div');
      bar.className = 'day-timeline-shift-bar';
      const staff = shift.staffId ? staffMembers.find(s => s.id === shift.staffId) : null;
      if (staff) {
        bar.classList.add('assigned');
        if (shift.role) {
          const bg = getRoleColor(shift.role);
          if (bg) {
            bar.style.background = bg;
            bar.style.borderColor = 'rgba(0,0,0,0.1)';
          }
        }
      } else {
        bar.classList.add('unassigned');
      }
      bar.style.gridColumn = `${startIdx + 1} / span ${span}`;
      bar.style.gridRow = '1'; // ensure it overlays the background cells
      bar.style.zIndex = '2';
      bar.textContent = `${shift.startTime}-${shift.endTime}`;
      
      const tooltipText = `Tarih: ${dateStr}\nSaat: ${shift.startTime} - ${shift.endTime}\nPersonel: ${staffName}\nGörev: ${shift.role || 'Belirtilmedi'}\nNot: ${shift.notes || '-'}`;
      bar.title = tooltipText; // Use native title to avoid overflow:hidden clipping
      
      if (shift.role) {
        bar.textContent = shift.role;
      }
      shiftsContainer.appendChild(bar);
    });
    row.appendChild(shiftsContainer);
    timeline.appendChild(row);
  });

  document.getElementById('dayDetailSection').classList.remove('hidden');
}

function closeDayDetail() {
  document.getElementById('dayDetailSection').classList.add('hidden');
}

let currentModalChecklist = [];

function addShiftTaskItem() {
  const input = document.getElementById('shiftTaskInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  currentModalChecklist.push({
    id: Date.now().toString(),
    task: text,
    completed: false
  });

  input.value = '';
  renderModalChecklistUI();
}

function removeShiftTaskItem(taskId) {
  currentModalChecklist = currentModalChecklist.filter(t => t.id !== taskId);
  renderModalChecklistUI();
}

function renderModalChecklistUI() {
  const listEl = document.getElementById('shiftTaskList');
  if (!listEl) return;

  if (!currentModalChecklist || currentModalChecklist.length === 0) {
    listEl.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">Görev eklenmedi.</span>';
    return;
  }

  listEl.innerHTML = currentModalChecklist.map((item, idx) => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; font-size: 12px; color: #334155;">
      <span>${idx + 1}. ${item.task}</span>
      <button type="button" onclick="removeShiftTaskItem('${item.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; font-weight: bold; padding: 0 4px;">&times;</button>
    </div>
  `).join('');
}

window.addShiftTaskItem = addShiftTaskItem;
window.removeShiftTaskItem = removeShiftTaskItem;

function openShiftModal(dateStr = '') {
  document.getElementById('shiftForm').reset();
  document.getElementById('shiftId').value = '';
  if (dateStr) {
    document.getElementById('shiftDate').value = dateStr;
  }
  currentModalChecklist = [];
  if (document.getElementById('shiftTaskInput')) document.getElementById('shiftTaskInput').value = '';
  renderModalChecklistUI();

  document.getElementById('shiftModalTitle').textContent = 'Vardiya Ekle';
  document.getElementById('deleteShiftBtn').classList.add('hidden');
  document.getElementById('vardiyanlePromo').classList.add('hidden');
  document.getElementById('shiftModalMessage').classList.add('hidden');
  document.getElementById('shiftModal').classList.remove('hidden');
}

function closeShiftModal() {
  document.getElementById('shiftModal').classList.add('hidden');
}

function editShift(shiftId) {
  const shift = currentShifts.find(s => s.id === shiftId);
  if (shift) {
    document.getElementById('shiftId').value = shift.id;
    document.getElementById('shiftDate').value = shift.date;
    document.getElementById('shiftStartTime').value = shift.startTime;
    document.getElementById('shiftEndTime').value = shift.endTime;
    document.getElementById('shiftStaffSelect').value = shift.staffId || '';
    document.getElementById('shiftRole').value = shift.role || '';
    document.getElementById('shiftNotes').value = shift.notes || '';
    
    currentModalChecklist = shift.checklist && Array.isArray(shift.checklist) ? JSON.parse(JSON.stringify(shift.checklist)) : [];
    if (document.getElementById('shiftTaskInput')) document.getElementById('shiftTaskInput').value = '';
    renderModalChecklistUI();
    
    document.getElementById('shiftModalTitle').textContent = 'Vardiya Düzenle';
    document.getElementById('deleteShiftBtn').classList.remove('hidden');
    document.getElementById('shiftModalMessage').classList.add('hidden');
    
    checkShiftStaffSelect(); // To show/hide Mirket'le button
    
    document.getElementById('shiftModal').classList.remove('hidden');
  }
}

document.getElementById('shiftStaffSelect').addEventListener('change', checkShiftStaffSelect);

function checkShiftStaffSelect() {
  const val = document.getElementById('shiftStaffSelect').value;
  const promo = document.getElementById('vardiyanlePromo');
  if (!val) {
    promo.classList.remove('hidden');
  } else {
    promo.classList.add('hidden');
  }
}

function applyShiftTemplate(start, end) {
  document.getElementById('shiftStartTime').value = start;
  document.getElementById('shiftEndTime').value = end;
}

async function handleShiftSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('shiftId').value;
  const date = document.getElementById('shiftDate').value;
  const startTime = document.getElementById('shiftStartTime').value;
  const endTime = document.getElementById('shiftEndTime').value;
  const staffId = document.getElementById('shiftStaffSelect').value || null;
  const role = document.getElementById('shiftRole').value.trim();
  const notes = document.getElementById('shiftNotes').value.trim();
  const msgEl = document.getElementById('shiftModalMessage');
  
  if (staffId) {
    // Conflict Detection
    const overlapping = currentShifts.find(s => {
      if (s.id === id) return false; // Ignore self when editing
      if (s.date === date && s.staffId === staffId) {
        // check if overlapping
        const newStart = calculateShiftHours(startTime, "00:00") * -1; // just for comparison, wait a better way is to convert to minutes
        const [nsh, nsm] = startTime.split(':').map(Number);
        const [neh, nem] = endTime.split(':').map(Number);
        const [esh, esm] = s.startTime.split(':').map(Number);
        const [eeh, eem] = s.endTime.split(':').map(Number);
        
        let ns = nsh * 60 + nsm;
        let ne = neh * 60 + nem;
        if (ne <= ns) ne += 24 * 60;
        
        let es = esh * 60 + esm;
        let ee = eeh * 60 + eem;
        if (ee <= es) ee += 24 * 60;
        
        return Math.max(ns, es) < Math.min(ne, ee); // True if they overlap
      }
      return false;
    });

    if (overlapping) {
      msgEl.textContent = `Çakışma Hatası: Seçili personelin ${overlapping.startTime}-${overlapping.endTime} saatleri arasında zaten bir vardiyası var.`;
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
      return;
    }
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Kaydediliyor...';
  
  const shiftData = {
    restaurantId,
    date,
    startTime,
    endTime,
    staffId,
    role,
    notes,
    checklist: currentModalChecklist
  };
  
  try {
    if (id) {
      await window.firebaseFirestore.updateDoc(
        window.firebaseFirestore.doc(window.db, 'shifts', id), 
        shiftData
      );
    } else {
      await window.firebaseFirestore.addDoc(
        window.firebaseFirestore.collection(window.db, 'shifts'), 
        shiftData
      );
    }
    
    await loadShiftsForCurrentWeek();
    closeShiftModal();
    // Re-render staff list to update weekly hours
    renderStaffList();
  } catch (error) {
    console.error("Error saving shift:", error);
    msgEl.textContent = "Kaydedilirken bir hata oluştu.";
    msgEl.className = 'auth-message error';
    msgEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Kaydet';
  }
}

async function deleteShift() {
  const id = document.getElementById('shiftId').value;
  if (id && confirm("Bu vardiyayı silmek istediğinize emin misiniz?")) {
    try {
      await window.firebaseFirestore.deleteDoc(window.firebaseFirestore.doc(window.db, 'shifts', id));
      await loadShiftsForCurrentWeek();
      closeShiftModal();
    } catch (error) {
      console.error("Error deleting shift:", error);
      const msgEl = document.getElementById('shiftModalMessage');
      msgEl.textContent = "Silinirken bir hata oluştu.";
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
  }
}

function redirectToPersonelBul() {
  const date = document.getElementById('shiftDate').value;
  const start = document.getElementById('shiftStartTime').value;
  const end = document.getElementById('shiftEndTime').value;
  const role = document.getElementById('shiftRole').value;
  const notes = document.getElementById('shiftNotes').value;

  if (!date || !start || !end) {
    const msgEl = document.getElementById('shiftModalMessage');
    msgEl.textContent = 'Lütfen Mirket ile personel aramadan önce Tarih, Başlangıç ve Bitiş saatlerini doldurunuz. Bu bilgiler ilanınıza yansıtılacaktır.';
    msgEl.className = 'auth-message warning';
    msgEl.classList.remove('hidden');
    return;
  }

  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (start) params.append('start', start);
  if (end) params.append('end', end);
  if (role) params.append('role', role);
  if (notes) params.append('notes', notes);

  window.location.href = `personel-bul.html?${params.toString()}`;
}
