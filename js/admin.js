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
          // Auto-run scan for target 8 UIDs on load
          const targetUids = ['qGv1FDiX7kfvnA93vC4lybnz4B02','j1syEYlWAmVUIGPdDecVNDFUy9j1','uf1yEUp6VXXLSRzuiUUw1JkwNQC3','QSSPwGwSu3bQVvzIhvKjFGitWAP2','e8cuO9QQ2hhYvij86vISLXMdmon2','Oa05CQx0AubnoVNrvpZn1aRTZtJ3','RLLvKJpoDEgwln07QNYh9qffzD33','c9chx9QhvRTKZYxZd9eU36xabUQ2'];
          runRetroactiveStaffMatchingScan(targetUids);
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
  list.innerHTML = '<p>Başvurular ve Eşleşmeler yükleniyor...</p>';

  try {
    // 1. Fetch all job requests (active ads)
    const jobsRef = window.firebaseFirestore.collection(window.db, 'jobRequests');
    const jobsSnap = await window.firebaseFirestore.getDocs(jobsRef);
    let jobsArray = [];
    jobsSnap.forEach(doc => jobsArray.push({ id: doc.id, ...doc.data() }));
    jobsArray.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (jobsArray.length === 0) {
      list.innerHTML = '<p>Sistemde henüz hiç iş ilanı yok.</p>';
      return;
    }

    // 2. Fetch all job applications
    const appsRef = window.firebaseFirestore.collection(window.db, 'jobApplications');
    const appsSnap = await window.firebaseFirestore.getDocs(appsRef);
    let appsArray = [];
    appsSnap.forEach(doc => appsArray.push({ id: doc.id, ...doc.data() }));

    // 3. Fetch all workers for matching
    const usersRef = window.firebaseFirestore.collection(window.db, 'users');
    const qWorkers = window.firebaseFirestore.query(usersRef, window.firebaseFirestore.where('userType', '==', 'worker'));
    const workersSnap = await window.firebaseFirestore.getDocs(qWorkers);
    let workersArray = [];
    workersSnap.forEach(doc => workersArray.push({ id: doc.id, ...doc.data() }));

    let html = '';
    
    jobsArray.forEach(job => {
      // Find applications for this job
      const jobApps = appsArray.filter(app => app.jobId === job.id);
      
      // Find possible matches for this job (strict matching, case-insensitive)
      const possibleMatches = workersArray.filter(worker => {
        // Map job roles from restaurant select to worker checkbox values
        const roleMap = {
          "Garson": "garson",
          "Komi": "komi",
          "Şef Garson": "sef-garson",
          "Aşçı": "asci",
          "Bulaşıkçı": "bulasikci",
          "Host/Hostes": "host",
          "Barista": "barista",
          "Diğer": "diger"
        };
        
        const mappedJobRole = roleMap[job.jobRole] || (job.jobRole || "").toLowerCase().trim();
        const workerJobs = worker.jobs || [];
        const hasRole = workerJobs.includes(mappedJobRole) || workerJobs.includes((job.jobRole || "").toLowerCase().trim());

        // Match district case-insensitively
        const jobDistLower = (job.restaurantDistrict || "").toLowerCase().trim();
        const workerDistLower = (worker.employeeDistrict || "").toLowerCase().trim();
        const hasSameDistrict = workerDistLower === jobDistLower;

        const wantsWhatsApp = worker.whatsapp === 'yes';
        
        // Exclude workers who have already applied
        const alreadyApplied = jobApps.some(app => app.workerId === worker.id);

        return hasRole && hasSameDistrict && wantsWhatsApp && !alreadyApplied;
      });

      const dateStr = job.createdAt && typeof job.createdAt.toDate === 'function' ? job.createdAt.toDate().toLocaleString('tr-TR') : '';

      html += `
        <div class="card" style="border: 2px solid #1064ac; margin-bottom: 20px; padding: 15px; text-align: left; width: 100%; box-sizing: border-box;">
          <h2 style="margin-top:0; color: #1064ac;">İlan: ${job.jobRole}</h2>
          <p><strong>İşletme:</strong> ${job.restaurantName} (${job.restaurantDistrict})</p>
          <p><small>Tarih: ${dateStr} | Durum: ${job.status}</small></p>
          
          <h3 style="margin-top:15px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Gelen Başvurular (${jobApps.length})</h3>
      `;

      if (jobApps.length === 0) {
         html += `<p style="color:gray; font-size: 14px;">Henüz bu ilana gelen bir başvuru yok.</p>`;
      } else {
        jobApps.forEach(app => {
          const appDate = app.createdAt && typeof app.createdAt.toDate === 'function' ? app.createdAt.toDate().toLocaleString('tr-TR') : '';
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
                <a href="${waLink}" target="_blank" class="btn secondary" style="padding: 4px 8px; font-size:12px; text-decoration:none; background-color:#25D366; color:white;">WhatsApp İle Yaz</a>
                <a href="${telLink}" class="btn secondary" style="padding: 4px 8px; font-size:12px; text-decoration:none; background-color:#34b7f1; color:white;">Ara</a>
              </p>
              <p style="margin: 0 0 8px 0;"><small>Başvuru Tarihi: ${appDate}</small></p>
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
      }

      html += `<h3 style="margin-top:25px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color:#28a745;">Olası Eşleşmeler (${possibleMatches.length})</h3>`;
      
      if (possibleMatches.length === 0) {
         html += `<p style="color:gray; font-size: 14px;">Bu ilanın kriterlerine (${job.jobRole} - ${job.restaurantDistrict}) uyan işçi bulunamadı.</p>`;
      } else {
         possibleMatches.forEach(worker => {
            html += `
              <div class="application-card" style="margin-top: 15px; background: #f0fff4; padding: 10px; border-radius: 8px; border: 1px solid #c3e6cb;">
                <p style="margin: 0 0 8px 0;"><strong>İşçi:</strong> ${worker.employeeName} (${worker.employeeDistrict})</p>
                <p style="margin: 0 0 8px 0;"><strong>Eğitim / Deneyim:</strong> ${worker.education || 'Bilinmiyor'}</p>
                <p style="margin: 0 0 8px 0;"><strong>Müsait Günler:</strong> ${worker.availableDays ? worker.availableDays.join(', ') : 'Bilinmiyor'}</p>
                <p style="margin: 0 0 8px 0;"><strong>Müsait Saatler:</strong> ${worker.availableHours ? worker.availableHours.join(', ') : 'Bilinmiyor'}</p>
                <div style="margin-top: 10px;">
                  <button class="btn primary" id="wa_btn_${worker.id}_${job.id}" style="width:auto; padding: 6px 12px; font-size:13px; background-color:#25D366; color:white; border:none;" onclick="triggerWhatsAppNotification('${job.id}', '${worker.id}')">
                    📱 Bildirim Gönder (WhatsApp)
                  </button>
                  <span id="wa_status_${worker.id}_${job.id}" style="margin-left: 10px; font-size: 13px; color: #555;"></span>
                </div>
              </div>
            `;
         });
      }

      html += `</div>`; // Close job card
    });

    list.innerHTML = html;

    // --- Render All Workers List ---
    const workersList = document.getElementById('adminWorkersList');
    if (workersList) {
      workersList.classList.remove('hidden');
      if (workersArray.length === 0) {
        workersList.innerHTML = '<p>Sistemde henüz kayıtlı işçi yok.</p>';
      } else {
        let workersHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">';
        workersArray.forEach(worker => {
          const daysStr = worker.availableDays ? worker.availableDays.join(', ') : 'Belirtilmedi';
          const hoursStr = worker.availableHours ? worker.availableHours.join(', ') : 'Belirtilmedi';
          const jobsStr = worker.jobs ? worker.jobs.join(', ') : 'Belirtilmedi';
          const phoneStr = worker.employeePhone || 'Belirtilmedi';
          workersHtml += `
            <div class="card" style="padding: 15px; border: 1px solid #ddd; text-align: left; background: #fff;">
              <h3 style="margin-top:0; color:#1d4ed8;">${worker.employeeName || 'İsimsiz'}</h3>
              <p style="margin:5px 0;"><strong>Telefon:</strong> ${phoneStr}</p>
              <p style="margin:5px 0;"><strong>İlçe:</strong> ${worker.employeeDistrict || 'Belirtilmedi'}</p>
              <p style="margin:5px 0;"><strong>Yapabileceği İşler:</strong> ${jobsStr}</p>
              <p style="margin:5px 0;"><strong>Müsait Günler:</strong> ${daysStr}</p>
              <p style="margin:5px 0;"><strong>Müsait Saatler:</strong> ${hoursStr}</p>
            </div>
          `;
        });
        workersHtml += '</div>';
        workersList.innerHTML = workersHtml;
      }
    }

  } catch (e) {
    console.error(e);
    list.innerHTML = '<p>Veriler yüklenirken hata oluştu.</p>';
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

async function triggerWhatsAppNotification(jobId, workerId) {
  const btn = document.getElementById(`wa_btn_${workerId}_${jobId}`);
  const statusSpan = document.getElementById(`wa_status_${workerId}_${jobId}`);
  
  if (!confirm("Bu işçiye WhatsApp üzerinden resmi ilan bildirimi gönderilecek. Onaylıyor musunuz?")) {
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Gönderiliyor...";
  }
  if (statusSpan) statusSpan.textContent = "İşlem yapılıyor...";

  try {
    const sendWhatsAppPush = window.firebaseFunctions.httpsCallable(window.functions, 'sendWhatsAppPush');
    const result = await sendWhatsAppPush({ jobId, workerId });
    
    if (statusSpan) {
      statusSpan.textContent = "✅ Başarıyla Gönderildi!";
      statusSpan.style.color = "green";
    }
    if (btn) {
      btn.textContent = "Tekrar Gönder";
      btn.disabled = false;
    }
  } catch (error) {
    console.error("WhatsApp Push Hatası:", error);
    if (statusSpan) {
      statusSpan.textContent = "❌ Hata: " + (error.message || "Bilinmeyen bir hata oluştu.");
      statusSpan.style.color = "red";
    }
    if (btn) {
      btn.textContent = "Tekrar Dene";
      btn.disabled = false;
    }
  }
}

async function runRetroactiveStaffMatchingScan(specificUids = null) {
  const statusEl = document.getElementById('matchingScanStatus');
  if (statusEl) {
    statusEl.className = 'auth-message info';
    statusEl.textContent = '🔄 Eşleştirme taraması başlatılıyor...';
    statusEl.classList.remove('hidden');
  }

  try {
    const usersRef = window.firebaseFirestore.collection(window.db, 'users');
    const qWorkers = window.firebaseFirestore.query(usersRef, window.firebaseFirestore.where('userType', '==', 'worker'));
    const workersSnap = await window.firebaseFirestore.getDocs(qWorkers);
    
    let workersToScan = [];
    workersSnap.forEach(doc => {
      if (!specificUids || specificUids.includes(doc.id)) {
        workersToScan.push({ id: doc.id, ...doc.data() });
      }
    });

    if (workersToScan.length === 0) {
      if (statusEl) statusEl.textContent = 'Tarama için uygun çalışan bulunamadı.';
      return;
    }

    const staffRef = window.firebaseFirestore.collection(window.db, 'restaurantStaff');
    const staffSnap = await window.firebaseFirestore.getDocs(staffRef);
    let allStaff = [];
    staffSnap.forEach(doc => allStaff.push({ id: doc.id, ...doc.data() }));

    let updatedCount = 0;
    let matchedDetails = [];

    for (const worker of workersToScan) {
      const normWorkerPhone = typeof normalizePhone === 'function' ? normalizePhone(worker.employeePhone || worker.phone) : (worker.employeePhone || worker.phone || '');
      if (!normWorkerPhone) continue;

      for (const staff of allStaff) {
        const normStaffPhone = typeof normalizePhone === 'function' ? normalizePhone(staff.phone) : (staff.phone || '');
        if (normStaffPhone && normStaffPhone === normWorkerPhone) {
          if (staff.vardiyanUserId !== worker.id) {
            await window.firebaseFirestore.updateDoc(
              window.firebaseFirestore.doc(window.db, 'restaurantStaff', staff.id),
              { vardiyanUserId: worker.id }
            );
            updatedCount++;
            matchedDetails.push(`✅ ${staff.name} (${staff.phone}) -> ${worker.employeeName || worker.email} [${worker.id}] bağlandı.`);
          }
        }
      }
    }

    if (statusEl) {
      statusEl.className = 'auth-message success';
      if (updatedCount > 0) {
        statusEl.innerHTML = `🎉 <strong>Tarama Tamamlandı!</strong> Toplam <strong>${updatedCount}</strong> personel kaydı çalışan hesaplarıyla eşleştirildi.<br><br>` + matchedDetails.join('<br>');
      } else {
        statusEl.textContent = '✅ Tarama tamamlandı: Belirtilen 8 çalışan (ve diğer çalışanlar) için tüm restoran kayıtları zaten eşleştirilmiş durumda!';
      }
    }
    console.log("Retroactive matching scan completed. Updated count:", updatedCount);
  } catch (error) {
    console.error("Matching scan error:", error);
    if (statusEl) {
      statusEl.className = 'auth-message error';
      statusEl.textContent = 'Hata: ' + (error.message || 'Eşleştirme sırasında bir hata oluştu.');
    }
  }
}
