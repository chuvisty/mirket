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
      ? checkInDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
      : (shift.startTime || '-');

    const outTime = checkOutDate
      ? checkOutDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
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
      const inTimeStr = checkInDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
      const [actualHr, actualMn] = inTimeStr.split(':').map(Number);
      const actualMins = actualHr * 60 + actualMn;
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

    let methodBadge = '';
    if (shift.entryMethod === 'pin_code') {
      methodBadge = `<span style="font-size:10px; background:#fef3c7; color:#b45309; padding:2px 5px; border-radius:4px; font-weight:600; border:1px solid #fde68a;" title="Şube PIN kodu ile giriş (${shift.entryPin || ''})">🔢 PIN</span>`;
    } else if (shift.entryMethod === 'qr_live') {
      methodBadge = `<span style="font-size:10px; background:#f0fdf4; color:#15803d; padding:2px 5px; border-radius:4px; font-weight:600; border:1px solid #bbf7d0;" title="Canlı QR ile giriş">📱 QR</span>`;
    }

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
        <td>${punctualityBadge} ${statusBadge} ${methodBadge} ${geoBadge} ${overrideBtn}</td>
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
      endTime: checkOutDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }),
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
      ? s.checkInTime.toDate().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
      : (s.startTime || '');
    const outTime = s.checkOutTime && typeof s.checkOutTime.toDate === 'function'
      ? s.checkOutTime.toDate().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
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
      const inTimeStr = cDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
      const [actualHr, actualMn] = inTimeStr.split(':').map(Number);
      const actualMins = actualHr * 60 + actualMn;
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

// ==========================================================================
// AY SONU TOPLU PUANTAJ & BORDRO DÖKÜMÜ (MONETIZATION & MUHASEBE RAPORU)
// ==========================================================================

let loadedPayrollSummary = [];
let currentPayrollPeriodMonth = '';
let currentPayrollFilterStaffId = 'all';

// Initialize month selector with current month and past 6 months
function populatePayrollMonthDropdown() {
  const monthSelect = document.getElementById('payrollMonthSelect');
  if (!monthSelect) return;

  monthSelect.innerHTML = '';
  const now = new Date();
  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const val = `${yr}-${mo}`;
    const label = `${monthNames[d.getMonth()]} ${yr}`;
    
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (i === 0) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  currentPayrollPeriodMonth = monthSelect.value;
}
window.populatePayrollMonthDropdown = populatePayrollMonthDropdown;

// Switch between "Personel Bazlı Puantaj Özeti" and "Günlük Vardiya Logları"
function switchAttendanceView(view) {
  const summaryCard = document.getElementById('payrollSummarySection');
  const logsSection = document.getElementById('attendanceLogsGranularSection');
  const tabSummary = document.getElementById('tabPayrollSummary');
  const tabLogs = document.getElementById('tabAttendanceLogs');

  if (view === 'summary') {
    if (summaryCard) summaryCard.style.display = 'block';
    if (logsSection) logsSection.style.display = 'none';
    if (tabSummary) tabSummary.classList.add('active');
    if (tabLogs) tabLogs.classList.remove('active');
  } else {
    if (summaryCard) summaryCard.style.display = 'none';
    if (logsSection) logsSection.style.display = 'block';
    if (tabSummary) tabSummary.classList.remove('active');
    if (tabLogs) tabLogs.classList.add('active');
  }
}
window.switchAttendanceView = switchAttendanceView;

// Load, aggregate and render Monthly Payroll Summary
async function loadMonthlyPayrollSummary(restId, targetMonth = null) {
  const targetRestId = restId || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : null);
  if (!targetRestId) return;

  const monthSelect = document.getElementById('payrollMonthSelect');
  const selectedMonth = targetMonth || (monthSelect ? monthSelect.value : new Date().toISOString().slice(0, 7));
  currentPayrollPeriodMonth = selectedMonth;

  const tableBody = document.getElementById('payrollSummaryTableBody');
  if (tableBody) {
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:25px; color:#64748b;">📊 Dönem puantaj ve hakediş verileri hesaplanıyor...</td></tr>';
  }

  try {
    // 1. Fetch all shifts for this restaurant
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'shifts'),
      window.firebaseFirestore.where('restaurantId', '==', targetRestId)
    );

    const snapshot = await window.firebaseFirestore.getDocs(q);
    const allShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Filter shifts for the selected month (date string starts with YYYY-MM)
    const monthShifts = allShifts.filter(s => s.date && s.date.startsWith(selectedMonth));

    // 3. Make sure staffMembers is loaded
    const staffList = window.staffMembers || [];

    // 4. Aggregate by staff
    const staffMap = {};

    // Pre-populate with known staff so even zero-hour staff can be tracked if needed
    staffList.forEach(st => {
      staffMap[st.id] = {
        staffId: st.id,
        name: st.name || 'İsimsiz Personel',
        role: st.role || 'Personel',
        phone: st.phone || '',
        wageType: st.wageType || 'hourly',
        wageAmount: Number(st.wageAmount) || 0,
        shiftsCount: 0,
        workedMinutes: 0,
        plannedMinutes: 0,
        totalChecklistItems: 0,
        completedChecklistItems: 0,
        onTimeCount: 0,
        lateCount: 0,
        shifts: []
      };
    });

    // Process shifts
    monthShifts.forEach(shift => {
      const staffKey = shift.staffId || (shift.workerPhone ? `phone_${shift.workerPhone}` : `name_${shift.workerName || 'unknown'}`);
      
      if (!staffMap[staffKey]) {
        staffMap[staffKey] = {
          staffId: shift.staffId || null,
          name: shift.workerName || 'Misafir Çalışan',
          role: 'Günlük Personel',
          phone: shift.workerPhone || '',
          wageType: 'hourly',
          wageAmount: 0,
          shiftsCount: 0,
          workedMinutes: 0,
          plannedMinutes: 0,
          totalChecklistItems: 0,
          completedChecklistItems: 0,
          onTimeCount: 0,
          lateCount: 0,
          shifts: []
        };
      }

      const rec = staffMap[staffKey];
      rec.shiftsCount += 1;
      rec.shifts.push(shift);

      // Planned duration
      if (shift.startTime && shift.endTime) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins <= 0) mins += 24 * 60;
        rec.plannedMinutes += mins;
      }

      // Actual duration
      let actualMins = 0;
      if (shift.totalWorkedMinutes) {
        actualMins = shift.totalWorkedMinutes;
      } else if (shift.checkInTime && shift.checkOutTime) {
        const inD = typeof shift.checkInTime.toDate === 'function' ? shift.checkInTime.toDate() : new Date(shift.checkInTime);
        const outD = typeof shift.checkOutTime.toDate === 'function' ? shift.checkOutTime.toDate() : new Date(shift.checkOutTime);
        actualMins = Math.max(0, Math.round((outD - inD) / 60000));
      } else if (shift.status === 'completed' && shift.startTime && shift.endTime) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins <= 0) mins += 24 * 60;
        actualMins = mins;
      }
      rec.workedMinutes += actualMins;

      // Punctuality check
      if (shift.checkInTime && shift.startTime) {
        const cDate = typeof shift.checkInTime.toDate === 'function' ? shift.checkInTime.toDate() : new Date(shift.checkInTime);
        const inTimeStr = cDate.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
        const [actH, actM] = inTimeStr.split(':').map(Number);
        const [schH, schM] = shift.startTime.split(':').map(Number);
        const diff = (actH * 60 + actM) - (schH * 60 + schM);
        if (diff <= 5) {
          rec.onTimeCount += 1;
        } else {
          rec.lateCount += 1;
        }
      }

      // Checklist completion
      if (shift.checklist && Array.isArray(shift.checklist) && shift.checklist.length > 0) {
        rec.totalChecklistItems += shift.checklist.length;
        rec.completedChecklistItems += shift.checklist.filter(c => c.completed).length;
      }
    });

    // 5. Build summary list
    const summaryList = Object.values(staffMap).map(item => {
      const workedHours = item.workedMinutes / 60;
      const plannedHours = item.plannedMinutes / 60;
      const diffHours = workedHours - plannedHours; // Positive = Overtime, Negative = Missing hours

      let totalEarnings = 0;
      if (item.wageType === 'daily') {
        totalEarnings = item.shiftsCount * item.wageAmount;
      } else {
        totalEarnings = workedHours * item.wageAmount;
      }

      const punctualityRatio = (item.onTimeCount + item.lateCount) > 0
        ? Math.round((item.onTimeCount / (item.onTimeCount + item.lateCount)) * 100)
        : 100;

      const checklistScore = item.totalChecklistItems > 0
        ? Math.round((item.completedChecklistItems / item.totalChecklistItems) * 100)
        : null;

      return {
        ...item,
        workedHours,
        plannedHours,
        diffHours,
        totalEarnings,
        punctualityRatio,
        checklistScore
      };
    });

    // Sort by worked hours descending
    summaryList.sort((a, b) => b.workedHours - a.workedHours);
    loadedPayrollSummary = summaryList;

    renderPayrollSummaryTable(summaryList);
    updatePayrollKpis(summaryList, monthShifts);

  } catch (error) {
    console.error("Error loading monthly payroll summary:", error);
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:25px; color:#ef4444;">Puantaj tablosu yüklenirken hata meydana geldi.</td></tr>';
    }
  }
}
window.loadMonthlyPayrollSummary = loadMonthlyPayrollSummary;

// Update Dashboard KPI cards
function updatePayrollKpis(summaryList, monthShifts) {
  const activeStaff = summaryList.filter(s => s.shiftsCount > 0);
  const totalStaffCount = activeStaff.length;
  const totalHours = activeStaff.reduce((sum, s) => sum + s.workedHours, 0);
  const totalPayroll = activeStaff.reduce((sum, s) => sum + s.totalEarnings, 0);
  const totalOvertime = activeStaff.reduce((sum, s) => sum + (s.diffHours > 0 ? s.diffHours : 0), 0);

  const kpiStaffEl = document.getElementById('kpiPayrollStaffCount');
  const kpiHoursEl = document.getElementById('kpiPayrollTotalHours');
  const kpiPayrollEl = document.getElementById('kpiPayrollTotalAmount');
  const kpiOvertimeEl = document.getElementById('kpiPayrollOvertimeHours');

  if (kpiStaffEl) kpiStaffEl.textContent = `${totalStaffCount} Kişi`;
  if (kpiHoursEl) kpiHoursEl.textContent = `${totalHours.toFixed(1)} Saat`;
  if (kpiPayrollEl) kpiPayrollEl.textContent = `${Math.round(totalPayroll).toLocaleString('tr-TR')} ₺`;
  if (kpiOvertimeEl) kpiOvertimeEl.textContent = `+${totalOvertime.toFixed(1)} Saat`;
}

// Render the aggregated Payroll Table
function renderPayrollSummaryTable(summaryList) {
  const tableBody = document.getElementById('payrollSummaryTableBody');
  if (!tableBody) return;

  // Filter out completely inactive staff if desired, or keep them with 0
  const activeList = summaryList.filter(s => s.shiftsCount > 0);

  if (activeList.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:25px; color:#94a3b8;">Seçilen ayda aktif mesai kaydı bulunamadı.</td></tr>';
    return;
  }

  let grandTotalHours = 0;
  let grandTotalEarnings = 0;
  let grandTotalShifts = 0;

  const rowsHtml = activeList.map(st => {
    grandTotalHours += st.workedHours;
    grandTotalEarnings += st.totalEarnings;
    grandTotalShifts += st.shiftsCount;

    // Diff / Overtime badge
    let diffBadge = '<span style="color:#94a3b8; font-size:12px;">0.0s</span>';
    if (st.diffHours > 0.1) {
      diffBadge = `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px;" title="Fazla Mesai">+${st.diffHours.toFixed(1)}s Mesai</span>`;
    } else if (st.diffHours < -0.1) {
      diffBadge = `<span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px;" title="Eksik Mesai">${st.diffHours.toFixed(1)}s Eksik</span>`;
    }

    // Wage label
    const wageLabel = st.wageType === 'daily'
      ? `${st.wageAmount.toLocaleString('tr-TR')} ₺/Gün`
      : `${st.wageAmount.toLocaleString('tr-TR')} ₺/Saat`;

    // Performance indicators
    const checkBadge = st.checklistScore !== null
      ? `<span style="font-size:11px; font-weight:600; color:#0f766e;">%${st.checklistScore}</span>`
      : '<span style="color:#cbd5e1;">-</span>';

    const punctualityBadge = `<span style="font-size:11px; font-weight:600; color:${st.punctualityRatio >= 85 ? '#15803d' : '#b45309'};">%${st.punctualityRatio}</span>`;

    return `
      <tr>
        <td style="padding: 12px 10px;">
          <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${st.name}</div>
          <div style="font-size: 11px; color: #64748b;">${st.role} • ${st.phone || 'Tel yok'}</div>
        </td>
        <td style="padding: 12px 10px; text-align: center; font-weight: 600;">${st.shiftsCount} Gün</td>
        <td style="padding: 12px 10px; text-align: center; color: #64748b;">${st.plannedHours.toFixed(1)}s</td>
        <td style="padding: 12px 10px; text-align: center; font-weight: 700; color: #0f172a;">${st.workedHours.toFixed(1)} Saat</td>
        <td style="padding: 12px 10px; text-align: center;">${diffBadge}</td>
        <td style="padding: 12px 10px; font-size: 12px; color: #475569;">${wageLabel}</td>
        <td style="padding: 12px 10px; font-size: 14px; font-weight: 800; color: #047857;">${Math.round(st.totalEarnings).toLocaleString('tr-TR')} ₺</td>
        <td style="padding: 12px 10px; text-align: center;">
          ${punctualityBadge} / ${checkBadge}
        </td>
        <td class="signature-col" style="padding: 12px 10px; text-align: center; border-left: 1px dashed #cbd5e1; width: 110px;">
          <div style="border-bottom: 1px dotted #94a3b8; height: 26px; margin: 4px 8px;"></div>
        </td>
      </tr>
    `;
  }).join('');

  // Grand summary footer row
  const footerRow = `
    <tr style="background: #f1f5f9; font-weight: 800; border-top: 2px solid #cbd5e1; font-size: 13px;">
      <td style="padding: 14px 10px;">GENEL TOPLAM (${activeList.length} Personel):</td>
      <td style="padding: 14px 10px; text-align: center;">${grandTotalShifts} Vardiya</td>
      <td style="padding: 14px 10px; text-align: center;">-</td>
      <td style="padding: 14px 10px; text-align: center; color: #0f172a;">${grandTotalHours.toFixed(1)} Saat</td>
      <td style="padding: 14px 10px; text-align: center;">-</td>
      <td style="padding: 14px 10px;">-</td>
      <td style="padding: 14px 10px; color: #047857; font-size: 15px;">${Math.round(grandTotalEarnings).toLocaleString('tr-TR')} ₺</td>
      <td style="padding: 14px 10px; text-align: center;">-</td>
      <td class="signature-col" style="padding: 14px 10px;"></td>
    </tr>
  `;

  tableBody.innerHTML = rowsHtml + footerRow;
}

// Export Monthly Payroll Summary to UTF-8 BOM CSV (Excel Compatible)
function exportPayrollSummaryToCSV() {
  if (!loadedPayrollSummary || loadedPayrollSummary.length === 0) {
    alert("Dışa aktarılacak dönem puantaj verisi bulunamadı.");
    return;
  }

  const activeList = loadedPayrollSummary.filter(s => s.shiftsCount > 0);
  if (activeList.length === 0) {
    alert("Seçilen dönemde puantaj kaydı bulunmuyor.");
    return;
  }

  const headers = [
    "Personel Adı",
    "Rol / Görev",
    "Telefon",
    "Ücret Tipi",
    "Birim Ücret (TL)",
    "Çalışılan Gün (Vardiya)",
    "Planlanan Saat",
    "Gerçekleşen Saat",
    "Fazla / Eksik Mesai (Saat)",
    "Toplam Hakediş (TL)",
    "Zamanındalık Oranı (%)",
    "Görev Tamamlama (%)"
  ];

  const rows = activeList.map(st => {
    return [
      `"${st.name.replace(/"/g, '""')}"`,
      `"${(st.role || '').replace(/"/g, '""')}"`,
      `"${st.phone || ''}"`,
      `"${st.wageType === 'daily' ? 'Günlük' : 'Saatlik'}"`,
      `"${st.wageAmount}"`,
      `"${st.shiftsCount}"`,
      `"${st.plannedHours.toFixed(1)}"`,
      `"${st.workedHours.toFixed(1)}"`,
      `"${st.diffHours.toFixed(1)}"`,
      `"${Math.round(st.totalEarnings)}"`,
      `"${st.punctualityRatio}"`,
      `"${st.checklistScore !== null ? st.checklistScore : ''}"`
    ].join(';'); // Use semicolon for seamless Turkish Excel compatibility
  });

  const csvContent = "\uFEFF" + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `mirket_aylik_puantaj_bordro_${currentPayrollPeriodMonth || 'donem'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.exportPayrollSummaryToCSV = exportPayrollSummaryToCSV;

// Print Official A4 Payroll & Timesheet Form
function printPayrollReport() {
  const monthSelect = document.getElementById('payrollMonthSelect');
  const selectedLabel = monthSelect && monthSelect.selectedOptions[0] ? monthSelect.selectedOptions[0].textContent : currentPayrollPeriodMonth;

  // Set print header info
  const printTitle = document.getElementById('printReportTitle');
  const printDate = document.getElementById('printReportDate');
  if (printTitle) {
    printTitle.textContent = `Aylık Personel Puantaj & Bordro Dökümü (${selectedLabel})`;
  }
  if (printDate) {
    printDate.textContent = `Döküm Tarihi: ${new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }

  window.print();
}
window.printPayrollReport = printPayrollReport;
