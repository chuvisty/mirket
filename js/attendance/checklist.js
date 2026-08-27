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

  const allShifts = [
    ...(typeof loadedAttendanceShifts !== 'undefined' ? loadedAttendanceShifts : []),
    ...(window.currentShifts || []),
    ...(window.allMyShiftsData || [])
  ];
  const shift = allShifts.find(s => s.id === shiftId);
  if (!shift || !shift.checklist || shift.checklist.length === 0) {
    alert("Bu vardiyaya ait görev bulunamadı.");
    return;
  }

  if (subtitle) {
    const staffList = window.staffMembers || [];
    const staff = shift.staffId ? staffList.find(s => s.id === shift.staffId) : null;
    subtitle.textContent = `${(staff ? staff.name : null) || shift.workerName || 'Çalışan'} - ${shift.date} (${shift.startTime || ''}-${shift.endTime || ''})`;
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
