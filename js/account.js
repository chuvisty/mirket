function initAccountPage() {
  const accountCard = document.querySelector('.account-card');
  if (!accountCard) return;

  window.accountPageActive = true;
  const logoutButton = document.getElementById('accountLogoutButton');
  if (logoutButton) logoutButton.addEventListener('click', logoutUser);

  const accountMessage = document.getElementById('accountMessage');
  if (accountMessage) {
    accountMessage.textContent = 'Hesabınız kontrol ediliyor...';
    accountMessage.className = 'auth-message info';
  }

  if (window.auth?.currentUser) {
    renderAccountPage(window.auth.currentUser);
  }

  if (typeof updateAuthStateUI === 'function') {
    updateAuthStateUI(window.auth?.currentUser || null);
  }
}

async function renderAccountPage(user) {
  const accountTitle = document.getElementById('accountTitle');
  const accountMessage = document.getElementById('accountMessage');
  const accountDetails = document.getElementById('accountDetails');

  if (!accountTitle || !accountDetails || !accountMessage) return;

  function setAccountMessage(message, type = 'info') {
    accountMessage.textContent = message;
    accountMessage.className = message ? 'auth-message ' + type : 'auth-message hidden';
  }

  if (!user) {
    accountTitle.textContent = 'Hesabım';
    if (!window.authInitialized) {
      setAccountMessage('Oturum kontrol ediliyor... Lütfen bekleyin.', 'info');
      accountDetails.innerHTML = '';
      return;
    }

    setAccountMessage('Lütfen giriş yapın. Hesap sayfasına yönlendiriliyorsunuz...', 'info');
    accountDetails.innerHTML = '';
    setTimeout(function() {
      window.location.href = 'login.html';
    }, 1400);
    return;
  }

  accountTitle.textContent = 'Hesabım';
  setAccountMessage('Hesabınız yükleniyor...', 'info');
  accountDetails.innerHTML = '';

  try {
    const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
    const userSnapshot = await window.firebaseFirestore.getDoc(userRef);

    let userData;
    if (!userSnapshot.exists()) {
      if (user.email === 'admin@mirket.com') {
        userData = {
          email: user.email.toLowerCase(),
          userType: 'admin',
          authorizedName: 'Sistem Yöneticisi',
          createdAt: window.firebaseFirestore.serverTimestamp()
        };
        try {
          await window.firebaseFirestore.setDoc(userRef, userData);
        } catch (e) {
          console.error("Error creating admin doc:", e);
        }
      } else {
        accountMessage.textContent = 'Hesap bilgileri bulunamadı. Lütfen yeniden giriş yapın veya destek ile iletişime geçin.';
        return;
      }
    } else {
      userData = userSnapshot.data();
    }

    const createDate = userData.createdAt && typeof userData.createdAt.toDate === 'function'
      ? userData.createdAt.toDate().toLocaleString('tr-TR')
      : '';

    const userTypeLabel = userData.userType === 'restaurant' ? 'Restoran' : userData.userType === 'admin' ? 'Yönetici (Admin)' : 'Çalışan';
    const details = [];

    details.push(`<p><strong>E-posta:</strong> ${user.email || ''}</p>`);
    details.push(`<p><strong>Kayıt Türü:</strong> ${userTypeLabel}</p>`);
    if (createDate) {
      details.push(`<p><strong>Kayıt Tarihi:</strong> ${createDate}</p>`);
    }

    if (userData.userType === 'restaurant') {
      details.push(`<p><strong>İşletme Adı:</strong> ${escapeHTML(userData.businessName)}</p>`);
      details.push(`<p><strong>İşletme Konumu:</strong> ${escapeHTML(userData.businessCity)} / ${escapeHTML(userData.businessDistrict)} / ${escapeHTML(userData.businessNeighborhood)}</p>`);
      details.push(`<p><strong>Yetkili Adı / Ünvanı:</strong> ${escapeHTML(userData.authorizedName)}</p>`);
      details.push(`<p><strong>Yetkili Telefon:</strong> ${escapeHTML(userData.authorizedPhone)}</p>`);
    } else if (userData.userType === 'admin') {
      details.push(`<p><strong>Yönetici Adı:</strong> ${escapeHTML(userData.authorizedName || userData.employeeName || 'Sistem Yöneticisi')}</p>`);
      if (userData.authorizedPhone || userData.employeePhone) {
        details.push(`<p><strong>Telefon:</strong> ${escapeHTML(userData.authorizedPhone || userData.employeePhone)}</p>`);
      }
      details.push(`
        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: center;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #1e40af; font-size: 15px;">👑 Yönetici Yetkileri Aktif</p>
          <p style="margin: 0; font-size: 13px; color: #3b82f6;">İlanları, restoranları ve personelleri yönetmek için Yönetici Panelini kullanabilirsiniz.</p>
        </div>
      `);
    } else {
      let workerCode = userData.workerCode;
      if (!workerCode) {
        workerCode = Math.floor(100000 + Math.random() * 900000).toString();
        try {
          await window.firebaseFirestore.updateDoc(userRef, { workerCode });
        } catch (codeErr) {
          console.error("Error updating workerCode:", codeErr);
        }
      }

      const codeBanner = `
        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 2px dashed #3b82f6; border-radius: 14px; padding: 18px; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 15px rgba(59,130,246,0.08);">
          <span style="font-size: 12px; color: #1e40af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">🔑 Özel Mirket Çalışan Kodunuz</span>
          <h2 style="margin: 6px 0 2px 0; color: #1e3a8a; font-size: 32px; letter-spacing: 4px; font-family: monospace; font-weight: 700;">VK-${workerCode}</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #3b82f6;">Restoran yöneticinize bu 6 haneli kodu (<strong>${workerCode}</strong>) vererek sizi tek tıkla kadroya eklemesini sağlayabilirsiniz.</p>
        </div>
      `;
      details.push(codeBanner);

      details.push(`<p><strong>Ad Soyad:</strong> ${escapeHTML(userData.employeeName)}</p>`);
      details.push(`<p><strong>Doğum Tarihi:</strong> ${escapeHTML(userData.employeeBirthDate)}</p>`);
      details.push(`<p><strong>Telefon:</strong> ${escapeHTML(userData.employeePhone)}</p>`);
      details.push(`<p><strong>Adres:</strong> ${escapeHTML(userData.employeeCity)} / ${escapeHTML(userData.employeeDistrict)} / ${escapeHTML(userData.employeeNeighborhood)}</p>`);
      details.push(`<p><strong>Eğitim Durumu:</strong> ${humanizeValue(userData.education) || ''}</p>`);
      details.push(`<p><strong>Yapabileceği İşler:</strong> ${formatList(userData.jobs)}</p>`);
      details.push(`<p><strong>Uygun Günler:</strong> ${formatList(userData.availableDays)}</p>`);
      details.push(`<p><strong>Çalışma Şekli:</strong> ${formatList(userData.workTypes)}</p>`);
      details.push(`<p><strong>WhatsApp İzni:</strong> ${userData.whatsapp === 'yes' ? 'Evet' : userData.whatsapp === 'no' ? 'Hayır' : ''}</p>`);
    }

    accountDetails.innerHTML = details.join('');
    setAccountMessage('', 'info');

    // Worker shift status banner & active shift check
    const workerShiftStatus = document.getElementById('workerShiftStatus');
    if (workerShiftStatus) {
      if (userData.userType === 'restaurant' || userData.userType === 'admin') {
        workerShiftStatus.style.display = 'none';
      } else {
        workerShiftStatus.style.display = 'block';
        if (typeof checkWorkerActiveShift === 'function') {
          checkWorkerActiveShift(user.uid);
        }
      }
    }

    // Worker preferences form toggle & populate
    const workerPrefCard = document.getElementById('workerPreferencesCard');
    if (workerPrefCard) {
      if (userData.userType === 'worker') {
        workerPrefCard.classList.remove('hidden');
        workerPrefCard.style.display = 'block';
        loadWorkerPreferencesToForm(userData);
      } else {
        workerPrefCard.classList.add('hidden');
        workerPrefCard.style.display = 'none';
      }
    }

    // Show Admin Panel button if admin
    const adminBtn = document.getElementById('adminPanelButton');
    if (adminBtn) {
      if (userData.userType === 'admin') {
        adminBtn.classList.remove('hidden');
        adminBtn.style.display = '';
      } else {
        adminBtn.classList.add('hidden');
        adminBtn.style.display = 'none';
      }
    }

  } catch (error) {
    console.error('Hesap bilgileri yükleme hatası:', error);
    setAccountMessage('Hesap bilgileri yüklenirken bir hata oluştu.', 'error');
  }
}

function loadWorkerPreferencesToForm(userData) {
  // Jobs
  const currentJobs = Array.isArray(userData.jobs) ? userData.jobs : [];
  const knownJobs = ['garson', 'sef-garson', 'komi', 'barista', 'bulasikci', 'host', 'asci'];
  let otherJobVal = '';

  document.querySelectorAll('input[name="prefJobs"]').forEach(cb => {
    if (cb.value === 'diger') {
      const customJob = currentJobs.find(j => !knownJobs.includes(j));
      if (customJob) {
        cb.checked = true;
        otherJobVal = customJob;
      } else {
        cb.checked = false;
      }
    } else {
      cb.checked = currentJobs.includes(cb.value);
    }
  });
  const otherInput = document.getElementById('prefJobsOther');
  if (otherInput) {
    otherInput.value = otherJobVal;
    otherInput.style.display = otherJobVal ? '' : 'none';
  }

  // Days
  const currentDays = Array.isArray(userData.availableDays) ? userData.availableDays : [];
  document.querySelectorAll('input[name="prefDays"]').forEach(cb => {
    cb.checked = currentDays.includes(cb.value);
  });

  // Hours
  const currentHours = Array.isArray(userData.availableHours) ? userData.availableHours : [];
  document.querySelectorAll('#accountHoursGroup input[name="prefHours"]').forEach(cb => {
    cb.checked = currentHours.includes(cb.value);
  });

  // Work Types
  const currentWorkTypes = Array.isArray(userData.workTypes) ? userData.workTypes : [];
  document.querySelectorAll('input[name="prefWorkTypes"]').forEach(cb => {
    cb.checked = currentWorkTypes.includes(cb.value);
  });

  // Education
  const knownEdu = ['lise-ogrencisi', 'lise-mezunu', 'universite-ogrencisi', 'universite-mezunu'];
  const userEdu = userData.education || '';
  const eduOtherInput = document.getElementById('prefEducationOther');
  if (knownEdu.includes(userEdu)) {
    const radio = document.querySelector(`input[name="prefEducation"][value="${userEdu}"]`);
    if (radio) radio.checked = true;
    if (eduOtherInput) eduOtherInput.style.display = 'none';
  } else if (userEdu) {
    const digerRadio = document.getElementById('prefEducationDigerRadio');
    if (digerRadio) digerRadio.checked = true;
    if (eduOtherInput) {
      eduOtherInput.value = userEdu;
      eduOtherInput.style.display = '';
    }
  }

  // WhatsApp
  const whatsappVal = userData.whatsapp === 'no' ? 'no' : 'yes';
  const waRadio = document.querySelector(`input[name="prefWhatsapp"][value="${whatsappVal}"]`);
  if (waRadio) waRadio.checked = true;
}

function toggleAccountHours(type) {
  const hourCheckboxes = document.querySelectorAll('#accountHoursGroup input[name="prefHours"]');
  let range = [];
  if (type === 'tum-gun') {
    range = Array.from(hourCheckboxes).map(cb => cb.value);
  } else if (type === 'sabah') {
    range = ['06-07', '07-08', '08-09', '09-10', '10-11', '11-12'];
  } else if (type === 'oglen') {
    range = ['10-11', '11-12', '12-13', '13-14', '14-15', '15-16'];
  } else if (type === 'aksam') {
    range = ['16-17', '17-18', '18-19', '19-20', '20-21', '21-22', '22-23', '23-00'];
  }
  
  hourCheckboxes.forEach(cb => {
    cb.checked = range.includes(cb.value);
  });
}
window.toggleAccountHours = toggleAccountHours;

async function saveWorkerPreferences() {
  const user = window.auth?.currentUser;
  if (!user) {
    alert('Oturum açık değil. Lütfen giriş yapın.');
    return;
  }

  const msgBox = document.getElementById('workerPrefMessage');
  const saveBtn = document.getElementById('savePreferencesButton');
  if (saveBtn) saveBtn.disabled = true;

  try {
    // Jobs
    const jobCheckboxes = document.querySelectorAll('input[name="prefJobs"]:checked');
    const jobs = Array.from(jobCheckboxes).map(cb => cb.value);
    if (jobs.includes('diger')) {
      const otherVal = document.getElementById('prefJobsOther')?.value?.trim();
      jobs.splice(jobs.indexOf('diger'), 1);
      if (otherVal) jobs.push(otherVal);
    }

    // Days
    const dayCheckboxes = document.querySelectorAll('input[name="prefDays"]:checked');
    const availableDays = Array.from(dayCheckboxes).map(cb => cb.value);

    // Hours
    const hourCheckboxes = document.querySelectorAll('#accountHoursGroup input[name="prefHours"]:checked');
    const availableHours = Array.from(hourCheckboxes).map(cb => cb.value);

    // Work Types
    const workTypeCheckboxes = document.querySelectorAll('input[name="prefWorkTypes"]:checked');
    const workTypes = Array.from(workTypeCheckboxes).map(cb => cb.value);

    // Education
    const eduRadio = document.querySelector('input[name="prefEducation"]:checked');
    let education = eduRadio ? eduRadio.value : '';
    if (education === 'diger') {
      education = document.getElementById('prefEducationOther')?.value?.trim() || 'diger';
    }

    // WhatsApp
    const waRadio = document.querySelector('input[name="prefWhatsapp"]:checked');
    const whatsapp = waRadio ? waRadio.value : 'yes';

    const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
    await window.firebaseFirestore.updateDoc(userRef, {
      jobs,
      availableDays,
      availableHours,
      workTypes,
      education,
      whatsapp,
      updatedAt: window.firebaseFirestore.serverTimestamp()
    });

    if (msgBox) {
      msgBox.textContent = '✅ Çalışma tercihleriniz ve müsaitlik bilgileriniz başarıyla kaydedildi!';
      msgBox.className = 'auth-message success';
      msgBox.classList.remove('hidden');
      setTimeout(() => {
        msgBox.className = 'auth-message hidden';
      }, 4000);
    }

    // Re-render account details summary
    await renderAccountPage(user);

  } catch (err) {
    console.error('Error saving worker preferences:', err);
    if (msgBox) {
      msgBox.textContent = 'Tercihler kaydedilirken bir hata oluştu: ' + (err.message || 'Bilinmeyen hata');
      msgBox.className = 'auth-message error';
      msgBox.classList.remove('hidden');
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}
window.saveWorkerPreferences = saveWorkerPreferences;

