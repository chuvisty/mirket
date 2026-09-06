function showAuthMessage(message, type = 'info') {
  const messageBox = document.getElementById('authMessage');
  if (!messageBox) return;
  if (!message) {
    messageBox.textContent = '';
    messageBox.className = 'auth-message hidden';
    return;
  }
  messageBox.textContent = message;
  messageBox.className = 'auth-message ' + type;
}

function updateSignupFields() {
  const userType = window.userType || 'worker';
  const restaurantFields = document.getElementById('restaurantFields');
  const employeeFields = document.getElementById('employeeFields');
  if (!restaurantFields || !employeeFields) return;

  if (window.signupStep === 1) {
    restaurantFields.classList.add('hidden');
    restaurantFields.setAttribute('hidden', '');
    restaurantFields.style.display = 'none';
    employeeFields.classList.add('hidden');
    employeeFields.setAttribute('hidden', '');
    employeeFields.style.display = 'none';
    return;
  }

  if (userType === 'restaurant') {
    restaurantFields.classList.remove('hidden');
    restaurantFields.removeAttribute('hidden');
    restaurantFields.style.display = '';
    employeeFields.classList.add('hidden');
    employeeFields.setAttribute('hidden', '');
    employeeFields.style.display = 'none';
  } else {
    restaurantFields.classList.add('hidden');
    restaurantFields.setAttribute('hidden', '');
    restaurantFields.style.display = 'none';
    employeeFields.classList.remove('hidden');
    employeeFields.removeAttribute('hidden');
    employeeFields.style.display = '';
  }
}

function toggleAuthMode() {
  if (window.authMode === 'signup') {
    window.authMode = 'login';
    window.signupStep = 1;
    window.currentUserId = null;
  } else {
    window.authMode = 'signup';
    window.signupStep = 1;
    window.currentUserId = null;
  }
  showAuthMessage('', 'info');
  if (typeof updateAuthUI === 'function') updateAuthUI();
}

function initAuthPage() {
  const authCard = document.querySelector('.auth-card');
  if (!authCard) return;

  window.authMode = 'login';
  window.userType = 'worker';
  window.signupStep = 1;
  window.currentUserId = null;
  const toggleButton = document.getElementById('toggleAuthMode');
  const submitButton = document.getElementById('authSubmit');
  const userTypeSelect = document.getElementById('userType');
  const confirmWrapper = document.getElementById('confirmPasswordWrapper');
  const userTypeWrapper = document.getElementById('userTypeWrapper');
  const signupBackButton = document.getElementById('signupBackButton');

  confirmWrapper?.classList.add('hidden');
  confirmWrapper?.style?.setProperty('display', 'none');
  userTypeWrapper?.classList.add('hidden');
  userTypeWrapper?.setAttribute('hidden', '');
  userTypeWrapper?.style?.setProperty('display', 'none');
  signupBackButton?.classList.add('hidden');
  signupBackButton?.style?.setProperty('display', 'none');

  if (toggleButton) toggleButton.addEventListener('click', toggleAuthMode);
  if (submitButton) {
      if (typeof handleAuthSubmit === 'function') {
          submitButton.addEventListener('click', handleAuthSubmit);
      }
  }
  
  if (userTypeSelect) {
    userTypeSelect.addEventListener('change', function(event) {
      window.userType = event.target.value;
      updateSignupFields();
    });
  }
  if (signupBackButton) {
    signupBackButton.addEventListener('click', function() {
      window.signupStep = 1;
      showAuthMessage('', 'info');
      if (typeof updateAuthUI === 'function') updateAuthUI();
    });
  }

  // Event listeners for conditional inputs
  document.querySelectorAll('input[name="education"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const otherInput = document.getElementById('educationOther');
      if (this.value === 'diger') {
        otherInput.style.display = '';
      } else {
        otherInput.style.display = 'none';
      }
    });
  });

  document.querySelectorAll('input[name="jobs"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const otherInput = document.getElementById('jobsOther');
      const digerChecked = document.querySelector('input[name="jobs"][value="diger"]')?.checked;
      if (otherInput) otherInput.style.display = digerChecked ? '' : 'none';
    });
  });

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
      if (typeof logoutUser === 'function') {
          logoutButton.addEventListener('click', logoutUser);
      }
  }

  if (typeof initHourRangeSelection === 'function') initHourRangeSelection();
  if (typeof updateAuthUI === 'function') updateAuthUI();
}
function initAuthStateListener() {
  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, function(user) {
      window.authInitialized = true;
      updateAuthStateUI(user);
    });
  }
}

function initHeaderAuthLink() {
  const authHeaderLink = document.getElementById('authHeaderLink');
  if (!authHeaderLink) return;

  authHeaderLink.addEventListener('click', function(event) {
    const isLogoutLink = authHeaderLink.textContent.trim().toLowerCase() === 'çıkış yap';
    if (isLogoutLink) {
      event.preventDefault();
      logoutUser();
    }
  });
}

async function logoutUser() {
  if (!window.firebaseAuth?.signOut || !window.auth) {
    console.error('Firebase auth not ready for logout', window.firebaseAuth, window.auth);
    showAuthMessage('Çıkış yapılamadı. Lütfen sayfayı yenileyin.', 'error');
    return;
  }

  try {
    await window.firebaseAuth.signOut(window.auth);
    showAuthMessage('Başarıyla çıkış yapıldı.', 'success');
    updateAuthStateUI(null);
    if (window.location.pathname.includes('account.html')) {
      setTimeout(function() { window.location.href = 'login.html'; }, 800);
    }
  } catch (error) {
    console.error('Firebase signOut error:', error);
    showAuthMessage('Çıkış yapılırken bir hata oluştu. Lütfen tekrar deneyin.', 'error');
  }
}

async function updateAuthStateUI(user) {
  const logoutButton = document.getElementById('logoutButton');
  const authSubmit = document.getElementById('authSubmit');
  const toggleAuth = document.getElementById('toggleAuthMode');
  const authHeaderLink = document.getElementById('authHeaderLink');
  const userEmail = user?.email || null;
  
  const navPersonelBul = document.getElementById('navPersonelBul');
  const navMirketGozcu = document.getElementById('navMirketGozcu');
  const navGunlukIsBul = document.getElementById('navGunlukIsBul');

  const navCanliQr = document.getElementById('navCanliQr');

  // Reset visibility
  if (navPersonelBul) navPersonelBul.style.display = '';
  if (navMirketGozcu) navMirketGozcu.style.display = '';
  if (navCanliQr) navCanliQr.style.display = '';
  if (navGunlukIsBul) navGunlukIsBul.style.display = '';

  // Keep the signup flow visible during step 2 even if Firebase auth state reports the user as signed in.
  if (user && window.authMode === 'signup' && window.signupStep === 2 && !window.accountPageActive) {
    authSubmit?.classList.remove('hidden');
    authSubmit?.style?.setProperty('display', '');
    return;
  }

  if (user) {
    logoutButton?.classList.remove('hidden');
    authSubmit?.classList.add('hidden');
    toggleAuth?.classList.add('hidden');
    if (authHeaderLink) {
      authHeaderLink.textContent = 'Hesabım';
      authHeaderLink.href = 'account.html';
    }
    showAuthMessage('Zaten giriş yaptınız: ' + userEmail + '. Çıkış yapmak için butona tıklayın.', 'success');
    
    try {
      const userDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.userType === 'restaurant') {
          if (navGunlukIsBul) navGunlukIsBul.style.display = 'none';
        } else if (userData.userType === 'worker') {
          if (navPersonelBul) navPersonelBul.style.display = 'none';
          if (navMirketGozcu) navMirketGozcu.style.display = 'none';
          if (navCanliQr) navCanliQr.style.display = 'none';
        }
      }
    } catch(err) {
      console.error('Failed to fetch user type for nav visibility', err);
    }
    
    if (window.accountPageActive && typeof window.renderAccountPage === 'function') {
      window.renderAccountPage(user);
    }
  } else {
    if (window.accountPageActive && typeof window.renderAccountPage === 'function') {
      window.renderAccountPage(null);
    }
    logoutButton?.classList.add('hidden');
    authSubmit?.classList.remove('hidden');
    toggleAuth?.classList.remove('hidden');
    if (authHeaderLink) {
      authHeaderLink.textContent = 'Giriş Yap';
      authHeaderLink.href = 'login.html';
    }
  }
}

function getAuthErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Lütfen geçerli bir e-posta adresi girin.';
    case 'auth/wrong-password':
      return 'Yanlış şifre girdiniz. Lütfen yeniden deneyin.';
    case 'auth/user-not-found':
      return 'Hesabınız bulunamadı. Kayıt olmak için sağdaki düğmeye tıklayın.';
    case 'auth/email-already-in-use':
      return 'Bu e-posta zaten kullanılıyor. Lütfen giriş yapın.';
    case 'auth/weak-password':
      return 'Şifreniz en az 6 karakter olmalıdır.';
    default:
      return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

async function handleAuthSubmit() {
  document.querySelectorAll('.error-highlight').forEach(el => el.classList.remove('error-highlight'));

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;
  const confirmPassword = confirmPasswordInput?.value;

  if (!email || !password) {
    if (!email && emailInput) emailInput.classList.add('error-highlight');
    if (!password && passwordInput) passwordInput.classList.add('error-highlight');
    showAuthMessage('Lütfen e-posta ve şifrenizi girin.', 'warning');
    (email ? passwordInput : emailInput)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (window.authMode === 'signup') {
    const userTypeSelect = document.getElementById('userType');
    const userType = userTypeSelect?.value || 'worker';
    
    if (window.signupStep === 1) {
      if (window.currentUserId) {
        window.signupStep = 2;
        updateAuthUI();
        return;
      }

      let hasStep1Error = false;
      let firstEl = null;

      if (password !== confirmPassword) {
        if (confirmPasswordInput) confirmPasswordInput.classList.add('error-highlight');
        showAuthMessage('Şifre ve onay şifresi eşleşmiyor.', 'warning');
        if (confirmPasswordInput) confirmPasswordInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!userType) {
        if (userTypeSelect) {
          userTypeSelect.classList.add('error-highlight');
          hasStep1Error = true;
          firstEl = userTypeSelect;
        }
      }
      const termsCheckbox = document.getElementById('termsCheckbox');
      if (termsCheckbox && !termsCheckbox.checked) {
        const termsWrapper = termsCheckbox.closest('.input-group') || termsCheckbox.parentElement;
        if (termsWrapper) {
          termsWrapper.classList.add('error-highlight');
          hasStep1Error = true;
          if (!firstEl) firstEl = termsWrapper;
        }
      }

      if (hasStep1Error) {
        showAuthMessage('Lütfen kırmızı ile işaretlenmiş alanları doldurun.', 'warning');
        if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      try {
        const authResult = await window.firebaseAuth.createUserWithEmailAndPassword(window.auth, email, password);
        window.currentUserId = authResult.user.uid;
        window.signupStep = 2;
        updateAuthUI();
        showAuthMessage('Hesap oluşturuldu! Lütfen kalan bilgileri doldurun.', 'success');
      } catch (error) {
        showAuthMessage(getAuthErrorMessage(error.code), 'error');
      }
      return;
    } else {
      // Step 2: Collect additional data
      let finalUserType = window.userType || userType;
      if (email === 'admin@mirket.com') finalUserType = 'admin';

      const userData = {
        email: email.toLowerCase(),
        userType: finalUserType,
        createdAt: window.firebaseFirestore.serverTimestamp()
      };

      let hasStep2Error = false;
      let firstStep2El = null;

      const markError = (idOrName, isName = false) => {
        hasStep2Error = true;
        let el = isName ? document.querySelector(`input[name="${idOrName}"]`)?.closest('.input-group') : document.getElementById(idOrName);
        if (el) {
          el.classList.add('error-highlight');
          if (!firstStep2El) firstStep2El = el;
        }
      };

      if (finalUserType === 'restaurant' || finalUserType === 'admin') {
        const businessName = document.getElementById('businessName')?.value?.trim();
        const businessCity = document.getElementById('businessCity')?.value?.trim();
        const businessDistrict = document.getElementById('businessDistrict')?.value?.trim();
        const businessNeighborhood = document.getElementById('businessNeighborhood')?.value?.trim();
        const authorizedName = document.getElementById('authorizedName')?.value?.trim();
        const authorizedPhone = document.getElementById('authorizedPhone')?.value?.trim();

        if (!businessName) markError('businessName');
        if (!businessCity) markError('businessCity');
        if (!businessDistrict) markError('businessDistrict');
        if (!businessNeighborhood) markError('businessNeighborhood');
        if (!authorizedName) markError('authorizedName');
        if (!authorizedPhone) markError('authorizedPhone');

        if (hasStep2Error) {
          showAuthMessage('Lütfen kırmızı ile işaretli işletme bilgilerini eksiksiz doldurun.', 'warning');
          if (firstStep2El) firstStep2El.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        Object.assign(userData, {
          businessName,
          businessCity,
          businessDistrict,
          businessNeighborhood,
          authorizedName,
          authorizedPhone
        });
      } else {
        const employeeName = document.getElementById('employeeName')?.value?.trim();
        const employeeBirthDate = document.getElementById('employeeBirthDate')?.value?.trim();
        const employeePhone = document.getElementById('employeePhone')?.value?.trim();
        const employeeCity = document.getElementById('employeeCity')?.value?.trim();
        const employeeDistrict = document.getElementById('employeeDistrict')?.value?.trim();
        const employeeNeighborhood = document.getElementById('employeeNeighborhood')?.value?.trim();

        if (!employeeName) markError('employeeName');
        if (!employeeBirthDate) markError('employeeBirthDate');
        if (!employeePhone) markError('employeePhone');
        if (!employeeCity) markError('employeeCity');
        if (!employeeDistrict) markError('employeeDistrict');
        if (!employeeNeighborhood) markError('employeeNeighborhood');

        // Education
        const educationRadios = document.querySelectorAll('input[name="education"]:checked');
        let education = '';
        if (educationRadios.length > 0) {
          education = educationRadios[0].value;
          if (education === 'diger') {
            const other = document.getElementById('educationOther');
            education = other?.value?.trim();
            if (!education) markError('educationOther');
          }
        } else {
          markError('education', true);
        }

        // Jobs
        const jobCheckboxes = document.querySelectorAll('input[name="jobs"]:checked');
        const jobs = Array.from(jobCheckboxes).map(cb => cb.value);
        if (jobs.length === 0) {
          markError('jobs', true);
        } else if (jobs.includes('diger')) {
          const otherJob = document.getElementById('jobsOther')?.value?.trim();
          if (otherJob) jobs.push(otherJob);
          else markError('jobsOther');
          jobs.splice(jobs.indexOf('diger'), 1);
        }

        // Available Days
        const dayCheckboxes = document.querySelectorAll('input[name="days"]:checked');
        const availableDays = Array.from(dayCheckboxes).map(cb => cb.value);
        if (availableDays.length === 0) markError('days', true);

        // Available Hours
        const hourCheckboxes = document.querySelectorAll('input[name="hours"]:checked');
        const availableHours = Array.from(hourCheckboxes).map(cb => cb.value);
        if (availableHours.length === 0) markError('hours', true);

        // Work Types
        const workTypeCheckboxes = document.querySelectorAll('input[name="workTypes"]:checked');
        const workTypes = Array.from(workTypeCheckboxes).map(cb => cb.value);
        if (workTypes.length === 0) markError('workTypes', true);

        // WhatsApp
        const whatsappRadios = document.querySelectorAll('input[name="whatsapp"]:checked');
        let whatsapp = '';
        if (whatsappRadios.length > 0) {
          whatsapp = whatsappRadios[0].value;
        } else {
          markError('whatsapp', true);
        }

        if (hasStep2Error) {
          showAuthMessage('Lütfen kırmızı ile işaretli çalışan bilgilerini eksiksiz doldurun.', 'warning');
          if (firstStep2El) firstStep2El.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        Object.assign(userData, {
          employeeName,
          employeeBirthDate,
          employeePhone,
          employeeCity,
          employeeDistrict,
          employeeNeighborhood,
          education,
          jobs,
          availableDays,
          availableHours,
          workTypes,
          whatsapp,
          workerCode: Math.floor(100000 + Math.random() * 900000).toString()
        });
      }

      try {
        const userRef = window.firebaseFirestore.doc(window.db, 'users', window.currentUserId);
        await window.firebaseFirestore.setDoc(userRef, userData);

        // Retroactively link any existing restaurant staff entries matching worker's phone
        if (finalUserType === 'worker' && userData.employeePhone) {
          try {
            await linkExistingStaffToNewWorker(window.currentUserId, userData.employeePhone);
          } catch (linkErr) {
            console.error("Error during retroactive staff linking:", linkErr);
          }
        }

        showAuthMessage('Kayıt tamamlandı! Yönlendiriliyorsunuz...', 'success');
        let redirectUrl = 'account.html';
        if (finalUserType === 'restaurant') redirectUrl = 'gunluk-is-bul.html';
        else if (finalUserType === 'admin') redirectUrl = 'admin.html';
        else redirectUrl = 'account.html';
        setTimeout(function() { window.location.href = redirectUrl; }, 1400);
      } catch (error) {
        console.error('Firestore error:', error);
        showAuthMessage('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.', 'error');
      }
      return;
    }
  }

  try {
    await window.firebaseAuth.signInWithEmailAndPassword(window.auth, email, password);
    showAuthMessage('Başarıyla giriş yapıldı! Yönlendiriliyorsunuz...', 'success');
    let redirectUrl = 'account.html';
    try {
      if (window.firebaseAuth.currentUser) {
        const userDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', window.firebaseAuth.currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.userType === 'restaurant') redirectUrl = 'gunluk-is-bul.html';
          else if (userData.userType === 'admin') redirectUrl = 'admin.html';
          else redirectUrl = 'account.html';
        }
      }
    } catch(err) {
      console.error('Failed to fetch user type', err);
    }
    setTimeout(function() { window.location.href = redirectUrl; }, 1200);
  } catch (error) {
    const message = getAuthErrorMessage(error.code);
    showAuthMessage(message, error.code === 'auth/user-not-found' ? 'warning' : 'error');
  }
}

function updateAuthUI() {
  const isSignup = window.authMode === 'signup';
  const signupStep = window.signupStep || 1;
  const title = document.getElementById('authTitle');
  const description = document.getElementById('authDescription');
  const submitButton = document.getElementById('authSubmit');
  const confirmWrapper = document.getElementById('confirmPasswordWrapper');
  const userTypeWrapper = document.getElementById('userTypeWrapper');
  const toggleButton = document.getElementById('toggleAuthMode');
  const signupBackButton = document.getElementById('signupBackButton');

  if (!title || !description || !submitButton || !confirmWrapper || !toggleButton || !userTypeWrapper) return;

  if (isSignup) {
    title.textContent = 'Kayıt Ol';
    description.textContent = signupStep === 1 ? 'E-posta, şifre ve kayıt türünüzü seçin.' : 'Devam etmek için kalan bilgileri doldurun.';
    submitButton.textContent = signupStep === 1 ? 'Devam Et' : 'Kayıt Ol';
    submitButton.classList.remove('hidden');
    submitButton.style.display = '';
    userTypeWrapper.classList.remove('hidden');
    userTypeWrapper.removeAttribute('hidden');
    userTypeWrapper.style.display = '';

    const termsWrapper = document.getElementById('termsWrapper');

    if (signupStep === 1) {
      confirmWrapper.classList.remove('hidden');
      confirmWrapper.style.display = '';
      if (termsWrapper) {
        termsWrapper.classList.remove('hidden');
        termsWrapper.style.display = '';
      }
      if (signupBackButton) {
        signupBackButton.classList.add('hidden');
        signupBackButton.style.display = 'none';
      }
    } else {
      confirmWrapper.classList.add('hidden');
      confirmWrapper.style.display = 'none';
      if (termsWrapper) {
        termsWrapper.classList.add('hidden');
        termsWrapper.style.display = 'none';
      }
      if (signupBackButton) {
        signupBackButton.classList.remove('hidden');
        signupBackButton.style.display = '';
      }
    }

    toggleButton.textContent = 'Zaten hesabın var mı? Giriş Yap';
    updateSignupFields();
  } else {
    title.textContent = 'Giriş Yap';
    description.textContent = 'Hesabınız varsa e-posta ve şifrenizle giriş yapın.';
    submitButton.textContent = 'Giriş Yap';
    confirmWrapper.classList.add('hidden');
    confirmWrapper.style.display = 'none';
    userTypeWrapper.classList.add('hidden');
    userTypeWrapper.setAttribute('hidden', '');
    userTypeWrapper.style.display = 'none';
    const termsWrapper = document.getElementById('termsWrapper');
    if (termsWrapper) {
      termsWrapper.classList.add('hidden');
      termsWrapper.style.display = 'none';
    }
    document.getElementById('restaurantFields')?.classList.add('hidden');
    document.getElementById('employeeFields')?.classList.add('hidden');
    document.getElementById('restaurantFields')?.setAttribute('hidden', '');
    document.getElementById('employeeFields')?.setAttribute('hidden', '');
    if (signupBackButton) {
      signupBackButton.classList.add('hidden');
      signupBackButton.style.display = 'none';
    }
    toggleButton.textContent = 'Hesabın yok mu? Kayıt Ol';
  }
}

// MODAL LOGIC FOR TERMS & KVKK
function openTermsModal(url, title) {
  const modal = document.getElementById('termsModal');
  const modalBody = document.getElementById('termsModalBody');
  if (!modal || !modalBody) return;
  
  modalBody.innerHTML = '<p style="text-align:center;">Yükleniyor...</p>';
  modal.classList.remove('hidden');
  
  fetch(url)
    .then(response => response.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.querySelector('.terms-container .content');
      if (content) {
        modalBody.innerHTML = '<h2>' + title + '</h2><hr style="margin-bottom: 1rem; border:none; border-bottom: 1px solid #eee;" />' + content.innerHTML;
      } else {
        modalBody.innerHTML = '<p>İçerik yüklenemedi.</p>';
      }
    })
    .catch(err => {
      console.error(err);
      modalBody.innerHTML = '<p>Bir hata oluştu.</p>';
    });
}

function closeTermsModal() {
  const modal = document.getElementById('termsModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
  const modal = document.getElementById('termsModal');
  if (event.target === modal) {
    closeTermsModal();
  }
});

// Helper for Hour Pre-Selections
function toggleHours(type) {
  const hourCheckboxes = document.querySelectorAll('#individualHoursGroup input[name="hours"]');
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

function initHourRangeSelection() {
  const hourCheckboxes = Array.from(document.querySelectorAll('#individualHoursGroup input[name="hours"]'));
  if (!hourCheckboxes.length) return;

  hourCheckboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      // Uncheck pre-selections if manual selection is made
      const preSelections = document.querySelectorAll('input[name="hourPre"]');
      preSelections.forEach(p => p.checked = false);

      const checkedIndexes = [];
      hourCheckboxes.forEach((box, i) => {
        if (box.checked) checkedIndexes.push(i);
      });

      if (checkedIndexes.length >= 2) {
        const min = Math.min(...checkedIndexes);
        const max = Math.max(...checkedIndexes);
        for (let i = min; i <= max; i++) {
          hourCheckboxes[i].checked = true;
        }
      }
    });
  });
}

async function linkExistingStaffToNewWorker(workerUid, rawPhone) {
  const normWorkerPhone = normalizePhone(rawPhone);
  if (!normWorkerPhone) return;

  try {
    const staffRef = window.firebaseFirestore.collection(window.db, 'restaurantStaff');
    const snapshot = await window.firebaseFirestore.getDocs(staffRef);

    for (const docSnap of snapshot.docs) {
      const staffData = docSnap.data();
      const staffNormPhone = normalizePhone(staffData.phone);
      if (staffNormPhone && staffNormPhone === normWorkerPhone) {
        if (staffData.vardiyanUserId !== workerUid) {
          await window.firebaseFirestore.updateDoc(
            window.firebaseFirestore.doc(window.db, 'restaurantStaff', docSnap.id),
            { vardiyanUserId: workerUid }
          );
          console.log(`Retroactively linked staff record ${docSnap.id} to new worker ${workerUid}`);
        }
      }
    }
  } catch (error) {
    console.error("Error linking existing staff to new worker:", error);
  }
}

