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

    // 3. Fetch all workers and restaurants for matching and subscription management
    const usersRef = window.firebaseFirestore.collection(window.db, 'users');
    const qWorkers = window.firebaseFirestore.query(usersRef, window.firebaseFirestore.where('userType', '==', 'worker'));
    const workersSnap = await window.firebaseFirestore.getDocs(qWorkers);
    let workersArray = [];
    workersSnap.forEach(doc => workersArray.push({ id: doc.id, ...doc.data() }));

    const qRestaurants = window.firebaseFirestore.query(usersRef, window.firebaseFirestore.where('userType', '==', 'restaurant'));
    const restSnap = await window.firebaseFirestore.getDocs(qRestaurants);
    let restaurantsArray = [];
    restSnap.forEach(doc => restaurantsArray.push({ id: doc.id, ...doc.data() }));

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

    // --- Render All Restaurants List ---
    const restaurantsList = document.getElementById('adminRestaurantsList');
    if (restaurantsList) {
      restaurantsList.classList.remove('hidden');
      if (restaurantsArray.length === 0) {
        restaurantsList.innerHTML = '<p>Sistemde henüz kayıtlı restoran yok.</p>';
      } else {
        let restHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">';
        restaurantsArray.forEach(rest => {
          const isSub = rest.isSubscribed === true || String(rest.isSubscribed).toLowerCase() === 'true';
          const subBadge = isSub 
            ? '<span style="background:#dcfce7; color:#15803d; font-size:12px; font-weight:bold; padding:3px 8px; border-radius:12px;">⭐ Vardiyan Aktif</span>'
            : '<span style="background:#fef2f2; color:#b91c1c; font-size:12px; font-weight:bold; padding:3px 8px; border-radius:12px;">❌ Vardiyan Pasif</span>';
          
          restHtml += `
            <div class="card" style="padding: 15px; border: 1px solid #ddd; text-align: left; background: #fff;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                <h3 style="margin:0; color:#1064ac;">${rest.businessName || rest.restaurantName || rest.authorizedName || 'İsimsiz Restoran'}</h3>
                ${subBadge}
              </div>
              <p style="margin:4px 0; font-size:13px;"><strong>E-posta:</strong> ${rest.email || 'Belirtilmedi'}</p>
              <p style="margin:4px 0; font-size:13px;"><strong>Telefon:</strong> ${rest.phone || rest.authorizedPhone || 'Belirtilmedi'}</p>
              <p style="margin:4px 0; font-size:12px; color:#64748b;"><strong>UID:</strong> <code>${rest.id}</code></p>
              
              <div style="margin-top: 12px; display:flex; gap:6px;">
                ${isSub 
                  ? `<button class="btn secondary" style="flex:1; padding: 5px; font-size: 11px; border-color: #dc2626; color: #dc2626;" onclick="toggleVardiyanSubscriptionForUid(false, '${rest.id}')">❌ Devre Dışı Bırak</button>`
                  : `<button class="btn primary" style="flex:1; padding: 5px; font-size: 11px; background-color: #16a34a; border-color: #16a34a;" onclick="toggleVardiyanSubscriptionForUid(true, '${rest.id}')">✅ Vardiyan Özelliğini Aç</button>`
                }
                ${rest.email ? `<button class="btn secondary" style="padding: 5px 8px; font-size: 11px; border-color: #ea580c; color: #ea580c;" onclick="startAdminImpersonationSession('${rest.email}')">🔑 Oturum</button>` : ''}
              </div>
            </div>
          `;
        });
        restHtml += '</div>';
        restaurantsList.innerHTML = restHtml;
      }
    }

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
              ${worker.email ? `<button class="btn secondary" style="margin-top: 10px; width: 100%; padding: 6px 10px; font-size: 12px; border-color: #ea580c; color: #ea580c;" onclick="startAdminImpersonationSession('${worker.email}')">🔑 Oturumuna Geç (${worker.email})</button>` : ''}
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

async function startAdminImpersonationSession(targetEmailOverride) {
  const emailInput = document.getElementById('debugTargetEmail');
  const statusEl = document.getElementById('debugImpersonationStatus');
  const targetEmail = targetEmailOverride || (emailInput ? emailInput.value.trim() : '');

  if (!targetEmail) {
    if (statusEl) {
      statusEl.textContent = 'Lütfen oturumuna geçmek istediğiniz e-posta adresini girin.';
      statusEl.className = 'auth-message warning';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = `'${targetEmail}' hesabı için oturum anahtarı üretiliyor...`;
    statusEl.className = 'auth-message info';
    statusEl.classList.remove('hidden');
  }

  try {
    const createCustomSession = window.firebaseFunctions.httpsCallable(window.functions, 'createCustomSession');
    const result = await createCustomSession({ targetEmail });

    if (result.data && result.data.customToken) {
      if (statusEl) {
        statusEl.innerHTML = `🔑 <strong>${result.data.displayName}</strong> (${result.data.userType}) hesabına geçiş yapılıyor...`;
        statusEl.className = 'auth-message success';
      }

      // Sign in with generated custom token
      await window.firebaseAuth.signInWithCustomToken(window.auth, result.data.customToken);

      setTimeout(() => {
        if (result.data.userType === 'restaurant') {
          window.location.href = 'vardiyan-gozcu.html';
        } else if (result.data.userType === 'worker') {
          window.location.href = 'account.html';
        } else {
          window.location.href = 'index.html';
        }
      }, 1200);

    } else {
      throw new Error("Geçersiz oturum yanıtı alındı.");
    }
  } catch (err) {
    console.error("Error during admin impersonation:", err);
    if (statusEl) {
      statusEl.textContent = '❌ Oturum açma hatası: ' + (err.message || 'Yetki veya hesap bulunamadı.');
      statusEl.className = 'auth-message error';
    }
  }
}

async function toggleVardiyanSubscriptionForUid(status, directUid = null) {
  const uidInput = document.getElementById('targetVardiyanUid');
  const statusEl = document.getElementById('vardiyanActivationStatus');
  const uid = directUid || (uidInput ? uidInput.value.trim() : '');

  if (!uid) {
    if (statusEl) {
      statusEl.textContent = 'Lütfen bir Kullanıcı ID (UID) giriniz.';
      statusEl.className = 'auth-message warning';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = `UID: '${uid}' için Vardiyan özelliği güncelleniyor...`;
    statusEl.className = 'auth-message info';
    statusEl.classList.remove('hidden');
  }

  try {
    const userRef = window.firebaseFirestore.doc(window.db, 'users', uid);
    const userSnap = await window.firebaseFirestore.getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error(`'${uid}' ID'li kullanıcı veritabanında bulunamadı.`);
    }

    await window.firebaseFirestore.updateDoc(userRef, {
      isSubscribed: Boolean(status),
      updatedAt: window.firebaseFirestore.Timestamp.now()
    });

    const userData = userSnap.data();
    const userName = userData.businessName || userData.restaurantName || userData.employeeName || userData.email || uid;

    if (statusEl) {
      statusEl.innerHTML = `🎉 <strong>${userName}</strong> (${uid}) kullanıcısının Vardiyan (Vardiya / Gözcü) özelliği <strong>${status ? 'AKTİFLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'}</strong>!`;
      statusEl.className = 'auth-message success';
    }

    // Refresh application & restaurant list
    setTimeout(() => {
      loadAllApplications();
    }, 1000);

  } catch (err) {
    console.error("Error toggling Vardiyan subscription:", err);
    if (statusEl) {
      statusEl.textContent = '❌ İşlem başarısız: ' + (err.message || 'Yetki veya bağlantı hatası.');
      statusEl.className = 'auth-message error';
    }
  }
}

