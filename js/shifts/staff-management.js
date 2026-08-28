// --- STAFF MANAGEMENT: Staff CRUD operations ---
async function loadStaff() {
  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'restaurantStaff'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId)
    );
    const snapshot = await window.firebaseFirestore.getDocs(q);
    staffMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    window.staffMembers = staffMembers;
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
