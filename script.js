
 async function includeHTML(file, elementId) {
        const response = await fetch(file);
        const text = await response.text();
        document.getElementById(elementId).innerHTML = text;
    }
    includeHTML("header.html", "headerContainer");
    includeHTML("footer.html", "footerContainer");

function showRestaurant() {
  document.getElementById('mainButtons').classList.add('hidden');
  document.getElementById('restaurantOptions').classList.remove('hidden');
}

function goBack() {
  document.getElementById('restaurantOptions').classList.add('hidden');
  document.getElementById('mainButtons').classList.remove('hidden');
}

function goToWorkerForm() {
  window.location.href = "https://forms.gle/gk4PvbsmrCYwwMb66";
}

function goToRestaurantRegister() {
  window.location.href = "https://forms.gle/ZUJz5sMSSaPopxYZ7";
}

function goToJobRequest() {
  window.location.href = "https://forms.gle/hXi5a64EM3V49gXN8";
}

function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("active");
}

function goHome() {
  window.location.href = "index.html";
}