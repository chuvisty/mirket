function showAuthMessage(message, type = 'info') {
  const messageBox = document.getElementById('authMessage');
  if (!messageBox) return;
  if (!message) {
    messageBox.textContent = '';
    messageBox.className = 'auth-message hidden';
    return;
  }
  messageBox.textContent = message;
  messageBox.className = 'auth-message ' + type;
}

function updateSignupFields() {
  const userType = window.userType || 'worker';
  const restaurantFields = document.getElementById('restaurantFields');
  const employeeFields = document.getElementById('employeeFields');
  if (!restaurantFields || !employeeFields) return;

  if (window.signupStep === 1) {
    restaurantFields.classList.add('hidden');
    restaurantFields.setAttribute('hidden', '');
    restaurantFields.style.display = 'none';
    employeeFields.classList.add('hidden');
    employeeFields.setAttribute('hidden', '');
    employeeFields.style.display = 'none';
    return;
  }

  if (userType === 'restaurant') {
    restaurantFields.classList.remove('hidden');
    restaurantFields.removeAttribute('hidden');
    restaurantFields.style.display = '';
    employeeFields.classList.add('hidden');
    employeeFields.setAttribute('hidden', '');
    employeeFields.style.display = 'none';
  } else {
    restaurantFields.classList.add('hidden');
    restaurantFields.setAttribute('hidden', '');
    restaurantFields.style.display = 'none';
    employeeFields.classList.remove('hidden');
    employeeFields.removeAttribute('hidden');
    employeeFields.style.display = '';
  }
}

function toggleAuthMode() {
  if (window.authMode === 'signup') {
    window.authMode = 'login';
    window.signupStep = 1;
    window.currentUserId = null;
  } else {
    window.authMode = 'signup';
    window.signupStep = 1;
    window.currentUserId = null;
  }
  showAuthMessage('', 'info');
  if (typeof updateAuthUI === 'function') updateAuthUI();
}

function initAuthPage() {
  const authCard = document.querySelector('.auth-card');
  if (!authCard) return;

  window.authMode = 'login';
  window.userType = 'worker';
  window.signupStep = 1;
  window.currentUserId = null;
  const toggleButton = document.getElementById('toggleAuthMode');
  const submitButton = document.getElementById('authSubmit');
  const userTypeSelect = document.getElementById('userType');
  const confirmWrapper = document.getElementById('confirmPasswordWrapper');
  const userTypeWrapper = document.getElementById('userTypeWrapper');
  const signupBackButton = document.getElementById('signupBackButton');

  confirmWrapper?.classList.add('hidden');
  confirmWrapper?.style?.setProperty('display', 'none');
  userTypeWrapper?.classList.add('hidden');
  userTypeWrapper?.setAttribute('hidden', '');
  userTypeWrapper?.style?.setProperty('display', 'none');
  signupBackButton?.classList.add('hidden');
  signupBackButton?.style?.setProperty('display', 'none');

  if (toggleButton) toggleButton.addEventListener('click', toggleAuthMode);
  if (submitButton) {
      if (typeof handleAuthSubmit === 'function') {
          submitButton.addEventListener('click', handleAuthSubmit);
      }
  }
  
  if (userTypeSelect) {
    userTypeSelect.addEventListener('change', function(event) {
      window.userType = event.target.value;
      updateSignupFields();
    });
  }
  if (signupBackButton) {
    signupBackButton.addEventListener('click', function() {
      window.signupStep = 1;
      showAuthMessage('', 'info');
      if (typeof updateAuthUI === 'function') updateAuthUI();
    });
  }

  // Event listeners for conditional inputs
  document.querySelectorAll('input[name="education"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const otherInput = document.getElementById('educationOther');
      if (this.value === 'diger') {
        otherInput.style.display = '';
      } else {
        otherInput.style.display = 'none';
      }
    });
  });

  document.querySelectorAll('input[name="jobs"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const otherInput = document.getElementById('jobsOther');
      const digerChecked = document.querySelector('input[name="jobs"][value="diger"]')?.checked;
      if (otherInput) otherInput.style.display = digerChecked ? '' : 'none';
    });
  });

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
      if (typeof logoutUser === 'function') {
          logoutButton.addEventListener('click', logoutUser);
      }
  }

  if (typeof updateAuthUI === 'function') updateAuthUI();
}
