// --- CALENDAR RENDER: Calendar grid rendering, slot states & navigation ---
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
  
  const labelEl = document.getElementById('currentWeekLabel');
  if (labelEl) {
    labelEl.textContent = `${startStr} - ${endStr}`;
  }
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
    renderStaffList(); // Update weekly hours in staff roster list
  }
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
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
    dayShifts.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    
    dayShifts.forEach(shift => {
      const staff = shift.staffId ? staffMembers.find(s => s.id === shift.staffId) : null;
      const hasClockIn = Boolean(shift.workerId) && (shift.status === 'active' || shift.status === 'completed');
      const isEmptySlot = !staff && !hasClockIn;

      const shiftEl = document.createElement('div');
      shiftEl.setAttribute('data-shift-id', shift.id);

      if (isEmptySlot) {
        // --- BOŞ SLOT (UNASSIGNED SLOT) ---
        shiftEl.className = 'shift-item shift-slot-empty';
        shiftEl.onclick = (event) => {
          event.stopPropagation();
          if (typeof openQuickAssignModal === 'function') {
            openQuickAssignModal(shift.id);
          } else {
            editShift(shift.id);
          }
        };

        const isRetro = Boolean(shift.isRetroactiveEdit);
        const retroBadge = isRetro
          ? `<span style="display:inline-block; font-size:9px; background:#fffbeb; color:#b45309; padding:1px 4px; border-radius:3px; border:1px solid #fde68a; font-weight:700;" title="Geçmiş Kayıt Düzeltmesi">⚠️ Düzeltme</span>`
          : '';

        if (isRetro) {
          shiftEl.style.boxShadow = '0 0 0 1.5px #f59e0b';
        }

        const roleColor = getRoleColor(shift.role);
        if (roleColor) {
          shiftEl.style.borderLeft = `4px solid #0284c7`;
        }

        shiftEl.innerHTML = `
          <div class="slot-role-header">
            <span class="slot-role-title">${shift.role || 'Genel Görev'} ${retroBadge}</span>
            <button type="button" class="slot-mini-btn" title="Düzenle" onclick="event.stopPropagation(); editShift('${shift.id}')">⚙️</button>
          </div>
          <div class="shift-time">${shift.startTime || ''} - ${shift.endTime || ''}</div>
          <div class="slot-empty-prompt">⚡ [Boş - Sürükle]</div>
        `;
        shiftEl.title = `Tarih: ${formatDisplayDate(new Date(shift.date))}\nSaat: ${shift.startTime} - ${shift.endTime}\nGörev: ${shift.role || 'Belirtilmedi'}\nDurum: Boş Slot (Personel Sürükleyin veya Tıklayın)${isRetro ? '\n[⚠️ Geçmiş Kayıt Düzeltmesi]' : ''}`;
      } else {
        // --- DOLU SLOT / VARDİYA (ASSIGNED SHIFT) ---
        shiftEl.className = 'shift-item shift-assigned';
        shiftEl.onclick = (event) => {
          event.stopPropagation();
          editShift(shift.id);
        };

        const isRetro = Boolean(shift.isRetroactiveEdit);
        const retroBadge = isRetro
          ? `<span style="display:inline-block; font-size:9px; background:#fffbeb; color:#b45309; padding:1px 4px; border-radius:3px; border:1px solid #fde68a; font-weight:700;" title="Geçmiş Kayıt Düzeltmesi">⚠️ Düzeltme</span>`
          : '';

        if (isRetro) {
          shiftEl.style.boxShadow = '0 0 0 1.5px #f59e0b';
        }

        let staffName = staff ? staff.name : (shift.workerName || 'Çalışan');
        let displayName = staffName;
        let clockInInfo = '';
        let tooltipText = '';

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
          
          clockInInfo = `<div class="shift-clock-info">${realCheckInTimeStr}${realCheckOutTimeStr}</div>`;
          const plannedInfo = shift.startTime && shift.endTime ? `\nPlanlanan: ${shift.startTime} - ${shift.endTime}` : '';
          tooltipText = `Tarih: ${formatDisplayDate(new Date(shift.date))}\nGerçek Giriş: ${realCheckInTimeStr}${realCheckOutTimeStr}\nPersonel: ${displayName}\nDurum: ${statusText}${plannedInfo}\nGörev: ${shift.role || 'Belirtilmedi'}\nNot: ${shift.notes || '-'}${isRetro ? '\n[⚠️ Geçmiş Kayıt Düzeltmesi]' : ''}`;
        } else {
          tooltipText = `Tarih: ${formatDisplayDate(new Date(shift.date))}\nSaat: ${shift.startTime} - ${shift.endTime}\nPersonel: ${staffName}\nGörev: ${shift.role || 'Belirtilmedi'}\nNot: ${shift.notes || '-'}${isRetro ? '\n[⚠️ Geçmiş Kayıt Düzeltmesi]' : ''}`;
        }
        
        shiftEl.title = tooltipText;

        if (shift.role) {
          const bg = getRoleColor(shift.role);
          if (bg) {
            shiftEl.style.borderLeftColor = 'transparent';
          }
        }

        // Unassign button for scheduled shifts (not clock-ins)
        const unassignBtnHtml = !hasClockIn 
          ? `<button type="button" class="slot-unassign-btn" title="Personeli Kaldır (Boş Slot Yap)" onclick="event.stopPropagation(); unassignStaffFromShift('${shift.id}')">&times;</button>`
          : '';

        shiftEl.innerHTML = `
          <div class="slot-top-row">
            <div class="shift-time">${shift.startTime || ''} - ${shift.endTime || ''} ${retroBadge}</div>
            ${unassignBtnHtml}
          </div>
          ${clockInInfo}
          <div class="shift-name shift-assigned">✓ ${displayName}</div>
          ${shift.role ? `<div class="shift-role">${shift.role}</div>` : ''}
        `;
      }
      
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

  // Sync right-hand Available Staff Pool and bind drop zones
  if (typeof renderAvailableStaffPool === 'function') {
    renderAvailableStaffPool();
  }
  if (typeof initSlotDropZones === 'function') {
    initSlotDropZones();
  }
}
