// --- SETTINGS: Restaurant settings save, shift templates & QR modal ---
function openRestaurantQrModal() {
  const modal = document.getElementById('restaurantQrModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (typeof startDynamicQrStream === 'function' && restaurantId) {
      startDynamicQrStream(restaurantId, 'qrcodeContainer');
    }
  }
}

function closeRestaurantQrModal() {
  const modal = document.getElementById('restaurantQrModal');
  if (modal) {
    modal.classList.add('hidden');
    if (typeof stopDynamicQrStream === 'function') {
      stopDynamicQrStream();
    }
  }
}

async function saveRestaurantSettings() {
  const opening = parseInt(document.getElementById('restaurantOpeningHour').value);
  const closing = parseInt(document.getElementById('restaurantClosingHour').value);
  const autoEndVal = document.getElementById('autoEndShiftToggle') ? document.getElementById('autoEndShiftToggle').checked : false;

  if (opening >= closing) {
    alert('Açılış saati kapatılış saatinden önce olmalıdır.');
    return;
  }
  
  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      {
        openingHour: opening,
        closingHour: closing,
        autoEndShiftAtScheduledTime: autoEndVal
      }
    );
    restaurantOpeningHour = opening;
    restaurantClosingHour = closing;
    autoEndShiftAtScheduledTime = autoEndVal;
    alert('İşletme ayarları kaydedildi.');
    renderCalendar();
  } catch (error) {
    console.error("Error saving restaurant settings:", error);
    alert('Ayarlar kaydedilemedi.');
  }
}

function renderCustomShiftTemplatesList() {
  const listContainer = document.getElementById('customShiftTemplatesList');
  if (!listContainer) return;
  
  if (!customShiftTemplates || customShiftTemplates.length === 0) {
    listContainer.innerHTML = '<span style="font-size: 12px; color: #94a3b8;">Henüz özel vardiya şablonu eklenmedi.</span>';
    return;
  }

  listContainer.innerHTML = customShiftTemplates.map((t, idx) => `
    <div style="display: inline-flex; align-items: center; gap: 8px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 20px; padding: 5px 12px; font-size: 13px; color: #1e293b;">
      <span style="font-weight: 600;">${t.name}</span>
      <span style="color: #64748b; font-size: 12px;">(${t.startTime} - ${t.endTime})</span>
      <button type="button" onclick="deleteCustomShiftTemplate(${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; font-weight: bold; padding: 0 2px;">&times;</button>
    </div>
  `).join('');
}

function renderShiftTemplatesUI() {
  const container = document.getElementById('shiftTemplatesContainer');
  if (!container) return;

  const defaultTemplates = [
    { name: 'Sabah', startTime: '08:00', endTime: '16:00' },
    { name: 'Akşam', startTime: '16:00', endTime: '00:00' },
    { name: 'Tam Gün', startTime: '08:00', endTime: '20:00' }
  ];

  const allTemplates = customShiftTemplates.length > 0 ? customShiftTemplates : defaultTemplates;

  container.innerHTML = allTemplates.map(t => `
    <button type="button" class="shift-template-btn" onclick="applyShiftTemplate('${t.startTime}', '${t.endTime}')">
      ${t.name} (${t.startTime}-${t.endTime})
    </button>
  `).join('');

  // If custom templates exist, also add a reset/default option if needed
  if (customShiftTemplates.length > 0) {
    container.innerHTML += `
      <button type="button" class="shift-template-btn" style="border-style: dashed; opacity: 0.8;" onclick="applyShiftTemplate('08:00', '16:00')">Sabah (08-16)</button>
      <button type="button" class="shift-template-btn" style="border-style: dashed; opacity: 0.8;" onclick="applyShiftTemplate('16:00', '00:00')">Akşam (16-00)</button>
    `;
  }
}

async function addCustomShiftTemplate() {
  const nameInput = document.getElementById('newTemplateName');
  const startInput = document.getElementById('newTemplateStart');
  const endInput = document.getElementById('newTemplateEnd');

  if (!nameInput || !startInput || !endInput) return;

  const name = nameInput.value.trim();
  const startTime = startInput.value;
  const endTime = endInput.value;

  if (!name || !startTime || !endTime) {
    alert('Lütfen şablon adı, başlangıç ve bitiş saatini eksiksiz giriniz.');
    return;
  }

  const newTemplate = { id: Date.now().toString(), name, startTime, endTime };
  customShiftTemplates.push(newTemplate);

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      { shiftTemplates: customShiftTemplates }
    );

    nameInput.value = '';
    startInput.value = '';
    endInput.value = '';

    renderCustomShiftTemplatesList();
    renderShiftTemplatesUI();
    alert('Yeni şablon eklendi.');
  } catch (error) {
    console.error("Error adding custom shift template:", error);
    alert('Şablon eklenirken hata oluştu.');
  }
}

async function deleteCustomShiftTemplate(index) {
  if (index < 0 || index >= customShiftTemplates.length) return;
  customShiftTemplates.splice(index, 1);

  try {
    await window.firebaseFirestore.updateDoc(
      window.firebaseFirestore.doc(window.db, 'users', restaurantId),
      { shiftTemplates: customShiftTemplates }
    );

    renderCustomShiftTemplatesList();
    renderShiftTemplatesUI();
  } catch (error) {
    console.error("Error deleting custom shift template:", error);
    alert('Şablon silinirken hata oluştu.');
  }
}
