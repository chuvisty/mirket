
async function includeHTML(file, elementId) {
        const response = await fetch(file);
        const text = await response.text();
        document.getElementById(elementId).innerHTML = text;
    }


async function initApp() {
  await includeHTML("header.html", "headerContainer");
  await includeHTML("footer.html", "footerContainer");
  window.authInitialized = false;
  await initFirebase();
  initHeaderAuthLink();
  initAuthStateListener();
  initAuthPage();
  initAccountPage();
  initJobRequestPage();
  initWorkerFeedPage();
  initAdminPage();
}

document.addEventListener('DOMContentLoaded', initApp);

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

    const userTypeLabel = userData.userType === 'restaurant' ? 'Restoran' : 'Çalışan';
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
  } catch (error) {
    console.error('Hesap bilgileri yükleme hatası:', error);
    setAccountMessage('Hesap bilgileri yüklenirken bir hata oluştu.', 'error');
  }
}

function formatList(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.map(humanizeValue).join(', ');
  }
  return humanizeValue(value);
}

function humanizeValue(value) {
  if (!value) return '';
  return String(value)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, function(chr) { return chr.toUpperCase(); });
}

function initJobRequestPage() {
  const jobRequestSection = document.getElementById('jobRequestSection');
  if (!jobRequestSection) return;

  const jobRequestMessage = document.getElementById('jobRequestMessage');
  const jobRequestForm = document.getElementById('jobRequestForm');

  if (jobRequestMessage) {
    jobRequestMessage.textContent = 'Yetkileriniz kontrol ediliyor...';
    jobRequestMessage.className = 'auth-message info';
    jobRequestMessage.classList.remove('hidden');
  }

  // Auth state listener handles the asynchronous check
  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, async function(user) {
      if (!user) {
        if (jobRequestMessage) {
          jobRequestMessage.textContent = 'Bu sayfayı görüntülemek için giriş yapmalısınız. Yönlendiriliyorsunuz...';
          jobRequestMessage.className = 'auth-message warning';
        }
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
      }

      try {
        const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
        const userSnapshot = await window.firebaseFirestore.getDoc(userRef);

        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          if (userData.userType !== 'restaurant') {
            if (jobRequestMessage) {
              jobRequestMessage.textContent = 'Sadece işletme (restoran) hesapları ilan oluşturabilir. Ana sayfaya yönlendiriliyorsunuz...';
              jobRequestMessage.className = 'auth-message error';
            }
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
          }

          // User is a restaurant, show the form
          if (jobRequestMessage) jobRequestMessage.classList.add('hidden');
          if (jobRequestForm) jobRequestForm.classList.remove('hidden');
        } else {
          if (jobRequestMessage) {
            jobRequestMessage.textContent = 'Kullanıcı bilgileri bulunamadı.';
            jobRequestMessage.className = 'auth-message error';
          }
        }
      } catch (error) {
        console.error('Yetki kontrolü hatası:', error);
        if (jobRequestMessage) {
          jobRequestMessage.textContent = 'Yetki kontrolü sırasında bir hata oluştu.';
          jobRequestMessage.className = 'auth-message error';
        }
      }
    });
  }
}

async function submitJobRequest() {
  const jobRole = document.getElementById('jobRole')?.value;
  const jobDate = document.getElementById('jobDate')?.value;
  const jobStartTime = document.getElementById('jobStartTime')?.value;
  const jobEndTime = document.getElementById('jobEndTime')?.value;
  const jobPeopleCount = document.getElementById('jobPeopleCount')?.value;
  const jobDetails = document.getElementById('jobDetails')?.value?.trim();
  const jobRequestMessage = document.getElementById('jobRequestMessage');
  const submitBtn = document.getElementById('submitJobBtn');

  if (!jobRole || !jobDate || !jobStartTime || !jobEndTime || !jobPeopleCount || !jobDetails) {
    if (jobRequestMessage) {
      jobRequestMessage.textContent = 'Lütfen tüm alanları eksiksiz doldurun.';
      jobRequestMessage.className = 'auth-message warning';
      jobRequestMessage.classList.remove('hidden');
    }
    return;
  }

  const user = window.auth?.currentUser;
  if (!user) {
    alert('Oturumunuz zaman aşımına uğradı, lütfen tekrar giriş yapın.');
    window.location.href = 'login.html';
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Gönderiliyor...';
  }

  try {
    const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
    const userSnapshot = await window.firebaseFirestore.getDoc(userRef);
    const userData = userSnapshot.data() || {};

    const jobData = {
      restaurantId: user.uid,
      restaurantName: userData.businessName || 'Bilinmeyen İşletme',
      restaurantCity: userData.businessCity || '',
      restaurantDistrict: userData.businessDistrict || '',
      jobRole,
      jobDate,
      jobStartTime,
      jobEndTime,
      jobPeopleCount: parseInt(jobPeopleCount, 10),
      jobDetails,
      status: 'active', // active, completed, cancelled
      createdAt: window.firebaseFirestore.serverTimestamp()
    };

    const jobsCollection = window.firebaseFirestore.collection(window.db, 'jobRequests');
    await window.firebaseFirestore.addDoc(jobsCollection, jobData);

    if (jobRequestMessage) {
      jobRequestMessage.textContent = 'İlanınız başarıyla oluşturuldu! İşçilerimiz yakında sizinle iletişime geçecektir.';
      jobRequestMessage.className = 'auth-message success';
      jobRequestMessage.classList.remove('hidden');
    }

    // Refresh jobs list if available
    if (typeof loadRestaurantJobs === 'function') {
      loadRestaurantJobs(user.uid);
    }

    // Reset form
    document.getElementById('jobDate').value = '';
    document.getElementById('jobStartTime').value = '';
    document.getElementById('jobEndTime').value = '';
    document.getElementById('jobPeopleCount').value = '1';
    document.getElementById('jobDetails').value = '';

  } catch (error) {
    console.error('İlan oluşturma hatası:', error);
    if (jobRequestMessage) {
      jobRequestMessage.textContent = 'İlan oluşturulurken bir hata meydana geldi. Lütfen tekrar deneyin.';
      jobRequestMessage.className = 'auth-message error';
      jobRequestMessage.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'İlanı Gönder';
    }
  }
}

function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("active");
}

function goHome() {
  window.location.href = "index.html";
}

// ==========================================
// WORKER FEED & APPLY LOGIC
// ==========================================

function initWorkerFeedPage() {
  const feedSection = document.getElementById('workerFeedSection');
  if (!feedSection) return;

  const msg = document.getElementById('workerFeedMessage');
  const list = document.getElementById('jobsFeedList');

  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, async function(user) {
      if (!user) {
        if (msg) {
          msg.textContent = 'İlanları görmek için giriş yapmalısınız.';
          msg.className = 'auth-message warning';
          msg.classList.remove('hidden');
        }
        if (list) list.classList.add('hidden');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
      }

      try {
        const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
        const userSnap = await window.firebaseFirestore.getDoc(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.data();
          if (uData.userType === 'restaurant') {
            if (msg) {
              msg.textContent = 'İşletmeler bu sayfayı göremez.';
              msg.className = 'auth-message error';
              msg.classList.remove('hidden');
            }
            if (list) list.classList.add('hidden');
            return;
          }
        }
        
        // Load active jobs
        loadWorkerJobs(user);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

async function loadWorkerJobs(user) {
  const list = document.getElementById('jobsFeedList');
  if (!list) return;

  list.classList.remove('hidden');
  list.innerHTML = '<p>İlanlar yükleniyor...</p>';

  try {
    const jobsRef = window.firebaseFirestore.collection(window.db, 'jobRequests');
    const q = window.firebaseFirestore.query(jobsRef, window.firebaseFirestore.where('status', '==', 'active'), window.firebaseFirestore.orderBy('createdAt', 'desc'));
    const snapshot = await window.firebaseFirestore.getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = '<p>Şu anda aktif bir ilan bulunmuyor.</p>';
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      html += `
        <div class="card" style="border: 1px solid #ddd; margin-bottom: 15px; padding: 15px; text-align: left;">
          <h3 style="margin-top:0;">${job.jobRole} Aranıyor</h3>
          <p><strong>İşletme:</strong> ${job.restaurantName} (${job.restaurantDistrict}/${job.restaurantCity})</p>
          <p><strong>Tarih/Saat:</strong> ${job.jobDate} | ${job.jobStartTime} - ${job.jobEndTime}</p>
          <p><strong>Kişi Sayısı:</strong> ${job.jobPeopleCount}</p>
          <p><strong>Detaylar:</strong> ${job.jobDetails}</p>
          <button class="btn secondary" style="width:auto; padding: 8px 16px;" onclick="applyForJob('${jobId}', '${job.restaurantId}', '${job.restaurantName}', '${job.jobRole}')">Başvur</button>
        </div>
      `;
    });
    list.innerHTML = html;
  } catch (error) {
    console.error('İlanlar yüklenirken hata:', error);
    // If index is missing, it will throw an error. We can fallback to fetching all and filtering in memory if needed, but since it's firestore we should just let it fail or log the index link.
    // To avoid complex index creation right now, let's remove orderBy and sort in memory.
    try {
      const jobsRef = window.firebaseFirestore.collection(window.db, 'jobRequests');
      const q = window.firebaseFirestore.query(jobsRef, window.firebaseFirestore.where('status', '==', 'active'));
      const snapshot = await window.firebaseFirestore.getDocs(q);
      
      let jobsArray = [];
      snapshot.forEach(doc => jobsArray.push({ id: doc.id, ...doc.data() }));
      jobsArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      if (jobsArray.length === 0) {
        list.innerHTML = '<p>Şu anda aktif bir ilan bulunmuyor.</p>';
        return;
      }

      let html = '';
      jobsArray.forEach(job => {
        html += `
          <div class="job-card">
            <h3 style="margin-top:0;">${job.jobRole} Aranıyor</h3>
            <p><strong>İşletme:</strong> ${job.restaurantName} (${job.restaurantDistrict}/${job.restaurantCity})</p>
            <p><strong>Tarih/Saat:</strong> ${job.jobDate} | ${job.jobStartTime} - ${job.jobEndTime}</p>
            <p><strong>Kişi Sayısı:</strong> ${job.jobPeopleCount}</p>
            <p><strong>Detaylar:</strong> ${job.jobDetails}</p>
            <button class="btn secondary" style="width:auto; padding: 8px 16px;" onclick="applyForJob('${job.id}', '${job.restaurantId}', '${job.restaurantName}', '${job.jobRole}')">Başvur</button>
          </div>
        `;
      });
      list.innerHTML = html;

    } catch (e2) {
      list.innerHTML = '<p>İlanlar yüklenirken hata oluştu.</p>';
    }
  }
}

async function applyForJob(jobId, restaurantId, restaurantName, jobRole) {
  const user = window.auth?.currentUser;
  if (!user) {
    alert("Başvuru yapmak için giriş yapmalısınız.");
    return;
  }

  // Mükerrer başvuru kontrolü
  try {
    const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
    const q = window.firebaseFirestore.query(
      appsRef, 
      window.firebaseFirestore.where('jobId', '==', jobId),
      window.firebaseFirestore.where('workerId', '==', user.uid)
    );
    const snap = await window.firebaseFirestore.getDocs(q);
    if (!snap.empty) {
      alert("Bu ilana zaten başvurdunuz.");
      return;
    }
  } catch (e) {
    console.error("Mükerrer başvuru kontrolü hatası:", e);
    // Continue even if index fails for now, or alert error.
    // For MVP, we alert and stop if we can't verify to be safe, but a missing index might crash it.
    // Let's fallback: fetch all user's applications and filter in JS if index is missing.
    try {
        const qUserApps = window.firebaseFirestore.query(appsRef, window.firebaseFirestore.where('workerId', '==', user.uid));
        const userAppsSnap = await window.firebaseFirestore.getDocs(qUserApps);
        let alreadyApplied = false;
        userAppsSnap.forEach(d => { if (d.data().jobId === jobId) alreadyApplied = true; });
        if (alreadyApplied) {
            alert("Bu ilana zaten başvurdunuz.");
            return;
        }
    } catch(err2) {
         console.warn("Could not verify duplicate application", err2);
    }
  }

  const confirmMsg = `"${restaurantName}" işletmesinin "${jobRole}" ilanına başvurmak istediğinize emin misiniz?`;
  if (!confirm(confirmMsg)) return;

  try {
    const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
    const userSnap = await window.firebaseFirestore.getDoc(userRef);
    const workerData = userSnap.data() || {};

    const applicationData = {
      jobId,
      restaurantId,
      restaurantName,
      jobRole,
      workerId: user.uid,
      workerName: workerData.employeeName || 'Bilinmeyen İşçi',
      workerPhone: workerData.employeePhone || '',
      workerEmail: user.email || '',
      status: 'pending', // pending, approved, rejected, contacted
      createdAt: window.firebaseFirestore.serverTimestamp()
    };

    const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
    await window.firebaseFirestore.addDoc(appsRef, applicationData);

    alert("Başvurunuz başarıyla alındı! İletişim bilgileriniz incelendikten sonra size dönüş yapılacaktır.");
  } catch (e) {
    console.error(e);
    alert("Başvuru sırasında bir hata oluştu.");
  }
}

// ==========================================
// WORKER MY APPLICATIONS
// ==========================================

function showWorkerFeed() {
  document.getElementById('workerFeedSection').classList.remove('hidden');
  const myApps = document.getElementById('myApplicationsSection');
  if (myApps) myApps.classList.add('hidden');
}

function showMyApplications() {
  document.getElementById('workerFeedSection').classList.add('hidden');
  const myApps = document.getElementById('myApplicationsSection');
  if (myApps) {
    myApps.classList.remove('hidden');
    loadMyApplications();
  }
}

async function loadMyApplications() {
  const list = document.getElementById('myApplicationsList');
  if (!list) return;

  const user = window.auth?.currentUser;
  if (!user) return;

  list.innerHTML = '<p>Başvurularınız yükleniyor...</p>';

  try {
    const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
    const q = window.firebaseFirestore.query(appsRef, window.firebaseFirestore.where('workerId', '==', user.uid));
    const snapshot = await window.firebaseFirestore.getDocs(q);

    let appsArray = [];
    snapshot.forEach(doc => appsArray.push({ id: doc.id, ...doc.data() }));
    appsArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (appsArray.length === 0) {
      list.innerHTML = '<p>Henüz bir ilana başvurmadınız.</p>';
      return;
    }

    let html = '';
    appsArray.forEach(app => {
      const dateStr = app.createdAt && typeof app.createdAt.toDate === 'function' ? app.createdAt.toDate().toLocaleString('tr-TR') : '';
      let statusBadge = '';
      if (app.status === 'pending') statusBadge = '<span style="color:orange; font-weight:bold;">İnceleniyor</span>';
      else if (app.status === 'approved') statusBadge = '<span style="color:green; font-weight:bold;">Onaylandı (Size ulaşılacak)</span>';
      else if (app.status === 'rejected') statusBadge = '<span style="color:red; font-weight:bold;">Olumsuz</span>';
      else statusBadge = `<span style="color:blue; font-weight:bold;">${app.status}</span>`;

      html += `
        <div class="job-card">
          <h3 style="margin-top:0;">${app.jobRole}</h3>
          <p><strong>İşletme:</strong> ${app.restaurantName}</p>
          <p><strong>Durum:</strong> ${statusBadge}</p>
          <p><small>Başvuru Tarihi: ${dateStr}</small></p>
        </div>
      `;
    });
    list.innerHTML = html;
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p>Başvurular yüklenirken hata oluştu.</p>';
  }
}


// ==========================================
// RESTAURANT MY JOBS LOGIC
// ==========================================

// This is called inside initJobRequestPage when user is restaurant
const originalInitJobRequestPage = initJobRequestPage;
initJobRequestPage = function() {
  originalInitJobRequestPage();
  if (!document.getElementById('myJobsSection')) return;

  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, async function(user) {
      if (user) {
        const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
        const userSnap = await window.firebaseFirestore.getDoc(userRef);
        if (userSnap.exists() && userSnap.data().userType === 'restaurant') {
           loadRestaurantJobs(user.uid);
        }
      }
    });
  }
};

async function loadRestaurantJobs(restaurantId) {
  const list = document.getElementById('myJobsList');
  if (!list) return;

  list.classList.remove('hidden');
  list.innerHTML = '<p>İlanlarınız yükleniyor...</p>';

  try {
    const jobsRef = window.firebaseFirestore.collection(window.db, 'jobRequests');
    const q = window.firebaseFirestore.query(jobsRef, window.firebaseFirestore.where('restaurantId', '==', restaurantId));
    const snapshot = await window.firebaseFirestore.getDocs(q);

    let jobsArray = [];
    snapshot.forEach(doc => jobsArray.push({ id: doc.id, ...doc.data() }));
    jobsArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (jobsArray.length === 0) {
      list.innerHTML = '<p>Henüz bir ilan oluşturmadınız.</p>';
      return;
    }

    let html = '';
    jobsArray.forEach(job => {
      const isActive = job.status === 'active';
      const statusText = isActive ? '<span style="color:green;font-weight:bold;">Aktif</span>' : '<span style="color:gray;">Pasif</span>';
      html += `
        <div class="job-card">
          <h3 style="margin-top:0;">${job.jobRole} (${job.jobDate})</h3>
          <p><strong>Durum:</strong> ${statusText}</p>
          <p><strong>Saat:</strong> ${job.jobStartTime} - ${job.jobEndTime} | <strong>Kişi:</strong> ${job.jobPeopleCount}</p>
          <div style="margin-top: 10px; display: flex; gap: 10px;">
            <button class="btn secondary" style="width:auto; padding: 5px 10px;" onclick="toggleJobStatus('${job.id}', '${job.status}')">${isActive ? 'Pasif Yap' : 'Aktif Yap'}</button>
            <button class="btn ghost" style="width:auto; padding: 5px 10px; color: red;" onclick="deleteJob('${job.id}')">Sil</button>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p>İlanlarınız yüklenirken hata oluştu.</p>';
  }
}

async function toggleJobStatus(jobId, currentStatus) {
  try {
    const newStatus = currentStatus === 'active' ? 'completed' : 'active';
    const jobRef = window.firebaseFirestore.doc(window.db, 'jobRequests', jobId);
    await window.firebaseFirestore.updateDoc(jobRef, { status: newStatus });
    
    // Reload jobs
    if (window.auth?.currentUser) {
      loadRestaurantJobs(window.auth.currentUser.uid);
    }
  } catch (e) {
    console.error(e);
    alert('Durum güncellenirken hata oluştu.');
  }
}

async function deleteJob(jobId) {
  if (!confirm("Bu ilanı silmek istediğinize emin misiniz?")) return;
  try {
    const jobRef = window.firebaseFirestore.doc(window.db, 'jobRequests', jobId);
    await window.firebaseFirestore.deleteDoc(jobRef);
    if (window.auth?.currentUser) {
      loadRestaurantJobs(window.auth.currentUser.uid);
    }
  } catch (e) {
    console.error(e);
    alert('Silinirken hata oluştu.');
  }
}

// ==========================================
// ADMIN LOGIC
// ==========================================

function initAdminPage() {
  const adminSection = document.getElementById('adminSection');
  if (!adminSection) return;

  const msg = document.getElementById('adminMessage');
  const list = document.getElementById('adminApplicationsList');

  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, async function(user) {
      if (!user) {
        if (msg) {
          msg.textContent = 'Giriş yapmalısınız.';
          msg.className = 'auth-message warning';
          msg.classList.remove('hidden');
        }
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
      }

      try {
        const userRef = window.firebaseFirestore.doc(window.db, 'users', user.uid);
        const userSnap = await window.firebaseFirestore.getDoc(userRef);
        if (userSnap.exists() && userSnap.data().userType === 'admin') {
          if (msg) msg.classList.add('hidden');
          loadAllApplications();
        } else {
          if (msg) {
            msg.textContent = 'Bu sayfayı görüntüleme yetkiniz yok.';
            msg.className = 'auth-message error';
            msg.classList.remove('hidden');
          }
          setTimeout(() => window.location.href = 'index.html', 2000);
        }
      } catch (e) {
        console.error(e);
      }
    });
  }
}

async function loadAllApplications() {
  const list = document.getElementById('adminApplicationsList');
  if (!list) return;

  list.classList.remove('hidden');
  list.innerHTML = '<p>Başvurular yükleniyor...</p>';

  try {
    const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
    // fetch all
    const snapshot = await window.firebaseFirestore.getDocs(appsRef);

    let appsArray = [];
    snapshot.forEach(doc => appsArray.push({ id: doc.id, ...doc.data() }));
    appsArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (appsArray.length === 0) {
      list.innerHTML = '<p>Henüz hiç başvuru yok.</p>';
      return;
    }

    // Group by jobId
    const grouped = {};
    appsArray.forEach(app => {
      const jId = app.jobId || 'unknown';
      if (!grouped[jId]) {
        grouped[jId] = {
          jobRole: app.jobRole,
          restaurantName: app.restaurantName,
          applications: []
        };
      }
      grouped[jId].applications.push(app);
    });

    let html = '';
    for (const jId in grouped) {
      const group = grouped[jId];
      html += `
        <div class="card" style="border: 2px solid #1064ac; margin-bottom: 20px; padding: 15px; text-align: left; width: 100%; box-sizing: border-box;">
          <h2 style="margin-top:0; color: #1064ac;">İlan: ${group.jobRole}</h2>
          <p><strong>İşletme:</strong> ${group.restaurantName}</p>
          <h3 style="margin-top:15px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Gelen Başvurular</h3>
      `;
      group.applications.forEach(app => {
        const dateStr = app.createdAt && typeof app.createdAt.toDate === 'function' ? app.createdAt.toDate().toLocaleString('tr-TR') : '';
        const phone = app.workerPhone ? app.workerPhone.replace(/[^0-9+]/g, '') : '';
        const waLink = phone ? `https://wa.me/${phone}` : '#';
        const telLink = phone ? `tel:${phone}` : '#';
        
        let statusBadge = '';
        if (app.status === 'pending') statusBadge = '<span style="color:orange; font-weight:bold;">Bekliyor</span>';
        else if (app.status === 'approved') statusBadge = '<span style="color:green; font-weight:bold;">Onaylandı</span>';
        else if (app.status === 'rejected') statusBadge = '<span style="color:red; font-weight:bold;">Reddedildi</span>';
        else statusBadge = `<span style="color:blue; font-weight:bold;">${app.status}</span>`;

        html += `
          <div class="application-card" style="margin-top: 15px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
            <p style="margin: 0 0 8px 0;"><strong>İşçi:</strong> ${app.workerName} - ${statusBadge}</p>
            <p style="margin: 0 0 8px 0;"><strong>Telefon:</strong> ${app.workerPhone} 
              <a href="${waLink}" target="_blank" class="btn secondary" style="padding: 4px 8px; font-size:12px; text-decoration:none; background-color:#25D366; color:white;">WhatsApp</a>
              <a href="${telLink}" class="btn secondary" style="padding: 4px 8px; font-size:12px; text-decoration:none; background-color:#34b7f1; color:white;">Ara</a>
            </p>
            <p style="margin: 0 0 8px 0;"><small>Tarih: ${dateStr}</small></p>
            <div style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
              <select id="status_${app.id}" style="padding: 6px; border-radius: 5px; border: 1px solid #ccc;">
                <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Bekliyor</option>
                <option value="approved" ${app.status === 'approved' ? 'selected' : ''}>Onayla</option>
                <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Reddet</option>
              </select>
              <button class="btn secondary" style="padding: 6px 12px; width: auto;" onclick="updateAppStatus('${app.id}')">Durumu Güncelle</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
    list.innerHTML = html;
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p>Başvurular yüklenirken hata oluştu.</p>';
  }
}

async function updateAppStatus(appId) {
  const select = document.getElementById('status_' + appId);
  if (!select) return;
  const newStatus = select.value;
  try {
    const appRef = window.firebaseFirestore.doc(window.db, 'jobApplications', appId);
    await window.firebaseFirestore.updateDoc(appRef, { status: newStatus });
    alert('Başvuru durumu başarıyla güncellendi!');
    loadAllApplications(); // Yenile
  } catch(e) {
    console.error(e);
    alert('Durum güncellenirken hata oluştu.');
  }
}

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
  updateAuthUI();
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
  if (submitButton) submitButton.addEventListener('click', handleAuthSubmit);
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
      updateAuthUI();
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
      const digerChecked = document.querySelector('input[name="jobs"][value="diger"]').checked;
      otherInput.style.display = digerChecked ? '' : 'none';
    });
  });

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) logoutButton.addEventListener('click', logoutUser);

  updateAuthUI();
}
