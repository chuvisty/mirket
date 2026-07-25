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
      details.push(`<p><strong>İşletme Adı:</strong> ${userData.businessName || ''}</p>`);
      details.push(`<p><strong>İşletme Konumu:</strong> ${userData.businessCity || ''} / ${userData.businessDistrict || ''} / ${userData.businessNeighborhood || ''}</p>`);
      details.push(`<p><strong>Yetkili Adı / Ünvanı:</strong> ${userData.authorizedName || ''}</p>`);
      details.push(`<p><strong>Yetkili Telefon:</strong> ${userData.authorizedPhone || ''}</p>`);
    } else {
      details.push(`<p><strong>Ad Soyad:</strong> ${userData.employeeName || ''}</p>`);
      details.push(`<p><strong>Doğum Tarihi:</strong> ${userData.employeeBirthDate || ''}</p>`);
      details.push(`<p><strong>Telefon:</strong> ${userData.employeePhone || ''}</p>`);
      details.push(`<p><strong>Adres:</strong> ${userData.employeeCity || ''} / ${userData.employeeDistrict || ''} / ${userData.employeeNeighborhood || ''}</p>`);
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
      if (userData.userType !== 'restaurant' && userData.userType !== 'admin') {
        workerShiftStatus.style.display = 'block';
        if (typeof checkWorkerActiveShift === 'function') {
          checkWorkerActiveShift(user.uid);
        }
      } else {
        workerShiftStatus.style.display = 'none';
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
