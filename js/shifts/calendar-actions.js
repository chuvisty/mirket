// --- CALENDAR ACTIONS: Day menu, copy/clear shifts & day detail timeline ---
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
