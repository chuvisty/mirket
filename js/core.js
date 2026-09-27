async function includeHTML(file, elementId) {
    const timestamp = new Date().getTime();
    const response = await fetch(`${file}?v=${timestamp}`, { cache: "no-store" });
    const text = await response.text();
    const el = document.getElementById(elementId);
    if (el) {
        el.innerHTML = text;
    }
}

async function initApp() {
  await includeHTML("header.html", "headerContainer");
  await includeHTML("footer.html", "footerContainer");
  window.authInitialized = false;
  await initFirebase();
  initHeaderAuthLink();
  initAuthStateListener();
  
  if (typeof initAuthPage === 'function') initAuthPage();
  if (typeof initAccountPage === 'function') initAccountPage();
  if (typeof initJobRequestPage === 'function') initJobRequestPage();
  if (typeof initWorkerFeedPage === 'function') initWorkerFeedPage();
  if (typeof initAdminPage === 'function') initAdminPage();
  if (typeof initGozcuPage === 'function') initGozcuPage();

  // Initialize PWA installer across all pages
  if (!document.getElementById('pwaInstallScript')) {
    const pwaScript = document.createElement('script');
    pwaScript.id = 'pwaInstallScript';
    pwaScript.src = '/js/pwa-install.js';
    pwaScript.defer = true;
    document.body.appendChild(pwaScript);
  }
}

document.addEventListener('DOMContentLoaded', initApp);

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  const str = String(value)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, function(chr) { return chr.toUpperCase(); });
  return escapeHTML(str);
}

function toggleMenu() {
  document.getElementById("navLinks")?.classList.toggle("active");
}

function goHome() {
  window.location.href = "index.html";
}

function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  let digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('90')) {
    digits = digits.substring(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

const TURKEY_CITIES = {
  "İstanbul": ["Kadıköy", "Beşiktaş", "Şişli", "Üsküdar", "Bakırköy", "Beyoğlu", "Maltepe", "Ataşehir", "Sarıyer", "Fatih", "Ümraniye", "Pendik", "Kartal", "Beylikdüzü", "Esenyurt", "Başakşehir", "Diğer"],
  "Ankara": ["Çankaya", "Keçiören", "Yenimahalle", "Mamak", "Etimesgut", "Sincan", "Altındağ", "Gölbaşı", "Pursaklar", "Diğer"],
  "İzmir": ["Konak", "Karşıyaka", "Bornova", "Buca", "Bayraklı", "Çiğli", "Gaziemir", "Balçova", "Narlıdere", "Karabağlar", "Torbalı", "Menemen", "Urla", "Çeşme", "Diğer"],
  "Bursa": ["Nilüfer", "Osmangazi", "Yıldırım", "Mudanya", "Gemlik", "İnegöl", "Gürsu", "Kestel", "Diğer"],
  "Antalya": ["Muratpaşa", "Konyaaltı", "Kepez", "Alanya", "Manavgat", "Serik", "Kemer", "Kaş", "Diğer"],
  "Adana": ["Seyhan", "Çukurova", "Yüreğir", "Sarıçam", "Ceyhan", "Kozan", "Diğer"],
  "Konya": ["Selçuklu", "Meram", "Karatay", "Ereğli", "Akşehir", "Beyşehir", "Diğer"],
  "Şanlıurfa": ["Haliliye", "Eyyübiye", "Karaköprü", "Siverek", "Viranşehir", "Birecik", "Suruç", "Diğer"],
  "Gaziantep": ["Şahinbey", "Şehitkamil", "Nizip", "İslahiye", "Oğuzeli", "Nurdağı", "Araban", "Diğer"],
  "Kocaeli": ["İzmit", "Gebze", "Darıca", "Körfez", "Gölcük", "Derince", "Çayırova", "Kartepe", "Başiskele", "Karamürsel", "Kandıra", "Dilovası", "Diğer"],
  "Aksaray": ["Merkez", "Ağaçören", "Eskil", "Gülağaç", "Güzelyurt", "Ortaköy", "Sarıyahşi", "Sultanhanı", "Diğer"]
};

function populateCitySelect(citySelectEl, defaultCity = '') {
  if (!citySelectEl) return;
  citySelectEl.innerHTML = '<option value="">İl Seçiniz</option>' + 
    Object.keys(TURKEY_CITIES).map(c => `<option value="${escapeHTML(c)}" ${c === defaultCity ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');
}

function updateDistrictSelect(city, districtSelectEl, defaultDistrict = '') {
  if (!districtSelectEl) return;
  districtSelectEl.innerHTML = '<option value="">İlçe Seçiniz</option>';
  if (!city || !TURKEY_CITIES[city]) return;
  TURKEY_CITIES[city].forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    if (d === defaultDistrict) opt.selected = true;
    districtSelectEl.appendChild(opt);
  });
}

