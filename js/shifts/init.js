// --- INIT: Page initialization, globals & restaurant settings loading ---
// Vardiyan Gözcü - Shift Management System
// Uses Modular JS structure like rest of the app.

let currentWeekStart = getStartOfWeek(new Date());
let staffMembers = [];
let currentShifts = [];
let restaurantId = null;
let restaurantOpeningHour = 6;
let restaurantClosingHour = 23;
let customShiftTemplates = [];
let autoEndShiftAtScheduledTime = false;
let whatsappShiftNotifications = false;

function initGozcuPage() {
  if (window.firebaseAuth?.onAuthStateChanged && window.auth) {
    window.firebaseAuth.onAuthStateChanged(window.auth, async (user) => {
    if (user) {
      restaurantId = user.uid;
      window.restaurantId = user.uid;
      const isSub = await checkSubscriptionStatus(user.uid);
      const paywallEl = document.getElementById('paywallOverlay');
      const gozcuContentEl = document.getElementById('gozcuContent');
      if (isSub) {
        if (paywallEl) paywallEl.classList.add('hidden');
        if (gozcuContentEl) gozcuContentEl.classList.remove('blurred');
        
        // Load data
        await loadRestaurantSettings();
        await loadStaff();
        await loadShiftsForCurrentWeek();
        if (typeof loadAttendanceLogs === 'function') {
          await loadAttendanceLogs(restaurantId, 'today');
        }
      } else {
        if (paywallEl) paywallEl.classList.remove('hidden');
        if (gozcuContentEl) gozcuContentEl.classList.add('blurred');
      }
    } else {
      // Redirect to login if not authenticated
      window.location.href = 'login.html';
    }
  });
  }
}

async function loadRestaurantSettings() {
  try {
    const userDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', restaurantId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      restaurantOpeningHour = data.openingHour || 6;
      restaurantClosingHour = data.closingHour || 23;
      customShiftTemplates = data.shiftTemplates || [];
      autoEndShiftAtScheduledTime = !!data.autoEndShiftAtScheduledTime;
      whatsappShiftNotifications = !!data.whatsappShiftNotifications;
      window.restaurantPin = data.pinCode || '0068';
      
      if (document.getElementById('restaurantOpeningHour')) document.getElementById('restaurantOpeningHour').value = restaurantOpeningHour;
      if (document.getElementById('restaurantClosingHour')) document.getElementById('restaurantClosingHour').value = restaurantClosingHour;
      if (document.getElementById('autoEndShiftToggle')) document.getElementById('autoEndShiftToggle').checked = autoEndShiftAtScheduledTime;
      if (document.getElementById('whatsappShiftNotificationToggle')) document.getElementById('whatsappShiftNotificationToggle').checked = whatsappShiftNotifications;
      
      if (data.location) {
        if (document.getElementById('restaurantGeofenceRadius')) {
          document.getElementById('restaurantGeofenceRadius').value = data.location.radiusMeters || 150;
        }
        const msgEl = document.getElementById('locationSaveMessage');
        if (msgEl && data.location.latitude && data.location.longitude) {
          msgEl.textContent = `📍 Tanımlı İşletme Konumu: Lat ${data.location.latitude.toFixed(4)}, Lng ${data.location.longitude.toFixed(4)} (${data.location.radiusMeters || 150}m yarıçap)`;
          msgEl.className = 'auth-message info';
          msgEl.classList.remove('hidden');
        }
      }

      renderCustomShiftTemplatesList();
      renderShiftTemplatesUI();
    }
  } catch (error) {
    console.error("Error loading restaurant settings:", error);
  }
}

async function checkSubscriptionStatus(uid) {
  try {
    const userDoc = await window.firebaseFirestore.getDoc(window.firebaseFirestore.doc(window.db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      console.log("Vardiyan Gözcü - User Data Loaded:", data); // DEBUG
      // Ensure only restaurants can access this
      if (data.userType !== 'restaurant') {
        window.location.href = 'index.html';
        return false;
      }
      // Check for boolean true or string 'true' (case insensitive)
      const isSub = data.isSubscribed === true || String(data.isSubscribed).toLowerCase() === 'true';
      console.log("Vardiyan Gözcü - isSubscribed evaluated as:", isSub); // DEBUG
      return isSub;
    }
    console.warn("Vardiyan Gözcü - User document not found for uid:", uid);
    return false;
  } catch (error) {
    console.error("Error checking subscription:", error);
    return false;
  }
}
