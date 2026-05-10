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
        loadWorkerJobs(user, uData);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

async function loadWorkerJobs(user, workerData) {
  const list = document.getElementById('jobsFeedList');
  if (!list) return;

  const cityInput = document.getElementById('filterCity');
  const districtInput = document.getElementById('filterDistrict');

  // Set default values from workerData if inputs are empty
  if (workerData && cityInput && !cityInput.value && workerData.employeeCity) {
    cityInput.value = workerData.employeeCity;
  }

  const selectedCity = cityInput ? cityInput.value.trim() : '';
  const selectedDistrict = districtInput ? districtInput.value.trim() : '';

  list.classList.remove('hidden');
  list.innerHTML = '<p>İlanlar yükleniyor...</p>';

  try {
    const jobsRef = window.firebaseFirestore.collection(window.db, 'jobRequests');
    let q = window.firebaseFirestore.query(jobsRef, window.firebaseFirestore.where('status', '==', 'active'));

    if (selectedCity) {
      q = window.firebaseFirestore.query(q, window.firebaseFirestore.where('restaurantCity', '==', selectedCity));
    }
    if (selectedDistrict) {
      q = window.firebaseFirestore.query(q, window.firebaseFirestore.where('restaurantDistrict', '==', selectedDistrict));
    }

    const snapshot = await window.firebaseFirestore.getDocs(q);

    // Başvurulan ilanları getir
    let appliedJobIds = new Set();
    try {
      const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
      const appsQ = window.firebaseFirestore.query(appsRef, window.firebaseFirestore.where('workerId', '==', user.uid));
      const appsSnap = await window.firebaseFirestore.getDocs(appsQ);
      appsSnap.forEach(appDoc => appliedJobIds.add(appDoc.data().jobId));
    } catch (err) {
      console.warn("Could not fetch user applications for marker", err);
    }

    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    let jobsArray = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const createdAtDate = data.createdAt ? data.createdAt.toDate() : new Date();
      
      // 3 haftadan eski aktif ilanları otomatik olarak 'expired' (süresi doldu) yap
      if (createdAtDate < threeWeeksAgo) {
        try {
           window.firebaseFirestore.updateDoc(doc.ref, { status: 'expired' });
        } catch(e) { console.warn("Failed to auto-expire job", e); }
      } else {
        jobsArray.push({ id: doc.id, ...data });
      }
    });
    
    // Sort in memory to avoid needing composite indexes in Firestore
    jobsArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (jobsArray.length === 0) {
      list.innerHTML = '<p>Şu anda kriterlerinize uygun aktif bir ilan bulunmuyor.</p>';
      return;
    }

    let html = '';
    jobsArray.forEach(job => {
      const alreadyApplied = appliedJobIds.has(job.id);
      const buttonHtml = alreadyApplied 
        ? `<button class="btn secondary" style="width:auto; padding: 8px 16px; opacity: 0.6; cursor: not-allowed;" disabled>Zaten Başvuruldu</button>`
        : `<button class="btn secondary" style="width:auto; padding: 8px 16px;" onclick="applyForJob('${job.id}', '${job.restaurantId}', '${job.restaurantName}', '${job.jobRole}')">Başvur</button>`;

      html += `
        <div class="job-card" style="border: 1px solid #ddd; margin-bottom: 15px; padding: 15px; text-align: left;">
          <h3 style="margin-top:0;">${job.jobRole} Aranıyor</h3>
          <p><strong>İşletme:</strong> ${job.restaurantName} (${job.restaurantDistrict}/${job.restaurantCity})</p>
          <p><strong>Tarih/Saat:</strong> ${job.jobDate} | ${job.jobStartTime} - ${job.jobEndTime}</p>
          <p><strong>Kişi Sayısı:</strong> ${job.jobPeopleCount}</p>
          <p><strong>Detaylar:</strong> ${job.jobDetails}</p>
          ${buttonHtml}
        </div>
      `;
    });
    list.innerHTML = html;
  } catch (error) {
    console.error('İlanlar yüklenirken hata:', error);
    list.innerHTML = '<p>İlanlar yüklenirken bir hata oluştu.</p>';
  }
}

function applyFilters() {
  const user = window.auth?.currentUser;
  if (user) {
    loadWorkerJobs(user, null); // Pass null to keep current input values
  } else {
    alert('Filtreleme yapmak için giriş yapmalısınız.');
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
    try {
        const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
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
