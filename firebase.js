const firebaseConfig = {
  apiKey: "AIzaSyCtJy0JBOPkSw-w7f4Y-5j98hrqENkAj00",
  authDomain: "mirket-team.firebaseapp.com",
  projectId: "mirket-team",
  storageBucket: "mirket-team.firebasestorage.app",
  messagingSenderId: "749350560942",
  appId: "1:749350560942:web:9e1a9a4c187e03367eb93f",
  measurementId: "G-WJT4JXJS23"
};

async function initFirebase() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js");
  const { getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, orderBy } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js");

  const app = initializeApp(firebaseConfig);
  window.auth = getAuth(app);
  window.db = getFirestore(app);
  window.firebaseAuth = {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
  };
  window.firebaseFirestore = {
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc,
    orderBy
  };
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

function updateAuthStateUI(user) {
  const logoutButton = document.getElementById('logoutButton');
  const authSubmit = document.getElementById('authSubmit');
  const toggleAuth = document.getElementById('toggleAuthMode');
  const authHeaderLink = document.getElementById('authHeaderLink');
  const userEmail = user?.email || null;

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
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;
  const confirmPassword = confirmPasswordInput?.value;

  if (!email || !password) {
    showAuthMessage('Lütfen e-posta ve şifrenizi girin.', 'warning');
    return;
  }

  if (window.authMode === 'signup') {
    const userType = document.getElementById('userType')?.value || 'worker';
    if (window.signupStep === 1) {
      if (window.currentUserId) {
        // Account already created, proceed to step 2
        window.signupStep = 2;
        updateAuthUI();
        return;
      }

      if (password !== confirmPassword) {
        showAuthMessage('Şifre ve onay şifresi eşleşmiyor.', 'warning');
        return;
      }
      if (!userType) {
        showAuthMessage('Lütfen kayıt türünü seçin.', 'warning');
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

      if (finalUserType === 'restaurant' || finalUserType === 'admin') {
        const businessName = document.getElementById('businessName')?.value?.trim();
        const businessCity = document.getElementById('businessCity')?.value?.trim();
        const businessDistrict = document.getElementById('businessDistrict')?.value?.trim();
        const businessNeighborhood = document.getElementById('businessNeighborhood')?.value?.trim();
        const authorizedName = document.getElementById('authorizedName')?.value?.trim();
        const authorizedPhone = document.getElementById('authorizedPhone')?.value?.trim();

        if (!businessName || !businessCity || !businessDistrict || !businessNeighborhood || !authorizedName || !authorizedPhone) {
          showAuthMessage('Lütfen işletme bilgilerini eksiksiz doldurun.', 'warning');
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

        // Education
        const educationRadios = document.querySelectorAll('input[name="education"]:checked');
        let education = '';
        if (educationRadios.length > 0) {
          education = educationRadios[0].value;
          if (education === 'diger') {
            education = document.getElementById('educationOther')?.value?.trim() || 'Diğer';
          }
        }

        // Jobs
        const jobCheckboxes = document.querySelectorAll('input[name="jobs"]:checked');
        const jobs = Array.from(jobCheckboxes).map(cb => cb.value);
        if (jobs.includes('diger')) {
          const otherJob = document.getElementById('jobsOther')?.value?.trim();
          if (otherJob) jobs.push(otherJob);
          jobs.splice(jobs.indexOf('diger'), 1);
        }

        // Available Days
        const dayCheckboxes = document.querySelectorAll('input[name="days"]:checked');
        const availableDays = Array.from(dayCheckboxes).map(cb => cb.value);

        // Work Types
        const workTypeCheckboxes = document.querySelectorAll('input[name="workTypes"]:checked');
        const workTypes = Array.from(workTypeCheckboxes).map(cb => cb.value);

        // WhatsApp
        const whatsappRadios = document.querySelectorAll('input[name="whatsapp"]:checked');
        const whatsapp = whatsappRadios.length > 0 ? whatsappRadios[0].value : '';

        if (!employeeName || !employeeBirthDate || !employeePhone || !employeeCity || !employeeDistrict || !employeeNeighborhood || !education || jobs.length === 0 || availableDays.length === 0 || workTypes.length === 0 || !whatsapp) {
          showAuthMessage('Lütfen tüm çalışan bilgilerini eksiksiz doldurun.', 'warning');
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
          workTypes,
          whatsapp
        });
      }

      try {
        const userRef = window.firebaseFirestore.doc(window.db, 'users', window.currentUserId);
        await window.firebaseFirestore.setDoc(userRef, userData);
        showAuthMessage('Kayıt tamamlandı! Yönlendiriliyorsunuz...', 'success');
        setTimeout(function() { window.location.href = 'index.html'; }, 1400);
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
    setTimeout(function() { window.location.href = 'index.html'; }, 1200);
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

    if (signupStep === 1) {
      confirmWrapper.classList.remove('hidden');
      confirmWrapper.style.display = '';
      if (signupBackButton) {
        signupBackButton.classList.add('hidden');
        signupBackButton.style.display = 'none';
      }
    } else {
      confirmWrapper.classList.add('hidden');
      confirmWrapper.style.display = 'none';
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
