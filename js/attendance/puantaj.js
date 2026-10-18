// ============================================================================
// MİRKET GÖZCÜ - AYLIK PUANTAJ CETVELİ, İZİN/DEVAMSIZLIK LOGLAMA & SGK MODÜLÜ
// ============================================================================

const PUANTAJ_CODES = {
  N: {
    code: 'N',
    label: 'Normal Çalışma',
    shortLabel: 'Normal Çalışma (Vardiya)',
    bg: '#dcfce7',
    color: '#15803d',
    border: '#86efac',
    category: 'worked',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  HT: {
    code: 'HT',
    label: 'Hafta Tatili',
    shortLabel: 'Hafta Tatili',
    bg: '#e0f2fe',
    color: '#0369a1',
    border: '#7dd3fc',
    category: 'paid_leave',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  'Yİ': {
    code: 'Yİ',
    label: 'Yıllık İzin',
    shortLabel: 'Yıllık İzin',
    bg: '#dbeafe',
    color: '#1d4ed8',
    border: '#93c5fd',
    category: 'paid_leave',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  'Eİ': {
    code: 'Eİ',
    label: 'Evlilik İzni',
    shortLabel: 'Evlilik İzni',
    bg: '#f3e8ff',
    color: '#7e22ce',
    border: '#d8b4fe',
    category: 'paid_leave',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  'Öİ': {
    code: 'Öİ',
    label: 'Ölüm İzni',
    shortLabel: 'Ölüm İzni',
    bg: '#f1f5f9',
    color: '#334155',
    border: '#cbd5e1',
    category: 'paid_leave',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  'Dİ': {
    code: 'Dİ',
    label: 'Doğum İzni',
    shortLabel: 'Doğum İzni',
    bg: '#fce7f3',
    color: '#be185d',
    border: '#f9a8d4',
    category: 'maternity',
    isPaidOperational: false,
    isSgkMissingDay: true,
    sgkReasonCode: '01 - İstirahat (Doğum)'
  },
  'ÜCİ': {
    code: 'ÜCİ',
    label: 'Ücretli İzin',
    shortLabel: 'Ücretli İzin (Ayrı Kod)',
    bg: '#ccfbf1',
    color: '#0f766e',
    border: '#5eead4',
    category: 'paid_leave',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  RT: {
    code: 'RT',
    label: 'Resmî Tatil',
    shortLabel: 'Resmî Tatil',
    bg: '#fef3c7',
    color: '#b45309',
    border: '#fcd34d',
    category: 'paid_leave',
    isPaidOperational: true,
    isSgkMissingDay: false,
    sgkReasonCode: ''
  },
  'Üİ': {
    code: 'Üİ',
    label: 'Ücretsiz İzin',
    shortLabel: 'Ücretsiz İzin',
    bg: '#ffedd5',
    color: '#c2410c',
    border: '#fdba74',
    category: 'unpaid_leave',
    isPaidOperational: false,
    isSgkMissingDay: true,
    sgkReasonCode: '21 - Diğer Ücretsiz İzin'
  },
  R: {
    code: 'R',
    label: 'Rapor (İstirahat)',
    shortLabel: 'Sağlık Raporu',
    bg: '#fef9c3',
    color: '#854d0e',
    border: '#fde047',
    category: 'report',
    isPaidOperational: false,
    isSgkMissingDay: true,
    sgkReasonCode: '01 - İstirahat (Rapor)'
  },
  DV: {
    code: 'DV',
    label: 'Devamsızlık',
    shortLabel: 'Devamsızlık (Mazeretsiz)',
    bg: '#fee2e2',
    color: '#b91c1c',
    border: '#fca5a5',
    category: 'absence',
    isPaidOperational: false,
    isSgkMissingDay: true,
    sgkReasonCode: '15 - Devamsızlık'
  }
};
window.PUANTAJ_CODES = PUANTAJ_CODES;

// In-memory state to minimize Firestore traffic
window.staffLeaves = [];
window.cachedRestaurantShifts = [];
window.currentPuantajMonth = '';
window.currentPuantajRows = [];
window.filteredLeaveLogsResult = [];

// Populate month dropdown for Puantaj Grid
function populatePuantajMonthDropdown() {
  const monthSelect = document.getElementById('puantajMonthSelect');
  if (!monthSelect) return;

  monthSelect.innerHTML = '';
  const now = new Date();
  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  for (let i = -1; i < 11; i++) {
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

  window.currentPuantajMonth = monthSelect.value;
}
window.populatePuantajMonthDropdown = populatePuantajMonthDropdown;

// Populate staff filter dropdowns across Puantaj & Leave Reports & Modal
function syncPuantajStaffDropdowns() {
  const staffList = window.staffMembers || [];

  // 1. Leave Modal Staff Select
  const modalSelect = document.getElementById('leaveStaffSelect');
  if (modalSelect) {
    const currentVal = modalSelect.value;
    modalSelect.innerHTML = '<option value="" disabled selected>Personel Seçiniz...</option>';
    staffList.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = `${st.name} (${st.role || 'Personel'})`;
      modalSelect.appendChild(opt);
    });
    if (currentVal && staffList.some(s => s.id === currentVal)) {
      modalSelect.value = currentVal;
    }
  }

  // 2. Puantaj Grid Staff Filter
  const gridStaffFilter = document.getElementById('puantajStaffFilter');
  if (gridStaffFilter) {
    const currentVal = gridStaffFilter.value || 'all';
    gridStaffFilter.innerHTML = '<option value="all">Tüm Personeller</option>';
    staffList.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = `${st.name} (${st.role || 'Personel'})`;
      gridStaffFilter.appendChild(opt);
    });
    gridStaffFilter.value = currentVal;
  }

  // 3. Leave Report Staff Filter
  const reportStaffFilter = document.getElementById('leaveReportStaffFilter');
  if (reportStaffFilter) {
    const currentVal = reportStaffFilter.value || 'all';
    reportStaffFilter.innerHTML = '<option value="all">Tüm Personeller</option>';
    staffList.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = `${st.name} (${st.role || 'Personel'})`;
      reportStaffFilter.appendChild(opt);
    });
    reportStaffFilter.value = currentVal;
  }
}
window.syncPuantajStaffDropdowns = syncPuantajStaffDropdowns;

// Load all leave/absence records for the restaurant (1 query, cached in memory)
async function loadStaffLeaves(restId) {
  const targetRestId = restId || window.restaurantId || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : null);
  if (!targetRestId) return [];

  try {
    const q = window.firebaseFirestore.query(
      window.firebaseFirestore.collection(window.db, 'staffLeaves'),
      window.firebaseFirestore.where('restaurantId', '==', targetRestId)
    );
    const snapshot = await window.firebaseFirestore.getDocs(q);
    const leaves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Sort by startDate descending
    leaves.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    window.staffLeaves = leaves;

    syncPuantajStaffDropdowns();
    initDefaultLeaveReportDates();
    await renderMonthlyPuantajGrid(targetRestId, window.currentPuantajMonth);
    renderFilteredLeaveReport();

    // Also refresh weekly calendar if rendered so leave badges appear on days
    if (typeof renderCalendar === 'function') {
      renderCalendar();
    }

    return leaves;
  } catch (error) {
    console.error('Error loading staffLeaves:', error);
    return [];
  }
}
window.loadStaffLeaves = loadStaffLeaves;

// Helper: Calculate inclusive days count between two YYYY-MM-DD strings
function calculateInclusiveDays(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const s = new Date(`${startStr}T00:00:00`);
  const e = new Date(`${endStr}T00:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 1;
  return Math.round((e - s) / 86400000) + 1;
}

// Helper: Find active leave record for a staff member on a specific YYYY-MM-DD date
function getStaffLeaveOnDate(staffId, dateStr) {
  if (!staffId || !dateStr || !Array.isArray(window.staffLeaves)) return null;
  return window.staffLeaves.find(lv =>
    lv.staffId === staffId &&
    lv.startDate <= dateStr &&
    lv.endDate >= dateStr
  ) || null;
}
window.getStaffLeaveOnDate = getStaffLeaveOnDate;

// Helper: Get all leave records for any staff on a specific YYYY-MM-DD date
function getAllLeavesOnDate(dateStr) {
  if (!dateStr || !Array.isArray(window.staffLeaves)) return [];
  return window.staffLeaves.filter(lv => lv.startDate <= dateStr && lv.endDate >= dateStr);
}
window.getAllLeavesOnDate = getAllLeavesOnDate;

// ============================================================================
// AYLIK PUANTAJ CETVELİ (1-31 GÜN MATRİSİ) & OTOMATİK VARDİYA YANSITMASI
// ============================================================================

async function renderMonthlyPuantajGrid(restId = null, targetMonth = null, forceFetchShifts = false) {
  const targetRestId = restId || window.restaurantId || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : null);
  if (!targetRestId) return;

  const monthSelect = document.getElementById('puantajMonthSelect');
  const selectedMonth = targetMonth || (monthSelect ? monthSelect.value : new Date().toISOString().slice(0, 7));
  window.currentPuantajMonth = selectedMonth;
  if (monthSelect && monthSelect.value !== selectedMonth) {
    monthSelect.value = selectedMonth;
  }

  // Keep payrollMonthSelect in sync if user wants
  const headEl = document.getElementById('monthlyPuantajTableHead');
  const bodyEl = document.getElementById('monthlyPuantajTableBody');
  if (!headEl || !bodyEl) return;

  try {
    // Fetch restaurant shifts only if not cached or forced
    if (forceFetchShifts || !window.cachedRestaurantShifts || window.cachedRestaurantShifts.length === 0) {
      const q = window.firebaseFirestore.query(
        window.firebaseFirestore.collection(window.db, 'shifts'),
        window.firebaseFirestore.where('restaurantId', '==', targetRestId)
      );
      const snap = await window.firebaseFirestore.getDocs(q);
      window.cachedRestaurantShifts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const dayShortNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

    const staffFilterEl = document.getElementById('puantajStaffFilter');
    const selectedStaffFilter = staffFilterEl ? staffFilterEl.value : 'all';

    let staffList = (window.staffMembers || []).slice();
    if (selectedStaffFilter && selectedStaffFilter !== 'all') {
      staffList = staffList.filter(s => s.id === selectedStaffFilter);
    }

    // Build table header: Staff | 3-Row Calendar Block (1..daysInMonth) | Totals (N, HT, Yİ, ÜCİ, RT, Eİ/Öİ/Dİ, Üİ, R, DV) | İşletme Top. | SGK Eksik | SGK Nedeni | SGK Prim Günü
    headEl.innerHTML = `
      <tr>
        <th class="puantaj-sticky-col">Personel</th>
        <th class="puantaj-days-block-th">
          <div>Aylık Günlük Durum Takvimi (1 – ${daysInMonth}. Günler)</div>
          <div style="font-size:10px; font-weight:500; color:#64748b; margin-top:2px;">1. Satır: 1–11 &nbsp;|&nbsp; 2. Satır: 12–22 &nbsp;|&nbsp; 3. Satır: 23–${daysInMonth} (Düzenlemek için güne tıklayın)</div>
        </th>
        <th class="puantaj-tot-th" style="background:#f0fdf4; color:#15803d;" title="Normal Çalışma (Fiili Vardiya)">N</th>
        <th class="puantaj-tot-th" style="background:#f0f9ff; color:#0369a1;" title="Hafta Tatili">HT</th>
        <th class="puantaj-tot-th" style="background:#eff6ff; color:#1d4ed8;" title="Yıllık İzin">Yİ</th>
        <th class="puantaj-tot-th" style="background:#f0fdfa; color:#0f766e;" title="Ücretli İzin (Ayrı Kod)">ÜCİ</th>
        <th class="puantaj-tot-th" style="background:#fffbeb; color:#b45309;" title="Resmî Tatil">RT</th>
        <th class="puantaj-tot-th" style="background:#faf5ff; color:#7e22ce;" title="Evlilik (Eİ), Ölüm (Öİ), Doğum (Dİ) İzinleri">Eİ/Öİ/Dİ</th>
        <th class="puantaj-tot-th" style="background:#fff7ed; color:#c2410c;" title="Ücretsiz İzin">Üİ</th>
        <th class="puantaj-tot-th" style="background:#fefce8; color:#854d0e;" title="Sağlık Raporu (İstirahat)">R</th>
        <th class="puantaj-tot-th" style="background:#fef2f2; color:#b91c1c;" title="Devamsızlık">DV</th>
        <th class="puantaj-tot-th puantaj-isletme-col" title="İşletme Puantajı Toplamı (Fiili Çalışma + Ücretli Tatil/İzin)">İşletme Top.</th>
        <th class="puantaj-tot-th puantaj-sgk-col" title="SGK Eksik Gün Sayısı (Üİ + R + DV + Dİ)">SGK Eksik</th>
        <th class="puantaj-tot-th puantaj-sgk-col" title="SGK Eksik Gün Neden Kodu">Eksik Nedeni</th>
        <th class="puantaj-tot-th puantaj-sgk-col" title="SGK'ya Bildirilecek Prim Gün Sayısı (İşletme gününe otomatik eşitlenmez, muhasebe ile doğrulanır)">SGK Prim Günü</th>
      </tr>
    `;

    if (staffList.length === 0) {
      bodyEl.innerHTML = `
        <tr>
          <td colspan="15" style="text-align:center; padding:28px; color:#94a3b8;">
            Görüntülenecek kayıtlı personel bulunamadı. "Personel Listesi" bölümünden personel ekleyebilirsiniz.
          </td>
        </tr>
      `;
      window.currentPuantajRows = [];
      updatePuantajSummaryKpis([]);
      return;
    }

    // Filter shifts for selectedMonth
    const monthShifts = (window.cachedRestaurantShifts || []).filter(s => s.date && s.date.startsWith(selectedMonth));

    const puantajRowsData = [];

    const rowsHtml = staffList.map(staff => {
      const counts = {
        N: 0, HT: 0, 'Yİ': 0, 'Eİ': 0, 'Öİ': 0, 'Dİ': 0,
        'ÜCİ': 0, RT: 0, 'Üİ': 0, R: 0, DV: 0
      };
      const dailyMap = {};
      let totalWorkedHours = 0;

      let dayBoxesHtml = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = String(d).padStart(2, '0');
        const dateStr = `${selectedMonth}-${dayStr}`;
        const dateObj = new Date(yearNum, monthNum - 1, d);
        const dow = dateObj.getDay();
        const isWeekend = (dow === 0 || dow === 6);
        const dayLabel = dayShortNames[dow];

        // 1. Check if there is an explicit leave / status record in staffLeaves
        const leaveRec = getStaffLeaveOnDate(staff.id, dateStr);

        // 2. Check if there are shifts assigned to this staff on this date
        const dayShifts = monthShifts.filter(s => s.staffId === staff.id && s.date === dateStr);

        let cellCode = '';
        let cellTooltip = `${staff.name} — ${dateStr} (${dayLabel})\nDurum: Kayıt Yok (Tıklayarak izin/durum girin)`;
        let shiftHoursOnDay = 0;

        if (dayShifts.length > 0) {
          dayShifts.forEach(sh => {
            const mins = typeof calculateActualWorkedMinutes === 'function'
              ? calculateActualWorkedMinutes(sh)
              : (typeof calculateShiftHours === 'function' ? calculateShiftHours(sh.startTime, sh.endTime) * 60 : 0);
            shiftHoursOnDay += (mins / 60);
          });
        }

        if (leaveRec && PUANTAJ_CODES[leaveRec.code]) {
          cellCode = leaveRec.code;
          counts[cellCode] = (counts[cellCode] || 0) + 1;
          const codeMeta = PUANTAJ_CODES[cellCode];
          const reasonNote = leaveRec.reason ? `\nAçıklama: ${leaveRec.reason}` : '';
          const shiftConflictNote = dayShifts.length > 0 ? `\n(Not: Aynı günde ${dayShifts.length} vardiya kaydı da mevcut)` : '';
          cellTooltip = `${staff.name} — ${dateStr} (${dayLabel})\nDurum: ${cellCode} (${codeMeta.label})${reasonNote}${shiftConflictNote}\nDüzenlemek için tıklayın`;
        } else if (dayShifts.length > 0) {
          cellCode = 'N';
          counts.N += 1;
          totalWorkedHours += shiftHoursOnDay;
          const timesStr = dayShifts.map(s => `${s.startTime || ''}-${s.endTime || ''}`).join(', ');
          cellTooltip = `${staff.name} — ${dateStr} (${dayLabel})\nDurum: N (Normal Çalışma - Vardiya)\nSaat: ${timesStr} (${shiftHoursOnDay.toFixed(1)} sa)\nİzin/Devamsızlık girmek için tıklayın`;
        }

        dailyMap[d] = {
          dateStr,
          code: cellCode,
          leaveId: leaveRec ? leaveRec.id : null,
          reason: leaveRec ? (leaveRec.reason || '') : '',
          shiftHours: shiftHoursOnDay
        };

        const codeInfo = cellCode ? PUANTAJ_CODES[cellCode] : null;
        const badgeStyle = codeInfo
          ? `background:${codeInfo.bg}; color:${codeInfo.color}; border:1px solid ${codeInfo.border};`
          : '';

        dayBoxesHtml += `
          <div class="puantaj-day-box ${isWeekend ? 'is-weekend' : ''}"
               onclick="openCellQuickPuantajModal('${staff.id}', '${dateStr}')"
               title="${cellTooltip.replace(/"/g, '&quot;')}">
            <div class="p-box-head">
              <span class="p-day-num">${d}</span>
              <span class="p-day-name">${dayLabel}</span>
            </div>
            <div class="p-box-val">
              ${codeInfo
                ? `<span class="puantaj-code-pill" style="${badgeStyle}">${cellCode}</span>`
                : `<span class="puantaj-empty-dot">·</span>`
              }
            </div>
          </div>
        `;
      }

      // Calculate Operational vs SGK Totals
      const otherPaidLeaves = counts['Eİ'] + counts['Öİ'];
      const maternityLeaves = counts['Dİ'];
      const otherCombined = otherPaidLeaves + maternityLeaves;

      // Operational (İşletme) Paid Days = N + HT + Yİ + ÜCİ + RT + Eİ + Öİ
      const operationalPaidDays = counts.N + counts.HT + counts['Yİ'] + counts['ÜCİ'] + counts.RT + otherPaidLeaves;
      // Operational Unpaid / Absent Days = Üİ + R + DV + Dİ
      const sgkMissingDaysCalculated = counts['Üİ'] + counts.R + counts.DV + maternityLeaves;

      // Determine auto-suggested SGK missing day reason code
      const activeMissingReasons = [];
      if (counts.R > 0 || maternityLeaves > 0) activeMissingReasons.push('01-İstirahat');
      if (counts.DV > 0) activeMissingReasons.push('15-Devamsızlık');
      if (counts['Üİ'] > 0) activeMissingReasons.push('21-Ücretsiz İzin');
      const suggestedSgkReason = activeMissingReasons.length > 1
        ? '12-Birden Fazla'
        : (activeMissingReasons[0] || '-');

      // Check if accountant/manager saved a custom SGK override for this staff & month
      const sgkOverridesMap = staff.sgkMonthlyOverrides || {};
      const monthOverride = sgkOverridesMap[selectedMonth] || {};

      // CRITICAL RULE: SGK Prim Günü is NOT auto-equated to operationalPaidDays!
      const savedSgkPrimDays = (monthOverride.sgkPrimDays !== undefined && monthOverride.sgkPrimDays !== '')
        ? monthOverride.sgkPrimDays
        : '';
      const savedSgkReason = monthOverride.sgkReason || suggestedSgkReason;

      puantajRowsData.push({
        staffId: staff.id,
        staffName: staff.name || 'İsimsiz Personel',
        staffRole: staff.role || 'Personel',
        staffPhone: staff.phone || '',
        counts,
        otherCombined,
        totalWorkedHours,
        operationalPaidDays,
        sgkMissingDays: sgkMissingDaysCalculated,
        sgkReason: savedSgkReason,
        sgkPrimDays: savedSgkPrimDays,
        dailyMap,
        daysInMonth
      });

      return `
        <tr>
          <td class="puantaj-sticky-col">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
              <div>
                <div style="font-weight:700; color:#0f172a; font-size:12px;">${staff.name}</div>
                <div style="font-size:10px; color:#64748b;">${staff.role || 'Personel'}</div>
              </div>
              <button type="button" class="btn ghost" style="padding:2px 6px; font-size:10px;" title="Bu personele tarih aralıklı izin/rapor/devamsızlık ekle" onclick="openLeaveModal({ staffId: '${staff.id}' })">+ İzin</button>
            </div>
          </td>
          <td class="puantaj-days-block-cell">
            <div class="puantaj-days-3row-grid">
              ${dayBoxesHtml}
            </div>
          </td>
          <td class="puantaj-tot-cell" style="font-weight:700; color:#15803d; background:#f0fdf4;">${counts.N}</td>
          <td class="puantaj-tot-cell" style="color:#0369a1;">${counts.HT}</td>
          <td class="puantaj-tot-cell" style="color:#1d4ed8;">${counts['Yİ']}</td>
          <td class="puantaj-tot-cell" style="color:#0f766e;">${counts['ÜCİ']}</td>
          <td class="puantaj-tot-cell" style="color:#b45309;">${counts.RT}</td>
          <td class="puantaj-tot-cell" style="color:#7e22ce;">${otherCombined}</td>
          <td class="puantaj-tot-cell" style="color:#c2410c; font-weight:${counts['Üİ'] > 0 ? '700' : '400'};">${counts['Üİ']}</td>
          <td class="puantaj-tot-cell" style="color:#854d0e; font-weight:${counts.R > 0 ? '700' : '400'};">${counts.R}</td>
          <td class="puantaj-tot-cell" style="color:#b91c1c; font-weight:${counts.DV > 0 ? '700' : '400'};">${counts.DV}</td>
          <td class="puantaj-tot-cell puantaj-isletme-col" style="font-weight:800; color:#0f172a; background:#f8fafc;">
            ${operationalPaidDays} Gün
            <div style="font-size:9px; color:#64748b; font-weight:500;">(Fiili: ${counts.N}g / ${totalWorkedHours.toFixed(1)}s)</div>
          </td>
          <td class="puantaj-tot-cell puantaj-sgk-col" style="font-weight:700; color:${sgkMissingDaysCalculated > 0 ? '#b91c1c' : '#64748b'}; background:#fffbeb;">
            ${sgkMissingDaysCalculated} Gün
          </td>
          <td class="puantaj-tot-cell puantaj-sgk-col" style="background:#fffbeb; font-size:11px;">
            <input type="text"
                   class="sgk-inline-input no-print"
                   style="width:98px; font-size:11px; padding:3px 5px; border:1px solid #fcd34d; border-radius:5px; background:#ffffff;"
                   value="${savedSgkReason.replace(/"/g, '&quot;')}"
                   placeholder="Eksik nedeni"
                   onchange="saveStaffSgkOverride('${staff.id}', '${selectedMonth}', null, this.value)">
            <span class="print-only-inline">${savedSgkReason}</span>
          </td>
          <td class="puantaj-tot-cell puantaj-sgk-col" style="background:#fffbeb;">
            <div class="no-print" style="display:flex; align-items:center; justify-content:center; gap:4px;">
              <input type="number"
                     min="0"
                     max="30"
                     id="sgkPrimInput_${staff.id}"
                     value="${savedSgkPrimDays}"
                     placeholder="Muhasebe"
                     title="SGK Prim Günü işletme puantajına otomatik eşitlenmez. Muhasebecinizle doğrulanan prim gününü giriniz."
                     style="width:68px; text-align:center; font-weight:700; font-size:12px; padding:4px; border:1px solid #f59e0b; border-radius:6px; background:#ffffff; color:#92400e;"
                     onchange="saveStaffSgkOverride('${staff.id}', '${selectedMonth}', this.value, null)">
            </div>
            <span class="print-only-inline" style="font-weight:800; color:#92400e;">
              ${savedSgkPrimDays !== '' ? `${savedSgkPrimDays} Gün` : 'Muhasebe Teyitli'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    bodyEl.innerHTML = rowsHtml;
    window.currentPuantajRows = puantajRowsData;
    updatePuantajSummaryKpis(puantajRowsData);

  } catch (error) {
    console.error('Error rendering monthly puantaj grid:', error);
    bodyEl.innerHTML = `<tr><td colspan="45" style="text-align:center; padding:25px; color:#ef4444;">Aylık puantaj tablosu oluşturulurken hata oluştu.</td></tr>`;
  }
}
window.renderMonthlyPuantajGrid = renderMonthlyPuantajGrid;

// Update KPI summary counters in Monthly Puantaj section
function updatePuantajSummaryKpis(rows) {
  let totalWorkedDays = 0;
  let totalPaidLeaveDays = 0;
  let totalUnpaidAndReportDays = 0;
  let totalAbsenceDays = 0;

  rows.forEach(r => {
    totalWorkedDays += (r.counts.N || 0);
    totalPaidLeaveDays += (r.counts.HT || 0) + (r.counts['Yİ'] || 0) + (r.counts['ÜCİ'] || 0) + (r.counts.RT || 0) + (r.counts['Eİ'] || 0) + (r.counts['Öİ'] || 0);
    totalUnpaidAndReportDays += (r.counts['Üİ'] || 0) + (r.counts.R || 0) + (r.counts['Dİ'] || 0);
    totalAbsenceDays += (r.counts.DV || 0);
  });

  const elWorked = document.getElementById('kpiPuantajWorkedDays');
  const elPaidLeave = document.getElementById('kpiPuantajPaidLeaveDays');
  const elUnpaidReport = document.getElementById('kpiPuantajUnpaidReportDays');
  const elAbsence = document.getElementById('kpiPuantajAbsenceDays');

  if (elWorked) elWorked.textContent = `${totalWorkedDays} Gün`;
  if (elPaidLeave) elPaidLeave.textContent = `${totalPaidLeaveDays} Gün`;
  if (elUnpaidReport) elUnpaidReport.textContent = `${totalUnpaidAndReportDays} Gün`;
  if (elAbsence) elAbsence.textContent = `${totalAbsenceDays} Gün`;
}

// Save Accountant-verified SGK Prim Days & Missing Reason per Staff & Month
async function saveStaffSgkOverride(staffId, monthStr, primDaysVal, reasonVal) {
  if (!staffId || !monthStr) return;
  const staff = (window.staffMembers || []).find(s => s.id === staffId);
  if (!staff) return;

  const existingMap = staff.sgkMonthlyOverrides ? { ...staff.sgkMonthlyOverrides } : {};
  const currentEntry = existingMap[monthStr] ? { ...existingMap[monthStr] } : {};

  if (primDaysVal !== null && primDaysVal !== undefined) {
    currentEntry.sgkPrimDays = primDaysVal === '' ? '' : Math.max(0, Math.min(30, Number(primDaysVal)));
  }
  if (reasonVal !== null && reasonVal !== undefined) {
    currentEntry.sgkReason = String(reasonVal).trim();
  }
  currentEntry.updatedAt = new Date().toISOString();
  existingMap[monthStr] = currentEntry;
  staff.sgkMonthlyOverrides = existingMap;

  // Update local row cache too
  const row = (window.currentPuantajRows || []).find(r => r.staffId === staffId);
  if (row) {
    if (primDaysVal !== null && primDaysVal !== undefined) row.sgkPrimDays = currentEntry.sgkPrimDays;
    if (reasonVal !== null && reasonVal !== undefined) row.sgkReason = currentEntry.sgkReason;
  }

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'restaurantStaff', staffId),
      { sgkMonthlyOverrides: existingMap }
    );
  } catch (err) {
    console.error('Error saving SGK override:', err);
  }
}
window.saveStaffSgkOverride = saveStaffSgkOverride;

// Optional helper for accountant: Fill 30-day rule suggestion (30 - SGK Eksik Gün) ONLY when explicitly clicked
async function applyAccountant30DayRuleSuggestion() {
  if (!window.currentPuantajRows || window.currentPuantajRows.length === 0) return;
  const confirmed = confirm(
    'Muhasebe 30 Gün Kuralı Önerisi:\n\n' +
    'Listelenen personeller için SGK Prim Günü alanı "30 - SGK Eksik Gün (Üİ + R + DV + Dİ)" formülüyle taslak olarak doldurulacaktır.\n\n' +
    'Not: İşletme puantajındaki fiili gün sayısıyla eşitlenmez; sonrasında her personelin SGK gününü muhasebecinizle doğrulayarak yine elle değiştirebilirsiniz. Onaylıyor musunuz?'
  );
  if (!confirmed) return;

  const monthStr = window.currentPuantajMonth;
  for (const row of window.currentPuantajRows) {
    const suggested = Math.max(0, 30 - (row.sgkMissingDays || 0));
    await saveStaffSgkOverride(row.staffId, monthStr, suggested, row.sgkReason);
  }
  await renderMonthlyPuantajGrid(window.restaurantId, monthStr, false);
}
window.applyAccountant30DayRuleSuggestion = applyAccountant30DayRuleSuggestion;

// Refresh monthly puantaj when shifts are created/edited/deleted in weekly calendar
async function refreshPuantajFromShifts() {
  if (!window.restaurantId) return;
  await renderMonthlyPuantajGrid(window.restaurantId, window.currentPuantajMonth, true);
}
window.refreshPuantajFromShifts = refreshPuantajFromShifts;

// ============================================================================
// İZİN VE DEVAMSIZLIK KAYIT MODALI (TEK GÜN VEYA TARİH ARALIĞI + AÇIKLAMA)
// ============================================================================

function openLeaveModal(prefill = {}) {
  syncPuantajStaffDropdowns();

  const modal = document.getElementById('leaveRecordModal');
  const form = document.getElementById('leaveRecordForm');
  const msgEl = document.getElementById('leaveModalMessage');
  const deleteBtn = document.getElementById('deleteLeaveRecordBtn');
  const titleEl = document.getElementById('leaveModalTitle');

  if (!modal || !form) return;
  form.reset();
  if (msgEl) msgEl.classList.add('hidden');

  const nowStr = new Date().toISOString().split('T')[0];

  document.getElementById('leaveRecordId').value = prefill.id || '';
  if (prefill.staffId && document.getElementById('leaveStaffSelect')) {
    document.getElementById('leaveStaffSelect').value = prefill.staffId;
  }
  document.getElementById('leaveStartDate').value = prefill.startDate || prefill.date || nowStr;
  document.getElementById('leaveEndDate').value = prefill.endDate || prefill.date || nowStr;
  document.getElementById('leaveCategoryCode').value = prefill.code || 'HT';
  document.getElementById('leaveReasonInput').value = prefill.reason || '';

  if (prefill.id) {
    if (titleEl) titleEl.textContent = '📝 İzin / Devamsızlık Kaydını Düzenle';
    if (deleteBtn) deleteBtn.classList.remove('hidden');
  } else {
    if (titleEl) titleEl.textContent = '📅 İzin / Devamsızlık / Durum Kaydet';
    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  updateLeaveModalDaysPreview();
  modal.classList.remove('hidden');
}
window.openLeaveModal = openLeaveModal;

function closeLeaveModal() {
  const modal = document.getElementById('leaveRecordModal');
  if (modal) modal.classList.add('hidden');
}
window.closeLeaveModal = closeLeaveModal;

// Clicking a cell on the 1..31 Monthly Puantaj Grid opens modal for that staff & date
function openCellQuickPuantajModal(staffId, dateStr) {
  const existing = getStaffLeaveOnDate(staffId, dateStr);
  if (existing) {
    openLeaveModal({
      id: existing.id,
      staffId: existing.staffId,
      startDate: existing.startDate,
      endDate: existing.endDate,
      code: existing.code,
      reason: existing.reason || ''
    });
  } else {
    openLeaveModal({
      staffId,
      startDate: dateStr,
      endDate: dateStr,
      code: 'HT',
      reason: ''
    });
  }
}
window.openCellQuickPuantajModal = openCellQuickPuantajModal;

function updateLeaveModalDaysPreview() {
  const startVal = document.getElementById('leaveStartDate')?.value;
  const endVal = document.getElementById('leaveEndDate')?.value;
  const codeVal = document.getElementById('leaveCategoryCode')?.value;
  const previewEl = document.getElementById('leaveModalPreviewBadge');
  if (!previewEl) return;

  if (startVal && endVal && endVal < startVal) {
    previewEl.innerHTML = `<span style="color:#ef4444; font-weight:600;">⚠️ Bitiş tarihi başlangıç tarihinden önce olamaz!</span>`;
    return;
  }

  const days = calculateInclusiveDays(startVal, endVal);
  const meta = PUANTAJ_CODES[codeVal] || PUANTAJ_CODES.HT;
  const sgkNote = meta.isSgkMissingDay
    ? `SGK Eksik Gün (${meta.sgkReasonCode})`
    : `Ücretli / Prim Gününe Dahil`;

  previewEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
      <span>Seçilen Süre: <strong>${days} Gün</strong></span>
      <span style="background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border}; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px;">
        ${meta.code} — ${meta.label} (${sgkNote})
      </span>
    </div>
  `;
}
window.updateLeaveModalDaysPreview = updateLeaveModalDaysPreview;

async function handleLeaveSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('leaveRecordId').value;
  const staffId = document.getElementById('leaveStaffSelect').value;
  const startDate = document.getElementById('leaveStartDate').value;
  const endDate = document.getElementById('leaveEndDate').value;
  const code = document.getElementById('leaveCategoryCode').value;
  const reason = document.getElementById('leaveReasonInput').value.trim();
  const msgEl = document.getElementById('leaveModalMessage');

  if (!staffId || !startDate || !endDate || !code) {
    if (msgEl) {
      msgEl.textContent = 'Lütfen personel, tarih aralığı ve durum kategorisini seçiniz.';
      msgEl.className = 'auth-message warning';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  if (endDate < startDate) {
    if (msgEl) {
      msgEl.textContent = 'Bitiş tarihi başlangıç tarihinden önce olamaz.';
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  // Require reason for DV (Devamsızlık), R (Rapor), Üİ (Ücretsiz İzin) if empty? Make it helpful but flexible
  const staff = (window.staffMembers || []).find(s => s.id === staffId);
  const daysCount = calculateInclusiveDays(startDate, endDate);
  const targetRestId = window.restaurantId || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : null);

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Kaydediliyor...';
  }

  try {
    // Check overlapping leave records for same staff (exclude current id if editing)
    const overlapping = (window.staffLeaves || []).filter(lv =>
      lv.id !== id &&
      lv.staffId === staffId &&
      lv.startDate <= endDate &&
      lv.endDate >= startDate
    );

    // If overlapping single-day or exact same range exists, update or remove old overlapping record to prevent duplicate conflicts
    if (!id && overlapping.length === 1 && overlapping[0].startDate === startDate && overlapping[0].endDate === endDate) {
      const existingId = overlapping[0].id;
      await window.firebaseFirestore.updateDoc(
        window.firebaseFirestore.doc(window.db, 'staffLeaves', existingId),
        {
          code,
          reason,
          daysCount,
          updatedAt: window.firebaseFirestore.serverTimestamp()
        }
      );
    } else {
      const payload = {
        restaurantId: targetRestId,
        staffId,
        staffName: staff ? staff.name : 'Personel',
        staffRole: staff ? (staff.role || 'Personel') : 'Personel',
        code,
        startDate,
        endDate,
        daysCount,
        reason,
        updatedAt: window.firebaseFirestore.serverTimestamp()
      };

      if (id) {
        await window.firebaseFirestore.updateDoc(
          window.firebaseFirestore.doc(window.db, 'staffLeaves', id),
          payload
        );
      } else {
        payload.createdAt = window.firebaseFirestore.serverTimestamp();
        await window.firebaseFirestore.addDoc(
          window.firebaseFirestore.collection(window.db, 'staffLeaves'),
          payload
        );
      }
    }

    closeLeaveModal();
    await loadStaffLeaves(targetRestId);
  } catch (error) {
    console.error('Error saving leave record:', error);
    if (msgEl) {
      msgEl.textContent = 'Kayıt sırasında bir hata oluştu.';
      msgEl.className = 'auth-message error';
      msgEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Kaydet';
    }
  }
}
window.handleLeaveSubmit = handleLeaveSubmit;

async function deleteLeaveRecord(leaveId = null) {
  const targetId = leaveId || document.getElementById('leaveRecordId')?.value;
  if (!targetId) return;

  if (!confirm('Bu izin/devamsızlık kaydını silmek istediğinize emin misiniz?')) return;

  try {
    await window.firebaseFirestore.deleteDoc(
      window.firebaseFirestore.doc(window.db, 'staffLeaves', targetId)
    );
    closeLeaveModal();
    await loadStaffLeaves(window.restaurantId);
  } catch (error) {
    console.error('Error deleting leave record:', error);
    alert('Kayıt silinirken bir hata oluştu.');
  }
}
window.deleteLeaveRecord = deleteLeaveRecord;

// ============================================================================
// TARİH VE ÇALIŞAN FİLTRELİ İZİN / DEVAMSIZLIK LOG RAPORU
// ============================================================================

function initDefaultLeaveReportDates() {
  const startEl = document.getElementById('leaveReportStartDate');
  const endEl = document.getElementById('leaveReportEndDate');
  if (!startEl || !endEl) return;

  if (!startEl.value || !endEl.value) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    startEl.value = fmt(firstDay);
    endEl.value = fmt(lastDay);
  }
}

function resetLeaveLogFilters() {
  const startEl = document.getElementById('leaveReportStartDate');
  const endEl = document.getElementById('leaveReportEndDate');
  const staffEl = document.getElementById('leaveReportStaffFilter');
  const codeEl = document.getElementById('leaveReportCodeFilter');

  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  if (staffEl) staffEl.value = 'all';
  if (codeEl) codeEl.value = 'all';

  initDefaultLeaveReportDates();
  renderFilteredLeaveReport();
}
window.resetLeaveLogFilters = resetLeaveLogFilters;

function renderFilteredLeaveReport() {
  const tableBody = document.getElementById('leaveReportTableBody');
  if (!tableBody) return;

  const startFilter = document.getElementById('leaveReportStartDate')?.value || '';
  const endFilter = document.getElementById('leaveReportEndDate')?.value || '';
  const staffFilter = document.getElementById('leaveReportStaffFilter')?.value || 'all';
  const codeFilter = document.getElementById('leaveReportCodeFilter')?.value || 'all';

  const allLeaves = window.staffLeaves || [];
  const staffList = window.staffMembers || [];

  const filtered = allLeaves.filter(lv => {
    if (staffFilter !== 'all' && lv.staffId !== staffFilter) return false;
    if (codeFilter !== 'all' && lv.code !== codeFilter) return false;
    if (startFilter && lv.endDate < startFilter) return false;
    if (endFilter && lv.startDate > endFilter) return false;
    return true;
  });

  window.filteredLeaveLogsResult = filtered;

  // Update summary counters for filtered view
  let totalDays = 0;
  let paidDays = 0;
  let unpaidReportDays = 0;
  let absenceDays = 0;

  filtered.forEach(lv => {
    const dCount = Number(lv.daysCount) || calculateInclusiveDays(lv.startDate, lv.endDate);
    totalDays += dCount;
    if (['HT', 'Yİ', 'Eİ', 'Öİ', 'ÜCİ', 'RT'].includes(lv.code)) paidDays += dCount;
    if (['Üİ', 'R', 'Dİ'].includes(lv.code)) unpaidReportDays += dCount;
    if (lv.code === 'DV') absenceDays += dCount;
  });

  const sumCountEl = document.getElementById('leaveFilterSumRecords');
  const sumPaidEl = document.getElementById('leaveFilterSumPaidDays');
  const sumUnpaidEl = document.getElementById('leaveFilterSumUnpaidDays');
  const sumAbsenceEl = document.getElementById('leaveFilterSumAbsenceDays');

  if (sumCountEl) sumCountEl.textContent = `${filtered.length} Kayıt (${totalDays} Gün)`;
  if (sumPaidEl) sumPaidEl.textContent = `${paidDays} Gün`;
  if (sumUnpaidEl) sumUnpaidEl.textContent = `${unpaidReportDays} Gün`;
  if (sumAbsenceEl) sumAbsenceEl.textContent = `${absenceDays} Gün`;

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:24px; color:#94a3b8;">
          Seçilen tarih aralığı ve filtre kriterlerine uygun izin veya devamsızlık kaydı bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(lv => {
    const staff = staffList.find(s => s.id === lv.staffId);
    const staffName = (staff ? staff.name : lv.staffName) || 'Personel';
    const staffRole = (staff ? staff.role : lv.staffRole) || 'Personel';
    const meta = PUANTAJ_CODES[lv.code] || { code: lv.code, label: lv.code, bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
    const dCount = Number(lv.daysCount) || calculateInclusiveDays(lv.startDate, lv.endDate);
    const dateRangeStr = lv.startDate === lv.endDate
      ? lv.startDate
      : `${lv.startDate} → ${lv.endDate}`;

    return `
      <tr>
        <td style="padding:10px;">
          <strong style="color:#0f172a;">${staffName}</strong><br>
          <span style="font-size:11px; color:#64748b;">${staffRole}</span>
        </td>
        <td style="padding:10px; font-weight:600; color:#334155;">${dateRangeStr}</td>
        <td style="padding:10px; text-align:center; font-weight:700;">${dCount} Gün</td>
        <td style="padding:10px;">
          <span style="display:inline-block; background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border}; padding:3px 8px; border-radius:6px; font-weight:700; font-size:11px;">
            ${meta.code} — ${meta.label}
          </span>
        </td>
        <td style="padding:10px; color:#334155; font-size:12px;">
          ${lv.reason ? lv.reason : '<span style="color:#94a3b8; font-style:italic;">Açıklama girilmedi</span>'}
        </td>
        <td style="padding:10px; font-size:11px; color:#64748b;">
          ${meta.isSgkMissingDay ? `<span style="color:#b91c1c; font-weight:600;">Eksik Gün (${meta.sgkReasonCode})</span>` : '<span style="color:#15803d;">Prim Gününe Dahil</span>'}
        </td>
        <td class="no-print" style="padding:10px; text-align:right; white-space:nowrap;">
          <button type="button" class="btn ghost" style="padding:4px 8px; font-size:11px;" onclick="openLeaveModal({ id: '${lv.id}', staffId: '${lv.staffId}', startDate: '${lv.startDate}', endDate: '${lv.endDate}', code: '${lv.code}', reason: '${(lv.reason || '').replace(/'/g, "\\'")}' })">Düzenle</button>
          <button type="button" class="btn ghost" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="deleteLeaveRecord('${lv.id}')">Sil</button>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderFilteredLeaveReport = renderFilteredLeaveReport;

// ============================================================================
// MUHASEBE RAPORU AKTARIMI (CSV / EXCEL VE RESMİ A4 PDF YAZDIRMA)
// ============================================================================

function exportMonthlyPuantajToCSV() {
  const rows = window.currentPuantajRows || [];
  if (rows.length === 0) {
    alert('Dışa aktarılacak aylık puantaj verisi bulunamadı.');
    return;
  }

  const daysInMonth = rows[0].daysInMonth || 30;
  const dayHeaders = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dayHeaders.push(`${d}`);
  }

  const headers = [
    'Personel Adı',
    'Görev / Rol',
    'Telefon',
    ...dayHeaders,
    'Normal Çalışma (N)',
    'Fiili Çalışılan Saat',
    'Hafta Tatili (HT)',
    'Yıllık İzin (Yİ)',
    'Ücretli İzin (ÜCİ)',
    'Resmî Tatil (RT)',
    'Evlilik İzni (Eİ)',
    'Ölüm İzni (Öİ)',
    'Doğum İzni (Dİ)',
    'Ücretsiz İzin (Üİ)',
    'Rapor (R)',
    'Devamsızlık (DV)',
    'İŞLETME PUANTAJI TOPLAM GÜN',
    'SGK EKSİK GÜN SAYISI',
    'SGK EKSİK GÜN NEDENİ',
    'SGK BİLDİRİLECEK PRİM GÜNÜ (MUHASEBE)'
  ];

  const csvRows = rows.map(r => {
    const dayCols = [];
    for (let d = 1; d <= daysInMonth; d++) {
      dayCols.push(`"${r.dailyMap[d]?.code || ''}"`);
    }

    const sgkPrimStr = r.sgkPrimDays !== '' && r.sgkPrimDays !== undefined
      ? String(r.sgkPrimDays)
      : 'Muhasebe Teyitli';

    return [
      `"${(r.staffName || '').replace(/"/g, '""')}"`,
      `"${(r.staffRole || '').replace(/"/g, '""')}"`,
      `"${r.staffPhone || ''}"`,
      ...dayCols,
      `"${r.counts.N}"`,
      `"${r.totalWorkedHours.toFixed(1)}"`,
      `"${r.counts.HT}"`,
      `"${r.counts['Yİ']}"`,
      `"${r.counts['ÜCİ']}"`,
      `"${r.counts.RT}"`,
      `"${r.counts['Eİ']}"`,
      `"${r.counts['Öİ']}"`,
      `"${r.counts['Dİ']}"`,
      `"${r.counts['Üİ']}"`,
      `"${r.counts.R}"`,
      `"${r.counts.DV}"`,
      `"${r.operationalPaidDays}"`,
      `"${r.sgkMissingDays}"`,
      `"${(r.sgkReason || '-').replace(/"/g, '""')}"`,
      `"${sgkPrimStr}"`
    ].join(';');
  });

  const footerNote = `\r\n"KRİTİK MUHASEBE NOTU: SGK'ya bildirilecek prim gün sayısı, işletmenin puantajında görünen toplam gün sayısıyla otomatik olarak eşitlenmemiştir. SGK prim günleri ve eksik gün nedenleri muhasebeci kontrolü için ayrı sütunlarda raporlanmıştır."`;

  const csvContent = '\uFEFF' + [headers.join(';'), ...csvRows].join('\r\n') + footerNote;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `mirket_muhasebe_aylik_puantaj_${window.currentPuantajMonth || 'donem'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.exportMonthlyPuantajToCSV = exportMonthlyPuantajToCSV;

function exportLeaveLogsToCSV() {
  const list = window.filteredLeaveLogsResult || [];
  if (list.length === 0) {
    alert('Dışa aktarılacak izin/devamsızlık kaydı bulunamadı.');
    return;
  }

  const headers = [
    'Personel Adı',
    'Görev / Rol',
    'Başlangıç Tarihi',
    'Bitiş Tarihi',
    'Toplam Gün',
    'Durum Kodu',
    'Kategori Açıklaması',
    'İşe Gelmeme / İzin Nedeni (Not)',
    'SGK Etkisi'
  ];

  const rows = list.map(lv => {
    const meta = PUANTAJ_CODES[lv.code] || { code: lv.code, label: lv.code };
    const sgkEffect = meta.isSgkMissingDay ? `SGK Eksik Gün (${meta.sgkReasonCode})` : 'Prim Gününe Dahil';
    return [
      `"${(lv.staffName || '').replace(/"/g, '""')}"`,
      `"${(lv.staffRole || '').replace(/"/g, '""')}"`,
      `"${lv.startDate || ''}"`,
      `"${lv.endDate || ''}"`,
      `"${lv.daysCount || 1}"`,
      `"${lv.code || ''}"`,
      `"${meta.label || ''}"`,
      `"${(lv.reason || '').replace(/"/g, '""')}"`,
      `"${sgkEffect}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `mirket_izin_devamsizlik_raporu_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.exportLeaveLogsToCSV = exportLeaveLogsToCSV;

// Print / Save as Official PDF for Accounting
function printMonthlyPuantajReport(mode = 'puantaj') {
  const monthSelect = document.getElementById('puantajMonthSelect');
  const selectedLabel = monthSelect && monthSelect.selectedOptions[0]
    ? monthSelect.selectedOptions[0].textContent
    : (window.currentPuantajMonth || '');

  const printTitle = document.getElementById('printReportTitle');
  const printDate = document.getElementById('printReportDate');

  if (printTitle) {
    if (mode === 'leaves') {
      const sDate = document.getElementById('leaveReportStartDate')?.value || '';
      const eDate = document.getElementById('leaveReportEndDate')?.value || '';
      printTitle.textContent = `Personel İzin, Rapor ve Devamsızlık Dökümü (${sDate} / ${eDate})`;
    } else {
      printTitle.textContent = `Aylık Personel Puantaj Cetveli & SGK Mutabakat Raporu (${selectedLabel})`;
    }
  }

  if (printDate) {
    printDate.textContent = `Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  window.print();
}
window.printMonthlyPuantajReport = printMonthlyPuantajReport;
