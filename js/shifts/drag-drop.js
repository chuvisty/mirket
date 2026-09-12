// --- DRAG & DROP & STAFF POOL: Drag staff from right pool to calendar slots & vice versa ---
let draggedStaffId = null;
let currentQuickAssignShiftId = null;

function renderAvailableStaffPool() {
  const container = document.getElementById('staffPoolList');
  if (!container) return;

  const searchInput = document.getElementById('staffPoolSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  if (!staffMembers || staffMembers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 25px 10px; color: #94a3b8; font-size: 13px;">
        <div style="font-size: 26px; margin-bottom: 6px;">👥</div>
        <p style="margin: 0;">Kayıtlı personel bulunamadı.</p>
        <button type="button" class="btn ghost" onclick="openStaffModal()" style="margin-top: 10px; font-size: 11px; padding: 4px 10px;">+ Personel Ekle</button>
      </div>
    `;
    return;
  }

  // Filter staff by search query
  const filtered = staffMembers.filter(s => {
    if (!query) return true;
    return (s.name || '').toLowerCase().includes(query) || (s.role || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 12px;">
        Aranan kritere uygun personel bulunamadı.
      </div>
    `;
    return;
  }

  // Calculate current week's total assigned hours for each staff
  const staffHoursMap = {};
  staffMembers.forEach(s => staffHoursMap[s.id] = 0);

  if (Array.isArray(currentShifts)) {
    currentShifts.forEach(shift => {
      if (shift.staffId && staffHoursMap.hasOwnProperty(shift.staffId)) {
        staffHoursMap[shift.staffId] += calculateShiftHours(shift.startTime, shift.endTime);
      }
    });
  }

  container.innerHTML = filtered.map(staff => {
    const hours = staffHoursMap[staff.id] || 0;
    const initial = (staff.name || 'P').trim().charAt(0).toUpperCase();
    const roleGradient = getRoleColor(staff.role) || 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';

    return `
      <div class="staff-pool-item" 
           draggable="true" 
           data-staff-id="${staff.id}"
           id="staff_pool_${staff.id}"
           title="Sürükleyip takvimdeki bir boş slota bırakın">
        <div class="staff-pool-item-left">
          <div class="staff-pool-avatar" style="background: ${roleGradient};">
            ${initial}
          </div>
          <div class="staff-pool-details">
            <span class="staff-pool-name">${staff.name}</span>
            <span class="staff-pool-role">${staff.role || 'Personel'}</span>
          </div>
        </div>
        <div class="staff-pool-item-right">
          <span class="staff-pool-hours" title="Bu takvimdeki toplam atanmış saat">${hours.toFixed(1)}s</span>
          <span class="staff-pool-status-dot" title="Aktif Personel"></span>
          <span class="staff-pool-drag-handle">⋮⋮</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach drag listeners to staff pool items
  const items = container.querySelectorAll('.staff-pool-item');
  items.forEach(item => {
    item.addEventListener('dragstart', handleStaffDragStart);
    item.addEventListener('dragend', handleStaffDragEnd);
  });
}

function filterStaffPoolList(query) {
  renderAvailableStaffPool();
}

function handleStaffDragStart(e) {
  draggedStaffId = this.getAttribute('data-staff-id');
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', draggedStaffId);
  this.classList.add('is-dragging');

  // Highlight all empty slots on calendar as drop targets
  const emptySlots = document.querySelectorAll('.shift-slot-empty');
  emptySlots.forEach(slot => slot.classList.add('drop-target-ready'));
}

function handleStaffDragEnd(e) {
  draggedStaffId = null;
  this.classList.remove('is-dragging');

  const emptySlots = document.querySelectorAll('.shift-slot-empty');
  emptySlots.forEach(slot => {
    slot.classList.remove('drop-target-ready');
    slot.classList.remove('drop-target-active');
  });
}

// Bind dragover, dragleave and drop on empty slots
function initSlotDropZones() {
  const emptySlots = document.querySelectorAll('.shift-slot-empty');
  emptySlots.forEach(slot => {
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      slot.classList.add('drop-target-active');
    });

    slot.addEventListener('dragleave', (e) => {
      slot.classList.remove('drop-target-active');
    });

    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      slot.classList.remove('drop-target-active');
      slot.classList.remove('drop-target-ready');

      const staffId = e.dataTransfer.getData('text/plain') || draggedStaffId;
      const shiftId = slot.getAttribute('data-shift-id');

      if (staffId && shiftId) {
        await assignStaffToShift(shiftId, staffId);
      }
    });
  });
}

async function assignStaffToShift(shiftId, staffId) {
  const shift = currentShifts.find(s => s.id === shiftId);
  const staff = staffMembers.find(s => s.id === staffId);

  if (!shift || !staff) return;

  // Conflict detection
  const overlapping = currentShifts.find(s => {
    if (s.id === shiftId) return false;
    if (s.date === shift.date && s.staffId === staffId) {
      const [nsh, nsm] = (shift.startTime || '00:00').split(':').map(Number);
      const [neh, nem] = (shift.endTime || '00:00').split(':').map(Number);
      const [esh, esm] = (s.startTime || '00:00').split(':').map(Number);
      const [eeh, eem] = (s.endTime || '00:00').split(':').map(Number);

      let ns = nsh * 60 + nsm;
      let ne = neh * 60 + nem;
      if (ne <= ns) ne += 24 * 60;

      let es = esh * 60 + esm;
      let ee = eeh * 60 + eem;
      if (ee <= es) ee += 24 * 60;

      return Math.max(ns, es) < Math.min(ne, ee);
    }
    return false;
  });

  if (overlapping) {
    alert(`⚠️ Çakışma Uyarısı:\n\n${staff.name} adlı personelin ${shift.date} tarihinde ${overlapping.startTime} - ${overlapping.endTime} saatlerinde zaten bir vardiyası bulunuyor.`);
    return;
  }

  // Optimistic UI update
  shift.staffId = staffId;
  renderCalendar();

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'shifts', shiftId),
      { staffId }
    );
  } catch (error) {
    console.error("Error assigning staff to shift:", error);
    alert("Personel atanırken bir hata oluştu.");
    await loadShiftsForCurrentWeek();
  }
}

async function unassignStaffFromShift(shiftId) {
  const shift = currentShifts.find(s => s.id === shiftId);
  if (!shift) return;

  // Optimistic UI update
  shift.staffId = null;
  renderCalendar();

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'shifts', shiftId),
      { staffId: null }
    );
  } catch (error) {
    console.error("Error unassigning staff from shift:", error);
    alert("Personel kaldırılırken bir hata oluştu.");
    await loadShiftsForCurrentWeek();
  }
}

// --- QUICK ASSIGN POPUP (FOR TOUCH / MOBILE / CLICK) ---

function openQuickAssignModal(shiftId) {
  currentQuickAssignShiftId = shiftId;
  const shift = currentShifts.find(s => s.id === shiftId);
  if (!shift) return;

  const modal = document.getElementById('quickAssignModal');
  const detailsEl = document.getElementById('quickAssignShiftDetails');
  const listEl = document.getElementById('quickAssignStaffList');
  if (!modal || !detailsEl || !listEl) return;

  detailsEl.innerHTML = `
    <div style="background: #f1f5f9; padding: 10px 14px; border-radius: 8px; font-size: 13px; color: #1e293b; margin-bottom: 15px;">
      <div><strong>Tarih:</strong> ${formatDisplayDate(new Date(shift.date))} (${shift.date})</div>
      <div><strong>Saat:</strong> ${shift.startTime} - ${shift.endTime} | <strong>Görev:</strong> ${shift.role || 'Genel'}</div>
    </div>
  `;

  if (!staffMembers || staffMembers.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 15px;">Kayıtlı personel bulunamadı.</p>';
  } else {
    listEl.innerHTML = staffMembers.map(staff => {
      const initial = (staff.name || 'P').trim().charAt(0).toUpperCase();
      const roleGradient = getRoleColor(staff.role) || 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
      return `
        <div class="quick-assign-staff-row" onclick="handleQuickAssignSelect('${staff.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${roleGradient}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">
              ${initial}
            </div>
            <div>
              <div style="font-weight: 600; font-size: 13px; color: #0f172a;">${staff.name}</div>
              <div style="font-size: 11px; color: #64748b;">${staff.role || 'Personel'}</div>
            </div>
          </div>
          <button type="button" class="btn secondary" style="padding: 4px 10px; font-size: 12px;">Ata</button>
        </div>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
}

function closeQuickAssignModal() {
  const modal = document.getElementById('quickAssignModal');
  if (modal) modal.classList.add('hidden');
  currentQuickAssignShiftId = null;
}

async function handleQuickAssignSelect(staffId) {
  if (!currentQuickAssignShiftId) return;
  const shiftId = currentQuickAssignShiftId;
  closeQuickAssignModal();
  await assignStaffToShift(shiftId, staffId);
}

function openEditCurrentQuickShift() {
  if (!currentQuickAssignShiftId) return;
  const sId = currentQuickAssignShiftId;
  closeQuickAssignModal();
  editShift(sId);
}

// Window attachments
window.renderAvailableStaffPool = renderAvailableStaffPool;
window.filterStaffPoolList = filterStaffPoolList;
window.initSlotDropZones = initSlotDropZones;
window.assignStaffToShift = assignStaffToShift;
window.unassignStaffFromShift = unassignStaffFromShift;
window.openQuickAssignModal = openQuickAssignModal;
window.closeQuickAssignModal = closeQuickAssignModal;
window.handleQuickAssignSelect = handleQuickAssignSelect;
window.openEditCurrentQuickShift = openEditCurrentQuickShift;
