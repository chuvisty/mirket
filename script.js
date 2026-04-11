
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
  window.location.href = "https://docs.google.com/forms/d/e/1FAIpQLSeus00-7yCTm2ptxPLZWcgkq6gJmvN_WZN15jlU6vOaVaEMyw/closedform";
}

function goToRestaurantRegister() {
  window.location.href = "https://forms.gle/RESTAURANT_REGISTER_LINK";
}

function goToJobRequest() {
  window.location.href = "https://docs.google.com/forms/d/e/1FAIpQLScSgKKgA5POOWRAHoIasXoLR9ZxISrn2DRGvDqB7PMm-8lV0Q/viewform?usp=publish-editor";
}

function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("active");
}

function goHome() {
  window.location.href = "index.html";
}