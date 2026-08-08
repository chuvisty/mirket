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
  
  if (typeof initAuthPage === 'function') initAuthPage();
  if (typeof initAccountPage === 'function') initAccountPage();
  if (typeof initJobRequestPage === 'function') initJobRequestPage();
  if (typeof initWorkerFeedPage === 'function') initWorkerFeedPage();
  if (typeof initAdminPage === 'function') initAdminPage();
  if (typeof initGozcuPage === 'function') initGozcuPage();
}

document.addEventListener('DOMContentLoaded', initApp);

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

function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("active");
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
