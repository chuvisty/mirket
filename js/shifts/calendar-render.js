// --- CALENDAR RENDER: Calendar grid rendering & navigation ---
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
    header.innerHTML = `${dayNames[i % 7]}<br><span style="font-size:12px;color:#94a3b8;">${d.getDate()}</span>`;
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
          realCheckInTimeStr = shift.checkInTime.toDate().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
        }
        
        let realCheckOutTimeStr = '';
        if (shift.checkOutTime && typeof shift.checkOutTime.toDate === 'function') {
          realCheckOutTimeStr = ` - ${shift.checkOutTime.toDate().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })}`;
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
