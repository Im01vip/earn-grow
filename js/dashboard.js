const { createClient } = window.supabase;
const supabaseClient = createClient(window.ZENVIXA_CONFIG.supabaseUrl, window.ZENVIXA_CONFIG.supabaseAnonKey);

let currentUser;
let currentProfile;
let courseCatalog = [];
let enrollmentRows = [];
let walletRows = [];
let withdrawalRows = [];
let activationRows = [];
let currentKycSubmission;
let currentKycChangeRequest;
let courseQuery = '';
let courseCategory = 'all';
let courseLanguage = 'all';
let toastTimer;

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function initials(name = 'Zenvixa') {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function money(value = 0) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function dateLabel(value) {
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function getReferralLink(code = '') {
  if (!code) return '';
  const isZenvixaDomain = /(^|\.)zenvixa\.pro$/i.test(window.location.hostname);
  const baseUrl = isZenvixaDomain ? window.location.origin : 'https://zenvixa.pro';
  return `${baseUrl}/index.html?ref=${encodeURIComponent(code)}`;
}

function showToast(message, success = false) {
  const toast = $('#toast');
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

function switchSection(section) {
  document.querySelectorAll('.member-section').forEach((element) => element.classList.toggle('active', element.id === `section-${section}`));
  document.querySelectorAll('[data-section]').forEach((element) => element.classList.toggle('active', element.dataset.section === section));
  $('#member-sidebar')?.classList.remove('open');
  history.replaceState(null, '', `#${section}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProfileUI() {
  const name = currentProfile.full_name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Learner';
  const avatar = initials(name);
  document.querySelectorAll('#header-name, #sidebar-name, #profile-display-name').forEach((element) => { element.textContent = name; });
  $('#header-user-name').textContent = name;
  $('#header-user-name').title = currentUser.email || '';
  $('#sidebar-email').textContent = currentUser.email || '';
  $('#header-avatar').textContent = avatar;
  $('#sidebar-avatar').textContent = avatar;
  $('#profile-avatar').textContent = avatar;
  $('#profile-display-email').textContent = currentUser.email || '';
  $('#profile-full-name').value = name;
  $('#profile-phone').value = currentProfile.phone || '';
  $('#profile-referral-code').textContent = currentProfile.referral_code || '—';
  $('#referral-code').textContent = currentProfile.referral_code || '—';
  $('#referral-link').value = getReferralLink(currentProfile.referral_code);
  const teamReferralCode = $('#team-referral-code');
  if (teamReferralCode) teamReferralCode.textContent = currentProfile.referral_code || '—';
  $('#profile-active-tag').textContent = currentProfile.is_active ? 'Active ID' : 'Inactive ID';
  $('#profile-active-tag').classList.toggle('is-active', currentProfile.is_active);
}

function renderCourseSummary() {
  const element = $('#overview-enrolled');
  if (element) element.textContent = enrollmentRows.length;
}

function ensureCourseTools() {
  const section = $('#section-courses');
  const heading = section?.querySelector('.member-section-heading');
  if (!section || !heading || $('#course-toolbar')) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'course-toolbar';
  toolbar.className = 'course-toolbar';
  toolbar.innerHTML = '<div><span class="mono-label">YOUR LIBRARY</span><strong id="course-result-count">Loading courses…</strong><small>Choose Hindi or English. Every book opens as a complete PDF.</small></div><div class="course-toolbar-actions"><div class="course-language-tabs" role="tablist" aria-label="Course language"><button type="button" class="course-language-tab active" data-course-language="all">All</button><button type="button" class="course-language-tab" data-course-language="English">English</button><button type="button" class="course-language-tab" data-course-language="Hindi">Hindi</button></div><label class="course-search"><span>⌕</span><input id="course-search" type="search" placeholder="Search courses" aria-label="Search courses" /></label><select id="course-category-filter" aria-label="Filter courses by category"><option value="all">All categories</option></select></div>';
  heading.insertAdjacentElement('afterend', toolbar);
  $('#course-search').addEventListener('input', (event) => { courseQuery = event.target.value.trim().toLowerCase(); renderCourses(); });
  $('#course-category-filter').addEventListener('change', (event) => { courseCategory = event.target.value; renderCourses(); });
  document.querySelectorAll('[data-course-language]').forEach((button) => button.addEventListener('click', () => { courseLanguage = button.dataset.courseLanguage; renderCourses(); }));
}

function inferCourseLanguage(course) {
  return /hindi/i.test(`${course.language || ''} ${course.title || ''} ${course.pdf_path || ''}`) ? 'Hindi' : 'English';
}

function filteredCourses() {
  return courseCatalog.filter((course) => {
    const matchesCategory = courseCategory === 'all' || course.category === courseCategory;
    const matchesLanguage = courseLanguage === 'all' || inferCourseLanguage(course) === courseLanguage;
    const haystack = `${course.title} ${course.description} ${course.category} ${inferCourseLanguage(course)}`.toLowerCase();
    return matchesCategory && matchesLanguage && (!courseQuery || haystack.includes(courseQuery));
  });
}

function renderCourseFilters() {
  const select = $('#course-category-filter');
  if (!select) return;
  const categories = ['all', ...new Set(courseCatalog.map((course) => course.category).filter(Boolean))];
  select.innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}">${category === 'all' ? 'All categories' : escapeHtml(category)}</option>`).join('');
  select.value = categories.includes(courseCategory) ? courseCategory : 'all';
  courseCategory = select.value;
  document.querySelectorAll('[data-course-language]').forEach((button) => button.classList.toggle('active', button.dataset.courseLanguage === courseLanguage));
  const count = $('#course-result-count');
  if (count) count.textContent = `${filteredCourses().length} of ${courseCatalog.length} courses`;
}

function courseCoverFallback(element, message = '') {
  element.classList.remove('is-loading');
  element.classList.add('is-fallback');
  const status = element.querySelector('.course-cover-status');
  if (status && message) status.textContent = message;
}

async function renderCourseCover(element) {
  if (!element || element.dataset.loaded) return;
  const course = courseCatalog.find((item) => item.id === element.dataset.courseCover);
  if (!course?.pdf_path || !window.pdfjsLib) { courseCoverFallback(element); return; }
  element.dataset.loaded = 'true';
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const { data, error } = await supabaseClient.storage.from('course-pdfs').createSignedUrl(course.pdf_path, 600);
    if (error || !data?.signedUrl) throw error || new Error('Cover preview unavailable');
    const loading = element.querySelector('.course-cover-loading');
    if (loading) loading.hidden = false;
    const pdf = await window.pdfjsLib.getDocument({ url: data.signedUrl, disableAutoFetch: true, disableStream: true }).promise;
    const page = await pdf.getPage(1);
    const canvas = element.querySelector('canvas');
    const baseViewport = page.getViewport({ scale: 1 });
    element.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
    const targetWidth = Math.max(360, Math.min(900, element.clientWidth * 2));
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
    element.classList.add('has-pdf-cover');
    if (loading) loading.hidden = true;
    await pdf.destroy();
  } catch (error) {
    element.dataset.loaded = 'fallback';
    courseCoverFallback(element, 'Open full PDF to view this book');
  }
}

function hydrateCourseCovers() {
  const covers = [...document.querySelectorAll('[data-course-cover]')];
  if (!covers.length) return;
  if (!('IntersectionObserver' in window)) { covers.forEach((cover) => renderCourseCover(cover)); return; }
  const observer = new IntersectionObserver((entries, instance) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => { instance.unobserve(entry.target); renderCourseCover(entry.target); });
  }, { rootMargin: '280px' });
  covers.forEach((cover) => observer.observe(cover));
}

function ensureDashboardEnhancements() {
  const progressCard = $('#overview-progress')?.closest('.member-stat-card') || $('#overview-enrolled')?.closest('.member-stat-card');
  if (progressCard) {
    progressCard.querySelector(':scope > span:first-child').textContent = 'Enrolled courses';
    progressCard.querySelector('strong').innerHTML = '<b id="overview-enrolled">0</b>';
    progressCard.querySelector(':scope > small').textContent = 'In your learning library';
  }

  const manualDepositCard = $('#deposit-form')?.closest('.settings-card');
  if (manualDepositCard) {
    manualDepositCard.parentElement.classList.add('wallet-grid-single');
    manualDepositCard.remove();
  }
  $('#section-team .team-referral-share')?.remove();
  ensureCourseTools();

  const kycChip = $('#kyc-status-chip');
  if (kycChip && !$('#kyc-rejection-message')) {
    const message = document.createElement('p');
    message.id = 'kyc-rejection-message';
    message.className = 'kyc-rejection-message';
    message.hidden = true;
    kycChip.insertAdjacentElement('afterend', message);
  }

  const withdrawalForm = $('#withdrawal-form');
  if (withdrawalForm && !withdrawalForm.querySelector('.withdrawal-rules')) {
    const note = document.createElement('p');
    note.className = 'withdrawal-rules';
    note.textContent = 'Minimum ₹100 · 5% TDS / platform fee · Active ID + approved KYC required · One pending request at a time.';
    withdrawalForm.insertBefore(note, withdrawalForm.firstElementChild);
    withdrawalForm.querySelector('input[name="amount"]').min = '100';
  }
  const withdrawalAmount = withdrawalForm?.querySelector('input[name="amount"]');
  if (withdrawalAmount && !withdrawalAmount.dataset.previewBound) {
    withdrawalAmount.dataset.previewBound = 'true';
    withdrawalAmount.addEventListener('input', updateWithdrawalPreview);
  }

  const profileSection = $('#section-profile');
  if (profileSection && !$('#password-form')) {
    const passwordCard = document.createElement('div');
    passwordCard.className = 'settings-card password-card';
    passwordCard.innerHTML = `<div class="settings-intro"><span class="settings-icon">⌁</span><div><h3>Change password</h3><p>Keep your account secure with a password only you know.</p></div></div><form id="password-form"><div class="profile-form-grid"><label class="form-field"><span>New password</span><input name="password" type="password" minlength="6" autocomplete="new-password" required placeholder="At least 6 characters" /></label><label class="form-field"><span>Confirm password</span><input name="confirm_password" type="password" minlength="6" autocomplete="new-password" required placeholder="Repeat new password" /></label></div><button class="button button-dark" type="submit">Update password <span class="button-arrow">↗</span></button><p class="form-message" id="password-message" role="status"></p></form>`;
    profileSection.appendChild(passwordCard);

    const infoCard = document.createElement('div');
    infoCard.className = 'settings-card member-info-card';
    infoCard.innerHTML = '<div class="settings-intro"><span class="settings-icon">i</span><div><h3>Help & platform information</h3><p>Review the rules before activating your ID, earning commissions or requesting a payout.</p></div></div><div class="member-info-links"><a href="policies.html">Terms, privacy & payout policy <span>↗</span></a><a href="mailto:support@zenvixa.pro">Contact support <span>↗</span></a></div>';
    profileSection.appendChild(infoCard);
  }

  const overview = $('#section-overview');
  if (overview && !$('#member-activity-feed')) {
    const heading = document.createElement('div');
    heading.className = 'member-section-heading compact-heading';
    heading.innerHTML = '<div><div class="eyebrow"><span class="eyebrow-dot"></span> Account timeline</div><h3>Recent activity</h3></div><span class="section-note">Latest updates</span>';
    const feed = document.createElement('div');
    feed.id = 'member-activity-feed';
    feed.className = 'member-activity-card';
    feed.innerHTML = '<div class="activity-empty">Your latest account activity will appear here.</div>';
    overview.append(heading, feed);
  }

  const statTargets = [
    ['#overview-balance', 'wallet'],
    ['#overview-team', 'team'],
    ['#overview-enrolled', 'courses'],
    ['#overview-kyc', 'kyc']
  ];
  statTargets.forEach(([selector, section]) => {
    const card = $(selector)?.closest('.member-stat-card');
    if (!card || card.dataset.linked) return;
    card.dataset.linked = 'true';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.addEventListener('click', () => switchSection(section));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); switchSection(section); } });
  });
}

function setActivationState() {
  const active = Boolean(currentProfile.is_active);
  $('#activation-banner').hidden = active;
  $('#active-banner').hidden = !active;
  $('#course-access-lock').hidden = true;
  $('#course-access-note').textContent = 'Open to all logged-in users';
  $('#course-access-note').classList.add('success-note');
}

function courseCard(course) {
  const accent = ['lime', 'orange', 'violet'].includes(course.accent) ? course.accent : 'lime';
  const icon = accent === 'orange' ? '◒' : accent === 'violet' ? '⌁' : '✺';
  const language = inferCourseLanguage(course);
  return `<article class="dashboard-course-card dashboard-course-${accent}"><div class="course-cover course-open-cover" data-course-cover="${escapeHtml(course.id)}" data-course-id="${escapeHtml(course.id)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(course.title)} PDF"><div class="course-cover-placeholder"><span class="course-cover-kicker">ZENVIXA · ${escapeHtml(language)}</span><i>${icon}</i><small class="course-cover-status">Loading cover…</small></div><canvas aria-hidden="true"></canvas><span class="course-cover-loading" hidden>Loading cover…</span></div></article>`;
}

function renderCourses() {
  renderCourseFilters();
  const availableCourses = filteredCourses();
  const languages = ['English', 'Hindi'].filter((language) => courseLanguage === 'all' || courseLanguage === language);
  const html = languages.map((language) => {
    const courses = availableCourses.filter((course) => inferCourseLanguage(course) === language);
    const label = language === 'Hindi' ? 'हिंदी LIBRARY' : 'ENGLISH LIBRARY';
    const emptyMessage = courseQuery || courseCategory !== 'all' ? `No ${language} books match your filters.` : `No ${language} books are available yet.`;
    return `<section class="course-language-group"><div class="course-group-heading"><div><span class="mono-label">${label}</span><h3>${language} courses</h3></div><span class="course-group-count">${courses.length} ${courses.length === 1 ? 'book' : 'books'}</span></div>${courses.length ? `<div class="dashboard-course-grid dashboard-course-grid-wide course-language-grid">${courses.map(courseCard).join('')}</div>` : `<div class="dashboard-loading">${emptyMessage}</div>`}</section>`;
  }).join('');
  $('#dashboard-course-grid').innerHTML = html || '<div class="dashboard-loading">No courses match your search.</div>';
  $('#overview-course-grid').innerHTML = courseCatalog.slice(0, 2).map(courseCard).join('') || '<div class="dashboard-loading">No courses yet.</div>';
  document.querySelectorAll('[data-activate]').forEach((button) => button.addEventListener('click', startActivation));
  document.querySelectorAll('.course-open-cover').forEach((cover) => {
    cover.addEventListener('click', () => openCourse(cover.dataset.courseId));
    cover.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCourse(cover.dataset.courseId); } });
  });
  hydrateCourseCovers();
}

async function loadCourses() {
  const { data, error } = await supabaseClient.from('courses').select('*').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: true });
  if (error) { showToast(error.message); return; }
  courseCatalog = data || [];
  renderCourses();
}

async function loadEnrollments() {
  const { data, error } = await supabaseClient.from('enrollments').select('course_id, progress, status, enrolled_at').eq('user_id', currentUser.id).order('enrolled_at', { ascending: false });
  if (error) { showToast(error.message); return; }
  enrollmentRows = data || [];
  renderCourseSummary();
}

async function openCourse(courseId) {
  const course = courseCatalog.find((item) => item.id === courseId);
  if (!course) return;
  if (currentProfile.is_active) {
    const { error: enrollmentError } = await supabaseClient.from('enrollments').upsert({ user_id: currentUser.id, course_id: course.id }, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
    if (enrollmentError) { showToast(enrollmentError.message); return; }
    await loadEnrollments();
  }
  if (!course.pdf_path) { showToast('This course PDF is not uploaded yet.'); return; }
  const { data, error } = await supabaseClient.storage.from('course-pdfs').createSignedUrl(course.pdf_path, 600);
  if (error) { showToast(error.message); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

async function startActivation() {
  const button = $('#activate-button');
  if (button) { button.disabled = true; button.textContent = 'Creating secure order…'; }
  const { data, error } = await supabaseClient.functions.invoke('create-razorpay-order', { body: {} });
  if (button) { button.disabled = false; button.innerHTML = 'Activate ID · ₹500 <span class="button-arrow">↗</span>'; }
  if (error || data?.error) { showToast(data?.error || error?.message || 'Unable to start payment.'); return; }
  if (!window.Razorpay) { showToast('Razorpay checkout could not load.'); return; }
  const checkout = new window.Razorpay({
    key: data.keyId,
    amount: data.amount,
    currency: data.currency,
    name: data.name,
    description: data.description,
    order_id: data.orderId,
    prefill: data.prefill,
    theme: { color: '#c8ef65' },
    handler: async (response) => {
      showToast('Verifying your payment…');
      const result = await supabaseClient.functions.invoke('verify-razorpay-payment', { body: response });
      if (result.error || result.data?.error) { showToast(result.data?.error || result.error?.message || 'Payment verification failed.'); return; }
      showToast('Payment successful. Your ID is now active.', true);
      await refreshMemberData();
    },
    modal: { ondismiss: () => showToast('Payment window closed. You can try again anytime.') }
  });
  checkout.open();
}

async function refreshMemberData() {
  const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error) { showToast(error.message); return; }
  currentProfile = profile;
  updateProfileUI();
  setActivationState();
  await Promise.all([loadCourses(), loadEnrollments(), loadTeam(), loadWallet(), loadKyc()]);
}

function renderTeam(team = []) {
  $('#team-total').textContent = team.length;
  $('#overview-team').textContent = team.length;
  for (const level of [1, 2, 3]) {
    const members = team.filter((member) => member.level === level);
    $(`#level-${level}-count`).textContent = members.length;
    $(`#team-level-${level}`).innerHTML = members.length ? members.map((member) => `<div class="team-member"><span class="team-member-avatar">${initials(member.full_name || 'Learner')}</span><span><strong>${escapeHtml(member.full_name || 'Learner')}</strong><small>${escapeHtml(member.referral_code || '')}</small></span><em class="team-status ${member.is_active ? 'active' : ''}">${member.is_active ? 'Active' : 'Pending'}</em></div>`).join('') : '<div class="empty-team">No members at this level yet.</div>';
  }
}

async function loadTeam() {
  const { data, error } = await supabaseClient.rpc('get_my_team');
  if (error) { showToast(error.message); return; }
  renderTeam(data || []);
}

async function loadWallet() {
  const [walletResult, withdrawalResult, activationResult] = await Promise.all([
    supabaseClient.from('wallet_transactions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
    supabaseClient.from('withdrawal_requests').select('amount, fee_percent, fee_amount, net_amount, status, admin_note, created_at, reviewed_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10),
    supabaseClient.from('activation_payments').select('amount, status, created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10)
  ]);
  if (walletResult.error) { showToast(walletResult.error.message); return; }
  walletRows = walletResult.data || [];
  withdrawalRows = withdrawalResult.data || [];
  activationRows = activationResult.data || [];
  const { data: summaryRows, error: summaryError } = await supabaseClient.rpc('get_my_wallet_summary');
  if (summaryError) { showToast(summaryError.message); return; }
  const summary = summaryRows?.[0] || {};
  const balance = Number(summary.balance || 0);
  const credited = Number(summary.credited || 0);
  $('#wallet-balance').textContent = money(balance);
  $('#overview-balance').textContent = money(balance);
  $('#wallet-credited').textContent = money(credited);
  $('#wallet-pending').textContent = withdrawalRows.filter((row) => row.status === 'pending').length;
  const pendingLabel = $('#wallet-pending')?.parentElement?.querySelector('span');
  if (pendingLabel) pendingLabel.textContent = 'Pending withdrawals';
  $('#wallet-table-body').innerHTML = walletRows.length ? walletRows.slice(0, 15).map((row) => `<tr><td>${escapeHtml(row.transaction_type.replace('_', ' '))}</td><td class="amount-cell ${Number(row.amount) >= 0 ? 'positive-amount' : ''}">₹${money(row.amount)}</td><td><span class="ledger-status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>${dateLabel(row.created_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="table-loading">No transactions yet.</td></tr>';
  renderActivityFeed();
}

function renderActivityFeed() {
  const feed = $('#member-activity-feed');
  if (!feed) return;
  const items = [
    ...walletRows.slice(0, 6).map((row) => ({ date: row.created_at, title: row.transaction_type.replace('_', ' '), detail: `₹${money(row.amount)}`, status: row.status })),
    ...withdrawalRows.slice(0, 4).map((row) => ({ date: row.created_at, title: 'Withdrawal request', detail: `₹${money(row.amount)} gross · ₹${money(row.net_amount ?? Number(row.amount || 0) * 0.95)} payout`, status: row.status })),
    ...activationRows.slice(0, 3).map((row) => ({ date: row.created_at, title: 'ID activation payment', detail: `₹${money(row.amount)}`, status: row.status })),
    ...(currentKycSubmission?.submitted_at ? [{ date: currentKycSubmission.submitted_at, title: 'KYC verification', detail: currentKycSubmission.rejection_reason || 'Document submitted', status: currentKycSubmission.status }] : [])
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7);
  feed.innerHTML = items.length ? `<div class="activity-list">${items.map((item) => `<div class="activity-row"><span class="activity-icon">${item.title === 'KYC verification' ? '◇' : item.title === 'Withdrawal request' ? '↓' : '•'}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)} · ${dateLabel(item.date)}</small></div><em class="ledger-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</em></div>`).join('')}</div>` : '<div class="activity-empty">No account activity yet. Activate your ID to get started.</div>';
}

async function loadKyc() {
  const [{ data }, { data: changeRequest }] = await Promise.all([
    supabaseClient.from('kyc_submissions').select('*').eq('user_id', currentUser.id).maybeSingle(),
    supabaseClient.from('kyc_change_requests').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  currentKycSubmission = data || null;
  currentKycChangeRequest = changeRequest || null;
  const status = data?.status || (['approved', 'rejected'].includes(currentProfile.kyc_status) ? currentProfile.kyc_status : 'not_submitted');
  const label = status.replace('_', ' ');
  $('#kyc-status-chip').textContent = label;
  $('#kyc-status-chip').className = `kyc-status-chip ${status}`;
  $('#overview-kyc').textContent = status === 'not_submitted' ? 'Pending' : label;
  $('#overview-kyc-dot').className = `kyc-dot ${status}`;
  if (data) {
    $('#kyc-legal-name').value = data.legal_name || '';
    $('#kyc-account-holder').value = data.bank_account_details?.account_holder || '';
    $('#kyc-account-number').value = data.bank_account_details?.account_number || '';
    $('#kyc-ifsc').value = data.bank_account_details?.ifsc || '';
    $('#kyc-upi-id').value = data.bank_account_details?.upi_id || '';
  }
  const reason = data?.rejection_reason || currentProfile.kyc_rejection_reason || '';
  const rejectionMessage = $('#kyc-rejection-message');
  if (rejectionMessage) {
    rejectionMessage.hidden = status !== 'rejected';
    rejectionMessage.textContent = status === 'rejected' ? `Review note: ${reason || 'Please update your document and submit it again.'}` : '';
  }
  const locked = Boolean(data);
  $('#kyc-form').querySelectorAll('input, select, button').forEach((element) => { element.disabled = locked; });
  const changeBox = $('#kyc-change-box');
  if (changeBox) changeBox.hidden = status !== 'approved';
  const changeToggle = $('#kyc-change-toggle');
  const changeForm = $('#kyc-change-form');
  if (changeToggle) {
    const changeLocked = currentKycChangeRequest?.status === 'pending';
    changeToggle.disabled = changeLocked;
    changeToggle.innerHTML = changeLocked ? 'Request pending' : 'Request Change <span class="button-arrow">↗</span>';
  }
  if (changeForm) {
    const changeLocked = currentKycChangeRequest?.status === 'pending';
    if (changeLocked || status !== 'approved') { changeForm.hidden = true; changeForm.dataset.open = 'false'; }
    changeForm.querySelectorAll('input, select, textarea, button').forEach((element) => { element.disabled = changeLocked; });
    if (changeLocked) setMessage('#kyc-change-message', 'Your change request is with the admin team.', true);
    else if (currentKycChangeRequest?.admin_response) setMessage('#kyc-change-message', `Admin response (${currentKycChangeRequest.responded_via || 'support'}): ${currentKycChangeRequest.admin_response}`, currentKycChangeRequest.status === 'approved');
    else setMessage('#kyc-change-message', '');
  }
  if (status === 'approved') setMessage('#kyc-message', 'KYC approved. Your documents are verified and locked.', true);
  else if (status === 'pending') setMessage('#kyc-message', 'KYC is under review. Your one-time submission is locked while the admin checks it.', true);
  else if (status === 'rejected') setMessage('#kyc-message', 'This one-time KYC submission was rejected. Please contact admin for assistance.');
  else setMessage('#kyc-message', '');
  renderActivityFeed();
}

function validateKycFile(file, label, imagesOnly = false) {
  if (!(file instanceof File) || !file.size) return `${label} is required.`;
  if (file.size > 5 * 1024 * 1024) return `${label} must be smaller than 5MB.`;
  const allowed = imagesOnly ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return `${label} must be a PDF, JPG, PNG${imagesOnly ? ' or WEBP image' : ' or WEBP'}.`;
  return '';
}

async function uploadKycFile(file) {
  const safeFileName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
  const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName}`;
  const { error } = await supabaseClient.storage.from('kyc-documents').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

async function submitKyc(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const files = { aadhaar: data.aadhaar, pan: data.pan, upi_qr: data.upi_qr, selfie: data.selfie };
  const validation = [
    validateKycFile(files.aadhaar, 'Aadhaar Card'),
    validateKycFile(files.pan, 'PAN Card'),
    validateKycFile(files.upi_qr, 'UPI QR', true),
    validateKycFile(files.selfie, 'Live selfie', true)
  ].find(Boolean);
  if (validation) { setMessage('#kyc-message', validation); return; }
  const button = form.querySelector('button');
  const originalLabel = 'Submit KYC for review <span class="button-arrow">↗</span>';
  const paths = [];
  button.disabled = true;
  button.textContent = 'Uploading secure documents…';
  try {
    for (const file of Object.values(files)) paths.push(await uploadKycFile(file));
    const [aadhaarPath, panPath, upiQrPath, selfiePath] = paths;
    const { error } = await supabaseClient.rpc('submit_kyc_submission', {
      p_legal_name: data.legal_name,
      p_bank_account_details: { account_holder: data.account_holder, account_number: data.account_number, ifsc: data.ifsc, upi_id: data.upi_id || null },
      p_aadhaar_path: aadhaarPath,
      p_pan_path: panPath,
      p_upi_qr_path: upiQrPath,
      p_selfie_path: selfiePath
    });
    if (error) throw error;
    currentProfile.kyc_status = 'pending';
    currentProfile.kyc_rejection_reason = null;
    setMessage('#kyc-message', 'KYC submitted. The admin team will review all documents shortly.', true);
    await loadKyc();
  } catch (error) {
    if (paths.length) await supabaseClient.storage.from('kyc-documents').remove(paths);
    setMessage('#kyc-message', error.message || 'Unable to submit KYC.');
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}

async function submitKycChangeRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector('button');
  button.disabled = true;
  const { error } = await supabaseClient.rpc('submit_kyc_change_request', {
    p_reason: data.reason,
    p_preferred_contact: data.preferred_contact,
    p_contact_value: data.contact_value
  });
  button.disabled = false;
  if (error) { setMessage('#kyc-change-message', error.message); return; }
  form.reset();
  form.hidden = true;
  form.dataset.open = 'false';
  setMessage('#kyc-change-message', 'Change request sent. Admin will respond through your selected channel.', true);
  showToast('KYC change request sent.', true);
  await loadKyc();
}

async function submitProfile(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const { error } = await supabaseClient.rpc('update_my_profile', { p_full_name: data.full_name, p_phone: data.phone });
  if (error) { setMessage('#profile-message', error.message); return; }
  setMessage('#profile-message', 'Profile updated successfully.', true);
  currentProfile.full_name = data.full_name; currentProfile.phone = data.phone; updateProfileUI();
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (data.password.length < 6) { setMessage('#password-message', 'Password must be at least 6 characters.'); return; }
  if (data.password !== data.confirm_password) { setMessage('#password-message', 'Passwords do not match.'); return; }
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Updating…';
  const { error } = await supabaseClient.auth.updateUser({ password: data.password });
  button.disabled = false;
  button.innerHTML = 'Update password <span class="button-arrow">↗</span>';
  if (error) { setMessage('#password-message', error.message); return; }
  form.reset();
  setMessage('#password-message', 'Password updated successfully.', true);
}

async function submitWithdrawal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  const { error } = await supabaseClient.rpc('submit_withdrawal_request', { p_amount: Number(data.amount), p_account_details: { account_holder: data.account_holder, ifsc: data.ifsc, account_number: data.account_number } });
  button.disabled = false;
  if (error) { setMessage('#withdrawal-message', error.message); return; }
  event.currentTarget.reset(); updateWithdrawalPreview(); setMessage('#withdrawal-message', 'Withdrawal request sent for admin review. The admin will see your bank destination and final payout amount.', true); showToast('Withdrawal request submitted.', true); await loadWallet();
}

function updateWithdrawalPreview() {
  const amount = Number($('#withdrawal-form input[name="amount"]')?.value || 0);
  const preview = $('#withdrawal-net-preview');
  if (!preview) return;
  if (!amount) { preview.textContent = 'Enter an amount to see the 5% fee and final payout.'; return; }
  const fee = amount * 0.05;
  const net = amount - fee;
  preview.innerHTML = `Gross: <strong>₹${money(amount)}</strong> · 5% fee: <strong>₹${money(fee)}</strong> · Final payout: <strong>₹${money(net)}</strong>`;
}

async function copyReferral() {
  const link = getReferralLink(currentProfile.referral_code);
  try {
    await navigator.clipboard.writeText(link);
  } catch (error) {
    const helper = document.createElement('textarea');
    helper.value = link;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  showToast('Referral link copied.', true);
}

document.querySelectorAll('[data-section]').forEach((element) => element.addEventListener('click', () => switchSection(element.dataset.section)));
document.querySelector('#member-menu-button')?.addEventListener('click', () => $('#member-sidebar').classList.add('open'));
document.querySelector('#sidebar-close')?.addEventListener('click', () => $('#member-sidebar').classList.remove('open'));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#member-sidebar')?.classList.remove('open'); });
document.addEventListener('click', (event) => {
  const sidebar = $('#member-sidebar');
  const menu = $('#member-menu-button');
  if (window.innerWidth <= 700 && sidebar?.classList.contains('open') && !sidebar.contains(event.target) && !menu?.contains(event.target)) sidebar.classList.remove('open');
});
document.querySelector('#member-logout')?.addEventListener('click', async () => { await supabaseClient.auth.signOut(); window.location.href = 'index.html'; });
document.querySelector('#activate-button')?.addEventListener('click', startActivation);
document.querySelector('#copy-referral')?.addEventListener('click', copyReferral);
document.querySelector('#copy-team-referral')?.addEventListener('click', copyReferral);
document.querySelector('#kyc-form')?.addEventListener('submit', submitKyc);
document.querySelector('#kyc-change-form')?.addEventListener('submit', submitKycChangeRequest);
document.querySelector('#kyc-change-toggle')?.addEventListener('click', () => {
  const form = $('#kyc-change-form');
  if (!form || $('#kyc-change-toggle').disabled) return;
  form.hidden = false;
  form.dataset.open = 'true';
  form.querySelector('textarea')?.focus();
});
document.querySelector('#profile-form')?.addEventListener('submit', submitProfile);
document.querySelector('#withdrawal-form')?.addEventListener('submit', submitWithdrawal);
ensureDashboardEnhancements();
document.querySelector('#password-form')?.addEventListener('submit', changePassword);

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user;
  if (!currentUser) { window.location.href = 'login.html?next=dashboard'; return; }
  const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || !profile) { showToast(error?.message || 'Profile not found.'); return; }
  currentProfile = profile;
  updateProfileUI(); setActivationState();
  await Promise.all([loadCourses(), loadEnrollments(), loadTeam(), loadWallet(), loadKyc()]);
  const initialSection = window.location.hash.replace('#', '');
  if (['overview', 'courses', 'team', 'kyc', 'wallet', 'profile'].includes(initialSection)) switchSection(initialSection);
})();
