// --- SHIFT CRUD: Shift creation, editing, deletion & checklist ---
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
