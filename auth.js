// ============================================
// AMBASSADOR CONNECT — AUTH
// ============================================

// Check if already logged in
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    window.location.href = 'dashboard.html';
  }
})();

function toggleAuthMode(mode) {
  const loginCard = document.getElementById('loginCard');
  const signupCard = document.getElementById('signupCard');
  if (mode === 'login') {
    loginCard.style.display = '';
    signupCard.style.display = 'none';
  } else {
    loginCard.style.display = 'none';
    signupCard.style.display = '';
  }
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span style="opacity:0.6">Please wait...</span>'
    : btn.dataset.label || btn.innerHTML;
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');

  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<span style="opacity:0.6">Signing in...</span>';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = error.message || 'Invalid email or password.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In</span>';
    return;
  }

  successEl.textContent = 'Signed in! Redirecting...';
  successEl.style.display = 'block';
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
}

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errorEl = document.getElementById('signupError');

  errorEl.style.display = 'none';

  if (!name || !email || !password) {
    errorEl.textContent = 'All fields are required.';
    errorEl.style.display = 'block';
    return;
  }

  if (password.length < 8) {
    errorEl.textContent = 'Password must be at least 8 characters.';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.innerHTML = '<span style="opacity:0.6">Creating account...</span>';

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, role: 'sales' }
    }
  });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<span>Create Account</span>';
    return;
  }

  // Show success, redirect
  errorEl.style.display = 'none';
  const successDiv = document.createElement('div');
  successDiv.className = 'alert alert-success';
  successDiv.textContent = 'Account created! Please check your email to verify, then sign in.';
  document.getElementById('signupCard').insertBefore(successDiv, document.getElementById('signupCard').firstChild);
  btn.disabled = false;
  btn.innerHTML = '<span>Create Account</span>';

  setTimeout(() => toggleAuthMode('login'), 3000);
}

// Allow Enter key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const loginCard = document.getElementById('loginCard');
    if (loginCard && loginCard.style.display !== 'none') {
      handleLogin();
    } else {
      handleSignup();
    }
  }
});
