// --- REPORTS: Attendance table rendering & CSV export ---
async function loadAttendanceLogs(restaurantId, filterPeriod = 'today') {
  const tableBody = document.getElementById('attendanceLogsTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#64748b;">Mesai kayıtları yükleniyor...</td></tr>';

  try {
    await autoCloseExpiredShifts(restaurantId);

    let q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', restaurantId)
    );

    const snapshot = await window.firebaseFirestore.getDocs(q);
    let shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Date filtering client-side for flexibility
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (filterPeriod === 'today') {
      shifts = shifts.filter(s => s.date === todayStr);
    } else if (filterPeriod === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      shifts = shifts.filter(s => s.date >= weekAgoStr);
    } else if (filterPeriod === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const monthAgoStr = monthAgo.toISOString().split('T')[0];
      shifts = shifts.filter(s => s.date >= monthAgoStr);
    }

    // Sort by checkInTime descending
    shifts.sort((a, b) => {
      const tA = a.checkInTime && typeof a.checkInTime.toDate === 'function' ? a.checkInTime.toDate() : new Date(a.date);
      const tB = b.checkInTime && typeof b.checkInTime.toDate === 'function' ? b.checkInTime.toDate() : new Date(b.date);
      return tB - tA;
    });

    loadedAttendanceShifts = shifts;
    renderAttendanceTable(shifts);

  } catch (error) {
    console.error("Error loading attendance logs:", error);
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#ef4444;">Kayıtlar yüklenirken hata oluştu.</td></tr>';
  }
}
window.loadAttendanceLogs = loadAttendanceLogs;

function renderAttendanceTable(shifts) {
  const tableBody = document.getElementById('attendanceLogsTableBody');
  if (!tableBody) return;

  if (shifts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">Seçilen dönemde mesai kaydı bulunamadı.</td></tr>';
    return;
  }

  const staffList = window.staffMembers || [];
  let totalWorkedHoursPeriod = 0;
  let totalPayrollPeriod = 0;

  const rowsHtml = shifts.map(shift => {
    // 1. Clock times
    const checkInDate = shift.checkInTime && typeof shift.checkInTime.toDate === 'function' ? shift.checkInTime.toDate() : null;
    const checkOutDate = shift.checkOutTime && typeof shift.checkOutTime.toDate === 'function' ? shift.checkOutTime.toDate() : null;

    const inTime = checkInDate
      ? checkInDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (shift.startTime || '-');

    const outTime = checkOutDate
      ? checkOutDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (shift.status === 'active' ? '<span style="color:#eab308; font-weight:700;">Devam Ediyor</span>' : (shift.endTime || '-'));

    // 2. Worked Hours & Wage Calculation
    let workedHours = 0;
    if (shift.totalWorkedMinutes) {
      workedHours = shift.totalWorkedMinutes / 60;
    } else if (checkInDate && checkOutDate) {
      workedHours = (checkOutDate - checkInDate) / 3600000;
    } else if (shift.startTime && shift.endTime && shift.status === 'completed') {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins <= 0) mins += 24 * 60;
      workedHours = mins / 60;
    }

    totalWorkedHoursPeriod += workedHours;

    // Find staff wage info
    const staff = shift.staffId ? staffList.find(s => s.id === shift.staffId) : null;
    let earnings = 0;
    let wageLabel = '-';

    if (staff && staff.wageAmount) {
      if (staff.wageType === 'daily') {
        earnings = staff.wageAmount;
        wageLabel = `${earnings.toLocaleString('tr-TR')} ₺ (Günlük)`;
      } else {
        earnings = workedHours * staff.wageAmount;
        wageLabel = `${Math.round(earnings).toLocaleString('tr-TR')} ₺ (${staff.wageAmount} TL/s)`;
      }
    }
    totalPayrollPeriod += earnings;

    // 3. Punctuality status badge
    let punctualityBadge = '';
    if (checkInDate && shift.startTime) {
      const actualMins = checkInDate.getHours() * 60 + checkInDate.getMinutes();
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const schedMins = sh * 60 + sm;
      const diff = actualMins - schedMins;

      if (diff <= 5) {
        punctualityBadge = `<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">🟢 Zamanında</span>`;
      } else if (diff <= 15) {
        punctualityBadge = `<span style="background:#f59e0b; color:white; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">🟡 +${diff} dk</span>`;
      } else {
        punctualityBadge = `<span style="background:#ef4444; color:white; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">🔴 +${diff} dk</span>`;
      }
    }

    // 4. Checklist status badge
    let checklistBadge = '<span style="color:#94a3b8;">-</span>';
    if (shift.checklist && shift.checklist.length > 0) {
      const done = shift.checklist.filter(c => c.completed).length;
      const total = shift.checklist.length;
      const pct = Math.round((done / total) * 100);
      const isAllDone = done === total;
      checklistBadge = `
        <button type="button" class="btn ghost" style="padding:2px 8px; font-size:11px; border:1px solid ${isAllDone ? '#bbf7d0' : '#cbd5e1'}; background:${isAllDone ? '#f0fdf4' : '#f8fafc'}; color:${isAllDone ? '#15803d' : '#334155'}; font-weight:600;" onclick="openShiftChecklistDetailModal('${shift.id}')">
          📋 %${pct} (${done}/${total})
        </button>
      `;
    }

    const geoBadge = shift.checkInGeo
      ? `<span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px;" title="GPS ile doğrulandı (${shift.checkInGeo.distanceMeters}m)">✓ GPS</span>`
      : `<span style="font-size:11px; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">Manuel</span>`;

    const statusBadge = shift.status === 'active'
      ? `<span style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Aktif</span>`
      : `<span style="background:#10b981; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">Tamamlandı</span>`;

    const overrideBtn = shift.status === 'active'
      ? `<button class="btn ghost" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="manualOverrideClockOut('${shift.id}')">Kapat</button>`
      : '';

    const scheduledInfo = (shift.startTime && shift.endTime)
      ? `<div style="font-size:10px; color:#94a3b8; margin-top:2px;">📅 Plan: ${shift.startTime} - ${shift.endTime}</div>`
      : '';

    return `
      <tr>
        <td>
          <strong>${(staff ? staff.name : null) || shift.workerName || 'Çalışan'}</strong><br>
          <span style="font-size:11px; color:#64748b;">${(staff ? staff.phone : null) || shift.workerPhone || ''}</span>
          ${scheduledInfo}
        </td>
        <td>${shift.date}</td>
        <td>${inTime}</td>
        <td>${outTime}</td>
        <td><strong>${workedHours > 0 ? workedHours.toFixed(1) + ' Sa' : '-'}</strong></td>
        <td><strong style="color: #047857;">${wageLabel}</strong></td>
        <td>${checklistBadge}</td>
        <td>${punctualityBadge} ${statusBadge} ${geoBadge} ${overrideBtn}</td>
      </tr>
    `;
  }).join('');

  // Add summary footer row
  const footerRow = `
    <tr style="background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0;">
      <td colspan="4" style="text-align: right; padding: 12px 10px;">TOPLAM (DÖNEM):</td>
      <td style="padding: 12px 10px; color: #0f172a;">${totalWorkedHoursPeriod.toFixed(1)} Saat</td>
      <td style="padding: 12px 10px; color: #047857;">${Math.round(totalPayrollPeriod).toLocaleString('tr-TR')} ₺</td>
      <td colspan="2"></td>
    </tr>
  `;

  tableBody.innerHTML = rowsHtml + footerRow;
}
window.renderAttendanceTable = renderAttendanceTable;

async function manualOverrideClockOut(shiftId) {
  if (!confirm("Bu çalışanın devam eden vardiyasını manuel olarak kapatmak istediğinize emin misiniz?")) return;

  try {
    const shiftRef = window.firebaseFirestore.doc(window.db, 'shifts', shiftId);
    const snap = await window.firebaseFirestore.getDoc(shiftRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const checkInDate = data.checkInTime && typeof data.checkInTime.toDate === 'function' ? data.checkInTime.toDate() : new Date();
    const checkOutDate = new Date();
    const totalMinutes = Math.max(1, Math.round((checkOutDate - checkInDate) / 60000));

    await window.firebaseFirestore.updateDoc(shiftRef, {
      status: 'completed',
      checkOutTime: window.firebaseFirestore.serverTimestamp(),
      endTime: checkOutDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      totalWorkedMinutes: totalMinutes,
      isManualOverride: true
    });

    alert("Vardiya manuel olarak kapatıldı.");
    if (window.auth.currentUser) {
      loadAttendanceLogs(window.auth.currentUser.uid);
    }
  } catch (err) {
    console.error("Error overriding shift:", err);
    alert("Vardiya kapatılırken hata oluştu.");
  }
}
window.manualOverrideClockOut = manualOverrideClockOut;

function exportAttendanceToCSV() {
  if (!loadedAttendanceShifts || loadedAttendanceShifts.length === 0) {
    alert("Dışa aktarılacak mesai kaydı bulunamadı.");
    return;
  }

  const staffList = window.staffMembers || [];

  const headers = ["Çalışan Adı", "Telefon", "Tarih", "Giriş Saati", "Çıkış Saati", "Çalışılan Saat", "Hakediş Tutarı (TL)", "Görev Tamamlama", "Zamanındalık", "Durum"];
  const rows = loadedAttendanceShifts.map(s => {
    const inTime = s.checkInTime && typeof s.checkInTime.toDate === 'function'
      ? s.checkInTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (s.startTime || '');
    const outTime = s.checkOutTime && typeof s.checkOutTime.toDate === 'function'
      ? s.checkOutTime.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : (s.endTime || '');

    let workedHours = s.totalWorkedMinutes ? (s.totalWorkedMinutes / 60) : 0;
    const staff = s.staffId ? staffList.find(st => st.id === s.staffId) : null;
    let earnings = 0;
    if (staff && staff.wageAmount) {
      earnings = staff.wageType === 'daily' ? staff.wageAmount : (workedHours * staff.wageAmount);
    }

    let checklistStr = '-';
    if (s.checklist && s.checklist.length > 0) {
      const done = s.checklist.filter(c => c.completed).length;
      checklistStr = `${done}/${s.checklist.length} (%${Math.round((done/s.checklist.length)*100)})`;
    }

    let punctualityStr = 'Belirtilmedi';
    if (s.checkInTime && s.startTime) {
      const cDate = typeof s.checkInTime.toDate === 'function' ? s.checkInTime.toDate() : new Date(s.checkInTime);
      const actualMins = cDate.getHours() * 60 + cDate.getMinutes();
      const [sh, sm] = s.startTime.split(':').map(Number);
      const diff = actualMins - (sh * 60 + sm);
      punctualityStr = diff <= 5 ? 'Zamanında' : `+${diff} dk Geç`;
    }

    return [
      `"${(staff ? staff.name : '') || s.workerName || ''}"`,
      `"${(staff ? staff.phone : '') || s.workerPhone || ''}"`,
      `"${s.date || ''}"`,
      `"${inTime}"`,
      `"${outTime}"`,
      `"${workedHours.toFixed(1)}"`,
      `"${Math.round(earnings)}"`,
      `"${checklistStr}"`,
      `"${punctualityStr}"`,
      `"${s.status === 'active' ? 'Aktif' : 'Tamamlandı'}"`
    ].join(',');
  });

  const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `mirket_mesai_raporu_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.exportAttendanceToCSV = exportAttendanceToCSV;
