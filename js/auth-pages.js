const { createClient } = window.supabase;
const supabaseClient = createClient(window.ZENVIXA_CONFIG.supabaseUrl, window.ZENVIXA_CONFIG.supabaseAnonKey);

const $ = (selector) => document.querySelector(selector);
let registeredUser = null;
let registeredSession = null;
let toastTimer;
let referralLookupTimer;

function showToast(message, success = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show${success ? ' success' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 4500);
}

function setMessage(selector, message, success = false) {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.style.color = success ? '#6c8830' : '#be5738';
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button.classList.toggle('is-visible', !visible);
  button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
}

function updateReferralPreview({ name = '', valid = false, loading = false } = {}) {
  const preview = $('#referral-preview');
  const referrerName = $('#referrer-name');
  if (!preview || !referrerName) return;
  if (!name && !loading) { preview.hidden = true; return; }
  preview.hidden = false;
  preview.classList.toggle('is-invalid', !valid && !loading);
  const icon = preview.querySelector('i');
  if (icon) icon.textContent = loading ? '…' : valid ? '✓' : '!';
  referrerName.textContent = loading ? 'Checking referral code…' : name;
}

async function lookupReferrer(code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) { updateReferralPreview(); return false; }
  updateReferralPreview({ loading: true });
  const { data, error } = await supabaseClient.rpc('get_referrer_by_code', { p_code: normalizedCode });
  const referrer = Array.isArray(data) ? data[0] : data;
  if (error || !referrer) {
    updateReferralPreview({ name: 'Invalid referral code', valid: false });
    return false;
  }
  updateReferralPreview({ name: referrer.full_name || 'Zenvixa member', valid: true });
  return true;
}

async function routeUser(user) {
  const next = new URLSearchParams(window.location.search).get('next');
  if (next === 'admin') { window.location.href = 'admin.html'; return; }
  if (next === 'dashboard') { window.location.href = 'dashboard.html'; return; }
  const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  window.location.href = profile?.role === 'admin' ? 'admin.html' : 'dashboard.html';
}

function openSuccessModal({ fullName, email, password, session, user }) {
  registeredSession = session;
  registeredUser = user;
  $('#success-name').textContent = fullName;
  $('#success-email').textContent = email;
  $('#success-password').value = password;
  $('#success-password').type = 'password';
  document.querySelector('[data-toggle-password="success-password"]')?.classList.remove('is-visible');
  const continueButton = $('#success-continue');
  continueButton.textContent = session ? 'Continue to Zenvixa ↗' : 'Continue to login ↗';
  $('#success-modal').classList.add('is-open');
  $('#success-modal').setAttribute('aria-hidden', 'false');
}

function closeSuccessModal() {
  $('#success-modal')?.classList.remove('is-open');
  $('#success-modal')?.setAttribute('aria-hidden', 'true');
  const password = $('#success-password');
  if (password) password.value = '';
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const button = $('#login-submit');
  button.disabled = true; button.textContent = 'Logging in…'; setMessage('#login-message', '');
  const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email: data.email.trim(), password: data.password });
  button.disabled = false; button.innerHTML = 'Login <span class="button-arrow">↗</span>';
  if (error) { setMessage('#login-message', error.message); return; }
  showToast('Login successful. Opening your workspace…', true);
  await routeUser(authData.user);
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (data.password.length < 6) { setMessage('#register-message', 'Password must be at least 6 characters.'); return; }
  if (data.password !== data.confirm_password) { setMessage('#register-message', 'Passwords do not match.'); return; }
  if (!data.referral_code.trim()) { setMessage('#register-message', 'Referral code is required.'); return; }
  const normalizedReferral = data.referral_code.trim().toUpperCase();
  $('#register-referral').value = normalizedReferral;
  const referrerFound = await lookupReferrer(normalizedReferral);
  if (!referrerFound) { setMessage('#register-message', 'Enter a valid User ID / referral code from your sponsor.'); return; }
  const { data: referralValid, error: referralError } = await supabaseClient.rpc('validate_referral_code', { p_code: normalizedReferral });
  if (referralError || referralValid !== true) { setMessage('#register-message', 'Enter a valid User ID / referral code from your sponsor.'); return; }
  const button = $('#register-submit');
  button.disabled = true; button.textContent = 'Creating account…'; setMessage('#register-message', '');
  const { data: authData, error } = await supabaseClient.auth.signUp({
    email: data.email.trim(),
    password: data.password,
    options: { data: { full_name: data.full_name.trim(), phone: data.phone.trim(), country: data.country, referral_code: normalizedReferral } }
  });
  button.disabled = false; button.innerHTML = 'Create account <span class="button-arrow">↗</span>';
  if (error) { setMessage('#register-message', error.message); return; }
  form.reset(); updateReferralPreview();
  openSuccessModal({ fullName: data.full_name, email: data.email, password: data.password, session: authData.session, user: authData.user });
}

document.querySelectorAll('[data-toggle-password]').forEach((button) => button.addEventListener('click', () => togglePassword(button)));
$('#login-form')?.addEventListener('submit', handleLogin);
$('#register-form')?.addEventListener('submit', handleRegister);
$('#success-continue')?.addEventListener('click', async (event) => {
  if (!registeredSession || !registeredUser) return;
  event.preventDefault();
  await routeUser(registeredUser);
});
$('#success-modal')?.addEventListener('click', (event) => { if (event.target.id === 'success-modal') closeSuccessModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSuccessModal(); });

const referralFromUrl = new URLSearchParams(window.location.search).get('ref');
const registerReferral = $('#register-referral');
registerReferral?.addEventListener('input', () => {
  clearTimeout(referralLookupTimer);
  const code = registerReferral.value.trim();
  if (!code) { updateReferralPreview(); return; }
  referralLookupTimer = setTimeout(() => lookupReferrer(code), 350);
});
registerReferral?.addEventListener('blur', () => lookupReferrer(registerReferral.value));
if (referralFromUrl && registerReferral) {
  registerReferral.value = referralFromUrl.toUpperCase();
  lookupReferrer(registerReferral.value);
}
