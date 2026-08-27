// --- CHECKLIST: Shift task checklist functions ---
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
    if (typeof currentActiveShift !== 'undefined' && currentActiveShift && currentActiveShift.id === shiftId) {
      currentActiveShift.checklist = updatedChecklist;
      const workerUid = window.auth?.currentUser?.uid;
      if (workerUid && typeof checkWorkerActiveShift === 'function') checkWorkerActiveShift(workerUid);
    }

    // Update in allMyShiftsData (worker view)
    if (window.allMyShiftsData) {
      const idx = window.allMyShiftsData.findIndex(s => s.id === shiftId);
      if (idx !== -1) window.allMyShiftsData[idx].checklist = updatedChecklist;
    }

    // Update in loadedAttendanceShifts (restaurant view)
    if (typeof loadedAttendanceShifts !== 'undefined') {
      const idx = loadedAttendanceShifts.findIndex(s => s.id === shiftId);
      if (idx !== -1) loadedAttendanceShifts[idx].checklist = updatedChecklist;
    }

    // Update in currentShifts (restaurant view)
    if (window.currentShifts) {
      const idx = window.currentShifts.findIndex(s => s.id === shiftId);
      if (idx !== -1) window.currentShifts[idx].checklist = updatedChecklist;
    }

    // Re-render the modal and the shifts list
    if (typeof openShiftChecklistDetailModal === 'function') openShiftChecklistDetailModal(shiftId);
    if (typeof filterMyShifts === 'function') {
      // Find which tab is active and re-filter to update the buttons
      const tabUpcoming = document.getElementById('tabUpcoming');
      const tabPast = document.getElementById('tabPast');
      if (tabUpcoming && tabUpcoming.classList.contains('active')) filterMyShifts('upcoming');
      else if (tabPast && tabPast.classList.contains('active')) filterMyShifts('past');
      else filterMyShifts('all');
    }

  } catch (err) {
    console.error("Error toggling checklist item:", err);
  }
}
window.toggleChecklistItem = toggleChecklistItem;

// --- CHECKLIST DETAIL MODAL FOR REPORTING & WORKER ---
function openShiftChecklistDetailModal(shiftId) {
  const modal = document.getElementById('shiftChecklistDetailModal');
  const subtitle = document.getElementById('checklistDetailSubtitle');
  const content = document.getElementById('checklistDetailContent');
  if (!modal || !content) return;

  const allShifts = [
    ...(typeof loadedAttendanceShifts !== 'undefined' ? loadedAttendanceShifts : []),
    ...(window.currentShifts || []),
    ...(window.allMyShiftsData || [])
  ];
  let shift = allShifts.find(s => s.id === shiftId);
  
  if (!shift && window.allMyShiftsData) {
    shift = window.allMyShiftsData.find(s => String(s.id) === String(shiftId));
  }

  if (!shift || !shift.checklist || shift.checklist.length === 0) {
    alert("Bu vardiyaya ait görev bulunamadı.");
    return;
  }

  if (subtitle) {
    const staffList = window.staffMembers || [];
    const staff = shift.staffId ? staffList.find(s => s.id === shift.staffId) : null;
    subtitle.textContent = `${(staff ? staff.name : null) || shift.workerName || 'Çalışan'} - ${shift.date} (${shift.startTime || ''}-${shift.endTime || ''})`;
  }

  const isWorker = window.auth?.currentUser?.uid === shift.workerId;
  const todayStr = (function() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();
  const isPast = (shift.date || '') < todayStr;
  const canEdit = isWorker && !isPast; // Workers can only check off tasks on current or upcoming shifts

  content.innerHTML = shift.checklist.map((item, idx) => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: ${item.completed ? '#f0fdf4' : '#f8fafc'}; border: 1px solid ${item.completed ? '#bbf7d0' : '#e2e8f0'}; border-radius: 8px; padding: 10px 12px; font-size: 13px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: ${canEdit ? 'pointer' : 'default'}; flex: 1;">
        ${canEdit ? `<input type="checkbox" onchange="toggleChecklistItem('${shift.id}', '${item.id}', this.checked)" ${item.completed ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">` : (item.completed ? '✅' : '⏳')}
        <span style="color: ${item.completed ? '#166534' : '#334155'}; font-weight: 500; text-decoration: ${item.completed ? 'line-through' : 'none'};">
          ${idx + 1}. ${item.task}
        </span>
      </label>
      <span style="font-size: 11px; color: ${item.completed ? '#15803d' : '#94a3b8'}; margin-left: 10px;">
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
