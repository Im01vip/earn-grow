const { createClient } = window.supabase;
const supabaseClient = createClient(window.ZENVIXA_CONFIG.supabaseUrl, window.ZENVIXA_CONFIG.supabaseAnonKey);

const authModal = document.querySelector('#auth-modal');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const authTitle = document.querySelector('#auth-title');
const authSubtitle = document.querySelector('#auth-subtitle');
const authSubmit = document.querySelector('#auth-submit');
const nameField = document.querySelector('#name-field');
const referralField = document.querySelector('#referral-field');
const mobileNav = document.querySelector('#mobile-nav');
const mobileMenuButton = document.querySelector('#mobile-menu-button');
const toast = document.querySelector('#toast');

let authMode = 'signup';
let currentUser = null;
let courseCatalog = [];
let toastTimer;

const fallbackCourses = [
  { slug: 'digital-growth-lab', title: 'Digital Growth Lab', category: 'Digital marketing', level: 'Beginner', description: 'Build your full-funnel marketing foundation with clarity, confidence and repeatable systems.', duration: '6 weeks', lessons: 28, accent: 'lime', featured: true },
  { slug: 'content-that-converts', title: 'Content That Converts', category: 'Content strategy', level: 'Intermediate', description: 'Turn your point of view into a content engine your audience remembers and trusts.', duration: '4 weeks', lessons: 18, accent: 'orange', featured: false },
  { slug: 'performance-marketing', title: 'Performance Marketing Sprint', category: 'Paid media', level: 'Intermediate', description: 'Make better bets with experiments, creative systems and numbers that tell the truth.', duration: '5 weeks', lessons: 22, accent: 'violet', featured: false }
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function showToast(message, isSuccess = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show${isSuccess ? ' success' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 4200);
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  if (authTitle) authTitle.textContent = isSignup ? 'Start your next chapter.' : 'Welcome back to your work.';
  if (authSubtitle) authSubtitle.textContent = isSignup ? 'Create an account and learn at your own rhythm.' : 'Log in to pick up where you left off.';
  if (authSubmit) authSubmit.innerHTML = isSignup ? 'Create account <span class="button-arrow">↗</span>' : 'Log in <span class="button-arrow">↗</span>';
  if (nameField) nameField.hidden = !isSignup;
  if (referralField) referralField.hidden = !isSignup;
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authMode === mode));
  if (authMessage) authMessage.textContent = '';
}

function openAuthModal(mode = 'signup') {
  if (!authModal) return;
  setAuthMode(mode);
  authModal.classList.add('is-open');
  authModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.querySelector('#auth-email')?.focus(), 100);
  mobileNav?.classList.remove('open');
}

function closeAuthModal() {
  authModal?.classList.remove('is-open');
  authModal?.setAttribute('aria-hidden', 'true');
}

function updateHeaderForUser(user) {
  currentUser = user;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const formData = new FormData(authForm);
  const email = formData.get('email')?.trim();
  const password = formData.get('password');
  const fullName = formData.get('name')?.trim();
  const referralCode = formData.get('referral_code')?.trim().toUpperCase();
  if (authMode === 'signup' && !referralCode) {
    authMessage.textContent = 'Referral code is required.';
    return;
  }
  if (authMode === 'signup') {
    const { data: referralValid, error: referralError } = await supabaseClient.rpc('validate_referral_code', { p_code: referralCode });
    if (referralError || referralValid !== true) {
      authMessage.textContent = 'Enter a valid User ID / referral code from your sponsor.';
      return;
    }
  }
  authSubmit.disabled = true;
  authSubmit.innerHTML = 'Working…';
  authMessage.textContent = '';

  const response = authMode === 'signup'
    ? await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName, referral_code: referralCode || null } } })
    : await supabaseClient.auth.signInWithPassword({ email, password });

  authSubmit.disabled = false;
  authSubmit.innerHTML = authMode === 'signup' ? 'Create account <span class="button-arrow">↗</span>' : 'Log in <span class="button-arrow">↗</span>';
  if (response.error) {
    authMessage.textContent = response.error.message;
    return;
  }
  if (authMode === 'signup' && !response.data.session) {
    authMessage.style.color = '#6c8830';
    authMessage.textContent = 'Account created. Check your email to confirm, then log in.';
    return;
  }
  closeAuthModal();
  showToast(authMode === 'signup' ? 'Welcome to Zenvixa. Your account is ready.' : 'Welcome back. Let’s keep moving.', true);
  if (authMode === 'login' || response.data.session) await routeAfterLogin(response.data.user);
}

async function routeAfterLogin(user) {
  const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  window.location.href = profile?.role === 'admin' ? 'admin.html' : 'dashboard.html';
}

function courseCard(course, index) {
  const accent = ['lime', 'orange', 'violet'].includes(course.accent) ? course.accent : 'lime';
  const icon = accent === 'orange' ? '◒' : accent === 'violet' ? '⌁' : '✺';
  return `<article class="course-card course-card-${accent}">
    <div class="course-card-top"><span class="pill">${escapeHtml(course.category)}</span><span class="card-number">${String(index + 1).padStart(2, '0')}</span></div>
    <div class="course-icon">${icon}</div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description)}</p>
    <div class="course-meta"><span>${escapeHtml(course.duration)}</span><span>${Number(course.lessons || 0)} lessons</span><span>${escapeHtml(course.level)}</span></div>
    <button class="card-link enroll-trigger" data-course-slug="${escapeHtml(course.slug)}">View course <span>↗</span></button>
  </article>`;
}

async function loadCourses() {
  const grid = document.querySelector('#course-grid');
  if (!grid) return;
  const { data, error } = await supabaseClient.from('courses').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
  courseCatalog = error || !data?.length ? fallbackCourses : data;
  grid.innerHTML = courseCatalog.map(courseCard).join('');
  grid.querySelectorAll('.enroll-trigger').forEach((button) => button.addEventListener('click', () => handleCourseClick(button.dataset.courseSlug)));
}

async function handleCourseClick(slug) {
  const course = courseCatalog.find((item) => item.slug === slug);
  if (!course) return;
  if (!currentUser) {
    openAuthModal('signup');
    authMessage.textContent = 'Create an account to save your place in this course.';
    return;
  }
  const { error } = await supabaseClient.from('enrollments').upsert({ user_id: currentUser.id, course_id: course.id }, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
  if (error) {
    showToast(error.message);
    return;
  }
  showToast(`You’re enrolled in ${course.title}.`, true);
}

async function loadReferralContext() {
  const referralFromUrl = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase();
  if (!referralFromUrl) return;
  const registerUrl = `register.html?ref=${encodeURIComponent(referralFromUrl)}`;
  document.querySelectorAll('a[href="register.html"]').forEach((link) => { link.href = registerUrl; });
  const authReferral = document.querySelector('#auth-referral');
  if (authReferral) authReferral.value = referralFromUrl;
  const { data, error } = await supabaseClient.rpc('get_referrer_by_code', { p_code: referralFromUrl });
  const referrer = Array.isArray(data) ? data[0] : data;
  const welcome = document.querySelector('#referral-welcome');
  if (!welcome || error || !referrer) return;
  document.querySelector('#referral-welcome-name').textContent = referrer.full_name || 'a Zenvixa member';
  welcome.hidden = false;
}

document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => {
  if (currentUser && button.closest('.header-actions')) { routeAfterLogin(currentUser); return; }
  openAuthModal(button.dataset.authMode);
}));
document.querySelector('[data-close-modal]')?.addEventListener('click', closeAuthModal);
authModal?.addEventListener('click', (event) => { if (event.target === authModal) closeAuthModal(); });
authForm?.addEventListener('submit', handleAuthSubmit);
document.querySelectorAll('.auth-tab').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAuthModal(); });
mobileMenuButton?.addEventListener('click', () => {
  const open = mobileNav.classList.toggle('open');
  mobileMenuButton.setAttribute('aria-expanded', String(open));
  mobileMenuButton.textContent = open ? '×' : '☰';
});

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) updateHeaderForUser(data.session.user);
  supabaseClient.auth.onAuthStateChange((_event, session) => { if (session?.user) updateHeaderForUser(session.user); });
  await loadCourses();
  await loadReferralContext();
  if (new URLSearchParams(window.location.search).get('login') === '1') openAuthModal('login');
})();
