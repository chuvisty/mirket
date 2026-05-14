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
          
          // Also load restaurant jobs if the section exists
          if (document.getElementById('myJobsSection')) {
              loadRestaurantJobs(user.uid);
          }
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
  const jobStartTime = document.querySelector('input[name="jobStartTime"]:checked')?.value;
  const jobEndTime = document.querySelector('input[name="jobEndTime"]:checked')?.value;
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
    const startChecked = document.querySelector('input[name="jobStartTime"]:checked');
    if (startChecked) startChecked.checked = false;
    const endChecked = document.querySelector('input[name="jobEndTime"]:checked');
    if (endChecked) endChecked.checked = false;
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
      let statusText = '';
      if (job.status === 'active') statusText = '<span style="color:green;font-weight:bold;">Aktif</span>';
      else if (job.status === 'expired') statusText = '<span style="color:red;font-weight:bold;">Süresi Doldu</span>';
      else statusText = '<span style="color:gray;">Pasif</span>';
      
      const isActive = job.status === 'active';
      const toggleBtnText = isActive ? 'Pasif Yap' : 'Yeniden Yayınla (Aktif Yap)';

      html += `
        <div class="job-card">
          <h3 style="margin-top:0;">${job.jobRole} (${job.jobDate})</h3>
          <p><strong>Durum:</strong> ${statusText}</p>
          <p><strong>Saat:</strong> ${job.jobStartTime} - ${job.jobEndTime} | <strong>Kişi:</strong> ${job.jobPeopleCount}</p>
          <div style="margin-top: 10px; display: flex; gap: 10px;">
            <button class="btn secondary" style="width:auto; padding: 5px 10px;" onclick="toggleJobStatus('${job.id}', '${job.status}')">${toggleBtnText}</button>
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
