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

    if (!userSnapshot.exists()) {
      accountMessage.textContent = 'Hesap bilgileri bulunamadı. Lütfen yeniden giriş yapın veya destek ile iletişime geçin.';
      return;
    }

    const userData = userSnapshot.data();
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
          <span style="font-size: 12px; color: #1e40af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">🔑 Özel Vardiyan Çalışan Kodunuz</span>
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
      if (userData.userType === 'restaurant') {
        workerShiftStatus.style.display = 'none';
      } else {
        workerShiftStatus.style.display = 'block';
        if (typeof checkWorkerActiveShift === 'function') {
          checkWorkerActiveShift(user.uid);
        }
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
