// --- SLOT TEMPLATES: Manage and apply slot blueprints (Yaz Hafta Sonu, Kış Hafta İçi, etc.) ---
// Uses Firestore batch writes for optimal performance.

let slotBlueprints = [];
let currentEditingBlueprint = null;

// Day mapping (0 = Pazartesi, ..., 6 = Pazar)
const DAY_OPTIONS = [
  { index: 0, name: "Pazartesi" },
  { index: 1, name: "Salı" },
  { index: 2, name: "Çarşamba" },
  { index: 3, name: "Perşembe" },
  { index: 4, name: "Cuma" },
  { index: 5, name: "Cumartesi" },
  { index: 6, name: "Pazar" }
];

async function loadSlotBlueprints() {
  if (!restaurantId && window.restaurantId) {
    restaurantId = window.restaurantId;
  }
  if (!restaurantId) return;

  try {
    const userDoc = await window.firebaseFirestore.getDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId)
    );
    if (userDoc.exists()) {
      const data = userDoc.data();
      slotBlueprints = Array.isArray(data.slotBlueprints) ? data.slotBlueprints : [];
      window.slotBlueprints = slotBlueprints;
      renderSlotBlueprintDropdown();
      renderBlueprintList();
    }
  } catch (error) {
    console.error("Error loading slot blueprints:", error);
  }
}

function renderSlotBlueprintDropdown() {
  const select = document.getElementById('slotTemplateSelect');
  if (!select) return;

  select.innerHTML = '<option value="">⚡ Vardiya Şablonu Uygula ▾</option>';

  if (slotBlueprints.length > 0) {
    slotBlueprints.forEach(bp => {
      const totalSlots = (bp.slots || []).reduce((sum, s) => sum + (parseInt(s.count) || 1), 0);
      const opt = document.createElement('option');
      opt.value = bp.id;
      opt.textContent = `📋 ${bp.name} (${totalSlots} Slot)`;
      select.appendChild(opt);
    });
  }

  const manageOpt = document.createElement('option');
  manageOpt.value = '__manage__';
  manageOpt.textContent = '⚙️ Şablonları Yönet / Yeni Oluştur...';
  select.appendChild(manageOpt);
}

async function handleSlotTemplateSelectChange(value) {
  const select = document.getElementById('slotTemplateSelect');
  if (!value) return;

  if (value === '__manage__') {
    if (select) select.value = '';
    openSlotBlueprintModal();
    return;
  }

  const bp = slotBlueprints.find(b => b.id === value);
  if (!bp) return;

  const weekLabelEl = document.getElementById('currentWeekLabel');
  const weekLabel = weekLabelEl ? weekLabelEl.textContent : 'seçili hafta';
  const totalSlots = (bp.slots || []).reduce((sum, s) => sum + (parseInt(s.count) || 1), 0);

  const confirmMsg = `"${bp.name}" şablonundaki toplam ${totalSlots} adet boş slot, ${weekLabel} takvimine eklenecektir.\n\nDevam etmek istiyor musunuz?`;
  if (!confirm(confirmMsg)) {
    if (select) select.value = '';
    return;
  }

  try {
    await applyBlueprintToWeek(bp, currentWeekStart);
    alert(`"${bp.name}" şablonu başarıyla uygulandı.`);
  } catch (error) {
    console.error("Error applying blueprint:", error);
    alert("Şablon uygulanırken bir hata oluştu.");
  } finally {
    if (select) select.value = '';
  }
}

async function applyBlueprintToWeek(blueprint, targetWeekStart) {
  if (!blueprint || !blueprint.slots || blueprint.slots.length === 0) {
    alert("Bu şablonda tanımlı slot bulunmuyor.");
    return;
  }

  const batch = window.firebaseFirestore.writeBatch(window.db);
  const shiftsColRef = window.firebaseFirestore.collection(window.db, 'shifts');

  blueprint.slots.forEach(slotDef => {
    const dayOffset = parseInt(slotDef.dayIndex, 10);
    if (isNaN(dayOffset) || dayOffset < 0 || dayOffset > 6) return;

    const slotDate = new Date(targetWeekStart);
    slotDate.setDate(slotDate.getDate() + dayOffset);
    const dateStr = formatDateForDB(slotDate);

    const count = Math.max(1, parseInt(slotDef.count, 10) || 1);
    for (let c = 0; c < count; c++) {
      const newDocRef = window.firebaseFirestore.doc(shiftsColRef);
      batch.set(newDocRef, {
        restaurantId,
        date: dateStr,
        startTime: slotDef.startTime,
        endTime: slotDef.endTime,
        role: slotDef.role || '',
        staffId: null,
        notes: slotDef.notes || '',
        checklist: [],
        isSlot: true,
        createdAt: new Date()
      });
    }
  });

  await batch.commit();
  await loadShiftsForCurrentWeek();
}

// --- BLUEPRINT MANAGER MODAL FUNCTIONS ---

function openSlotBlueprintModal() {
  const modal = document.getElementById('slotBlueprintModal');
  if (!modal) return;
  renderBlueprintList();
  showBlueprintListView();
  modal.classList.remove('hidden');
}

function closeSlotBlueprintModal() {
  const modal = document.getElementById('slotBlueprintModal');
  if (modal) modal.classList.add('hidden');
  currentEditingBlueprint = null;
}

function showBlueprintListView() {
  const listSec = document.getElementById('blueprintListView');
  const formSec = document.getElementById('blueprintFormView');
  if (listSec) listSec.classList.remove('hidden');
  if (formSec) formSec.classList.add('hidden');
}

function showBlueprintFormView(isEditing = false) {
  const listSec = document.getElementById('blueprintListView');
  const formSec = document.getElementById('blueprintFormView');
  const title = document.getElementById('blueprintFormTitle');
  if (listSec) listSec.classList.add('hidden');
  if (formSec) formSec.classList.remove('hidden');
  if (title) title.textContent = isEditing ? 'Şablonu Düzenle' : 'Yeni Slot Şablonu Oluştur';
}

function renderBlueprintList() {
  const container = document.getElementById('blueprintListContainer');
  if (!container) return;

  if (!slotBlueprints || slotBlueprints.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #94a3b8;">
        <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
        <p style="margin: 0; font-size: 14px;">Henüz kayıtlı bir slot şablonu bulunmuyor.</p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #cbd5e1;">(Örn: Yaz Hafta Sonu, Kış Hafta İçi, Özel Gün)</p>
      </div>
    `;
    return;
  }

  container.innerHTML = slotBlueprints.map(bp => {
    const totalSlots = (bp.slots || []).reduce((sum, s) => sum + (parseInt(s.count) || 1), 0);
    const dayCounts = {};
    (bp.slots || []).forEach(s => {
      const dayName = DAY_OPTIONS[s.dayIndex]?.name || `Gün ${s.dayIndex + 1}`;
      dayCounts[dayName] = (dayCounts[dayName] || 0) + (parseInt(s.count) || 1);
    });
    const summaryStr = Object.entries(dayCounts).map(([d, c]) => `${d}: ${c}`).join(' | ') || 'Boş';

    return `
      <div class="blueprint-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 700; color: #0f172a; font-size: 14px; display: flex; align-items: center; gap: 8px;">
            <span>📋 ${bp.name}</span>
            <span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-weight: 600;">${totalSlots} Slot</span>
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${summaryStr}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn ghost" style="padding: 6px 12px; font-size: 12px;" onclick="editBlueprint('${bp.id}')">Düzenle</button>
          <button type="button" class="btn ghost" style="padding: 6px 12px; font-size: 12px; color: #ef4444;" onclick="deleteSlotBlueprint('${bp.id}')">Sil</button>
        </div>
      </div>
    `;
  }).join('');
}

function openCreateBlueprintForm() {
  currentEditingBlueprint = null;
  document.getElementById('blueprintName').value = '';
  document.getElementById('blueprintDescription').value = '';
  const rowsContainer = document.getElementById('blueprintSlotsRows');
  if (rowsContainer) rowsContainer.innerHTML = '';
  
  // Add 1 default row
  addSlotRowToBlueprintForm();
  showBlueprintFormView(false);
}

function editBlueprint(id) {
  const bp = slotBlueprints.find(b => b.id === id);
  if (!bp) return;

  currentEditingBlueprint = bp;
  document.getElementById('blueprintName').value = bp.name || '';
  document.getElementById('blueprintDescription').value = bp.description || '';
  
  const rowsContainer = document.getElementById('blueprintSlotsRows');
  if (rowsContainer) {
    rowsContainer.innerHTML = '';
    if (bp.slots && bp.slots.length > 0) {
      bp.slots.forEach(slot => addSlotRowToBlueprintForm(slot));
    } else {
      addSlotRowToBlueprintForm();
    }
  }

  showBlueprintFormView(true);
}

function addSlotRowToBlueprintForm(data = null) {
  const rowsContainer = document.getElementById('blueprintSlotsRows');
  if (!rowsContainer) return;

  const rowId = 'bp_row_' + Math.random().toString(36).substring(2, 9);
  const rowDiv = document.createElement('div');
  rowDiv.id = rowId;
  rowDiv.className = 'blueprint-slot-row';
  rowDiv.style.cssText = 'display: grid; grid-template-columns: 130px 110px 90px 90px 70px 36px; gap: 8px; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 8px;';

  const dayOptionsHtml = DAY_OPTIONS.map(d => 
    `<option value="${d.index}" ${data && parseInt(data.dayIndex, 10) === d.index ? 'selected' : ''}>${d.name}</option>`
  ).join('');

  const roles = ["Garson", "Komi", "Şef Garson", "Aşçı", "Mutfak", "Kasa / Karşılama", "Bulaşıkçı", "Barista", "Host / Hostes", "Diğer"];
  const roleOptionsHtml = roles.map(r => 
    `<option value="${r}" ${data && data.role === r ? 'selected' : ''}>${r}</option>`
  ).join('');

  rowDiv.innerHTML = `
    <div>
      <select class="bp-day-select" style="width: 100%; padding: 6px; font-size: 12px; border-radius: 6px; border: 1px solid #cbd5e1;">
        ${dayOptionsHtml}
      </select>
    </div>
    <div>
      <select class="bp-role-select" style="width: 100%; padding: 6px; font-size: 12px; border-radius: 6px; border: 1px solid #cbd5e1;">
        ${roleOptionsHtml}
      </select>
    </div>
    <div>
      <input type="time" class="bp-start-time" value="${data ? data.startTime : '09:00'}" style="width: 100%; padding: 6px; font-size: 12px; border-radius: 6px; border: 1px solid #cbd5e1;">
    </div>
    <div>
      <input type="time" class="bp-end-time" value="${data ? data.endTime : '17:00'}" style="width: 100%; padding: 6px; font-size: 12px; border-radius: 6px; border: 1px solid #cbd5e1;">
    </div>
    <div>
      <input type="number" class="bp-count" min="1" max="50" value="${data ? (data.count || 1) : 1}" title="Slot Sayısı" style="width: 100%; padding: 6px; font-size: 12px; border-radius: 6px; border: 1px solid #cbd5e1; text-align: center;">
    </div>
    <div>
      <button type="button" onclick="document.getElementById('${rowId}').remove()" style="width: 100%; height: 32px; background: none; border: none; color: #ef4444; font-size: 18px; font-weight: bold; cursor: pointer;" title="Satırı Sil">&times;</button>
    </div>
  `;

  rowsContainer.appendChild(rowDiv);
}

// Bulk day row generator helper (e.g. Add row for all weekdays, or all weekends)
function addBulkSlotsToBlueprint(dayType) {
  let dayIndices = [];
  if (dayType === 'weekdays') dayIndices = [0, 1, 2, 3, 4];
  else if (dayType === 'weekend') dayIndices = [5, 6];
  else dayIndices = [0, 1, 2, 3, 4, 5, 6];

  dayIndices.forEach(idx => {
    addSlotRowToBlueprintForm({
      dayIndex: idx,
      role: 'Garson',
      startTime: '10:00',
      endTime: '18:00',
      count: 1
    });
  });
}

async function saveBlueprintFromForm() {
  const nameInput = document.getElementById('blueprintName');
  const descInput = document.getElementById('blueprintDescription');
  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';

  if (!name) {
    alert("Lütfen şablon adını giriniz (Örn: Yaz Hafta Sonu).");
    return;
  }

  const rows = document.querySelectorAll('.blueprint-slot-row');
  if (rows.length === 0) {
    alert("Lütfen en az bir slot kuralı ekleyiniz.");
    return;
  }

  const slots = [];
  rows.forEach(r => {
    const dayIndex = parseInt(r.querySelector('.bp-day-select').value, 10);
    const role = r.querySelector('.bp-role-select').value;
    const startTime = r.querySelector('.bp-start-time').value;
    const endTime = r.querySelector('.bp-end-time').value;
    const count = Math.max(1, parseInt(r.querySelector('.bp-count').value, 10) || 1);

    if (startTime && endTime) {
      slots.push({ dayIndex, role, startTime, endTime, count });
    }
  });

  if (slots.length === 0) {
    alert("Geçerli saat aralıklarına sahip slot bulunamadı.");
    return;
  }

  const bpId = currentEditingBlueprint ? currentEditingBlueprint.id : 'bp_' + Date.now();
  const newBlueprint = {
    id: bpId,
    name,
    description,
    slots,
    updatedAt: new Date().toISOString()
  };

  if (currentEditingBlueprint) {
    const idx = slotBlueprints.findIndex(b => b.id === bpId);
    if (idx !== -1) slotBlueprints[idx] = newBlueprint;
    else slotBlueprints.push(newBlueprint);
  } else {
    slotBlueprints.push(newBlueprint);
  }

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      { slotBlueprints }
    );
    renderSlotBlueprintDropdown();
    renderBlueprintList();
    showBlueprintListView();
    alert("Şablon başarıyla kaydedildi.");
  } catch (error) {
    console.error("Error saving blueprint:", error);
    alert("Şablon kaydedilirken bir hata oluştu.");
  }
}

async function deleteSlotBlueprint(id) {
  if (!confirm("Bu slot şablonunu silmek istediğinize emin misiniz?")) return;

  slotBlueprints = slotBlueprints.filter(b => b.id !== id);
  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      { slotBlueprints }
    );
    renderSlotBlueprintDropdown();
    renderBlueprintList();
  } catch (error) {
    console.error("Error deleting blueprint:", error);
    alert("Şablon silinirken bir hata oluştu.");
  }
}

// Window attachments for HTML inline onclick
window.loadSlotBlueprints = loadSlotBlueprints;
window.renderSlotBlueprintDropdown = renderSlotBlueprintDropdown;
window.handleSlotTemplateSelectChange = handleSlotTemplateSelectChange;
window.openSlotBlueprintModal = openSlotBlueprintModal;
window.closeSlotBlueprintModal = closeSlotBlueprintModal;
window.openCreateBlueprintForm = openCreateBlueprintForm;
window.showBlueprintListView = showBlueprintListView;
window.addSlotRowToBlueprintForm = addSlotRowToBlueprintForm;
window.addBulkSlotsToBlueprint = addBulkSlotsToBlueprint;
window.saveBlueprintFromForm = saveBlueprintFromForm;
window.editBlueprint = editBlueprint;
window.deleteSlotBlueprint = deleteSlotBlueprint;
