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

      const cardStyle = alreadyApplied 
        ? "background-color: #f8fafc; border: 1px solid #e2e8f0; opacity: 0.8;" 
        : "background-color: #ffffff; border: 1px solid #ddd;";

      html += `
        <div class="job-card" style="${cardStyle} margin-bottom: 15px; padding: 15px; text-align: left;">
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
  document.getElementById('myApplicationsSection')?.classList.add('hidden');
  document.getElementById('myShiftsSection')?.classList.add('hidden');
  
  document.getElementById('tabWorkerFeed').className = 'btn primary';
  document.getElementById('tabMyApplications').className = 'btn secondary';
  document.getElementById('tabMyShifts').className = 'btn secondary';
}

function showMyApplications() {
  document.getElementById('workerFeedSection').classList.add('hidden');
  document.getElementById('myApplicationsSection')?.classList.remove('hidden');
  document.getElementById('myShiftsSection')?.classList.add('hidden');
  
  document.getElementById('tabWorkerFeed').className = 'btn secondary';
  document.getElementById('tabMyApplications').className = 'btn primary';
  document.getElementById('tabMyShifts').className = 'btn secondary';
  
  loadMyApplications();
}

function showMyShifts() {
  document.getElementById('workerFeedSection').classList.add('hidden');
  document.getElementById('myApplicationsSection')?.classList.add('hidden');
  document.getElementById('myShiftsSection')?.classList.remove('hidden');
  
  document.getElementById('tabWorkerFeed').className = 'btn secondary';
  document.getElementById('tabMyApplications').className = 'btn secondary';
  document.getElementById('tabMyShifts').className = 'btn primary';
  
  loadMyShifts();
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

window.allMyShiftsData = [];
window.myShiftsStaffMap = {};
window.myShiftsRestaurantNames = {};

async function loadMyShifts() {
  const list = document.getElementById('myShiftsList');
  const section = document.getElementById('workerShiftsSection');
  if (!list) return;

  const user = window.auth?.currentUser;
  if (!user) return;

  if (section) section.classList.remove('hidden');
  list.innerHTML = '<p style="text-align: center; color: #64748b; padding: 20px;">Vardiyalarınız yükleniyor...</p>';

  try {
    const staffRef = window.firebaseFirestore.collection(window.db, 'restaurantStaff');
    const staffQ = window.firebaseFirestore.query(staffRef, window.firebaseFirestore.where('vardiyanUserId', '==', user.uid));
    const staffSnap = await window.firebaseFirestore.getDocs(staffQ);
    
    if (staffSnap.empty) {
      list.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 20px;">Şu anda sistemde herhangi bir işletmede personel olarak kayıtlı değilsiniz.</p>';
      return;
    }

    const staffIds = [];
    window.myShiftsStaffMap = {};
    staffSnap.forEach(doc => {
      staffIds.push(doc.id);
      window.myShiftsStaffMap[doc.id] = doc.data();
    });

    const chunks = [];
    for (let i = 0; i < staffIds.length; i += 30) {
      chunks.push(staffIds.slice(i, i + 30));
    }

    let allShifts = [];
    const shiftsRef = window.firebaseFirestore.collection(window.db, 'shifts');

    for (const chunk of chunks) {
      const shiftsQ = window.firebaseFirestore.query(shiftsRef, window.firebaseFirestore.where('staffId', 'in', chunk));
      const shiftsSnap = await window.firebaseFirestore.getDocs(shiftsQ);
      shiftsSnap.forEach(doc => {
         allShifts.push({id: doc.id, ...doc.data()});
      });
    }

    allShifts.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.startTime.localeCompare(a.startTime);
    });

    window.allMyShiftsData = allShifts;

    const restaurantIds = [...new Set(allShifts.map(s => s.restaurantId))];
    window.myShiftsRestaurantNames = {};
    for (const rid of restaurantIds) {
      try {
        const rDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', rid));
        if (rDoc.exists()) {
           window.myShiftsRestaurantNames[rid] = rDoc.data().businessName || 'İşletme';
        }
      } catch (e) {}
    }

    // Default to 'upcoming' (Gelecek Vardiyalar) on page load
    filterMyShifts('upcoming');

  } catch (error) {
    console.error("Error loading my shifts:", error);
    list.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">Vardiyalar yüklenirken bir hata oluştu.</p>';
  }
}

function filterMyShifts(filterType) {
  const list = document.getElementById('myShiftsList');
  if (!list) return;

  const tabUpcoming = document.getElementById('tabUpcoming');
  const tabPast = document.getElementById('tabPast');
  const tabAll = document.getElementById('tabAll');

  if (tabUpcoming) tabUpcoming.classList.toggle('active', filterType === 'upcoming');
  if (tabPast) tabPast.classList.toggle('active', filterType === 'past');
  if (tabAll) tabAll.classList.toggle('active', filterType === 'all');

  const allShifts = window.allMyShiftsData || [];
  if (allShifts.length === 0) {
    list.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 20px;">Size atanmış geçmiş veya gelecek bir vardiya bulunmuyor.</p>';
    return;
  }

  const todayStr = (function() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  let filteredShifts = [];
  if (filterType === 'upcoming') {
    filteredShifts = allShifts.filter(s => s.date >= todayStr);
  } else if (filterType === 'past') {
    filteredShifts = allShifts.filter(s => s.date < todayStr);
  } else {
    filteredShifts = [...allShifts];
  }

  if (filteredShifts.length === 0) {
    const msg = filterType === 'upcoming' 
      ? '📅 Yaklaşan gelecek bir vardiyanız bulunmuyor.' 
      : filterType === 'past' 
      ? '📜 Geçmiş vardiya kaydınız bulunmuyor.' 
      : 'Size atanmış bir vardiya bulunmuyor.';
    list.innerHTML = `<p style="text-align: center; color: #64748b; padding: 25px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">${msg}</p>`;
    return;
  }

  let html = '';
  filteredShifts.forEach(shift => {
    const restName = escapeHTML(window.myShiftsRestaurantNames[shift.restaurantId] || 'İşletme');
    const roleStr = escapeHTML(shift.role || window.myShiftsStaffMap[shift.staffId]?.role || 'Belirtilmedi');
    const isPast = shift.date < todayStr;
    const badgeStyle = isPast 
      ? 'background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1;' 
      : 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;';
    const badgeText = isPast ? 'Tamamlandı / Geçmiş' : '⏰ Gelecek Vardiya';

    html += `
      <div class="job-card" style="margin-bottom: 15px; padding: 18px; border-radius: 14px; background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <h3 style="margin: 0; font-size: 17px; color: #1e293b;">📅 ${escapeHTML(shift.date)} | ${escapeHTML(shift.startTime)} - ${escapeHTML(shift.endTime)}</h3>
          <span style="font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; ${badgeStyle}">${badgeText}</span>
        </div>
        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>🏬 İşletme:</strong> ${restName}</p>
        <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>👔 Görev:</strong> ${roleStr}</p>
        ${shift.notes ? '<p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b; background: #f8fafc; padding: 8px 12px; border-radius: 8px; border-left: 3px solid #cbd5e1;"><strong>📝 Not:</strong> ' + escapeHTML(shift.notes) + '</p>' : ''}
      </div>
    `;
  });
  list.innerHTML = html;
}
