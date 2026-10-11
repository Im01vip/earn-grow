const { createClient } = window.supabase;
const supabaseClient = createClient(window.ZENVIXA_CONFIG.supabaseUrl, window.ZENVIXA_CONFIG.supabaseAnonKey);

let currentUser;
let currentProfile;
let profiles = [];
let courses = [];
let kycRows = [];
let kycChangeRows = [];
let depositRows = [];
let withdrawalRows = [];
let paymentRows = [];
let commissionRows = [];
let auditRows = [];
let visibleProfiles = [];
let selectedUser = null;
let referralRootId = null;
let toastTimer;
let userPage = 1;
let userStatusFilter = 'all';
let kycFilter = 'pending';
let financeFilter = 'pending';
let transactionQuery = '';
let adminRealtimeChannel;
let liveRefreshTimer;
const userPageSize = 25;

const $ = (selector) => document.querySelector(selector);
const SUPER_ADMIN_ID = '6b3e8927-a456-4445-a90d-ddd809fdf447';

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

function switchAdminSection(section) {
  document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `admin-section-${section}`));
  document.querySelectorAll('.admin-nav button').forEach((item) => item.classList.toggle('active', item.dataset.adminSection === section));
  $('#admin-sidebar')?.classList.remove('open');
  history.replaceState(null, '', `#${section}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHeader() {
  const name = currentProfile.full_name || currentUser.email?.split('@')[0] || 'Admin';
  $('#admin-name').textContent = name;
  $('#admin-greeting').textContent = name.split(' ')[0];
  $('#admin-avatar').textContent = initials(name);
  $('#admin-role-label').textContent = currentUser.id === SUPER_ADMIN_ID ? 'Super administrator' : 'Operations administrator';
}

function ensureAdminOverview() {
  const overview = $('#admin-section-overview');
  const stats = overview?.querySelector('.admin-stats');
  if (!overview || !stats) return;
  if (stats.dataset.compact !== 'true') {
    overview.querySelector('.admin-quick-grid')?.remove();
    overview.querySelector('.admin-dashboard-grid')?.remove();
    overview.querySelector('#admin-overview-insights')?.remove();
    stats.dataset.compact = 'true';
    stats.className = 'admin-stats admin-stats-five compact-overview-stats';
    stats.innerHTML = `
    <button type="button" class="stat-card stat-card-dark compact-stat-card" data-admin-section="users"><span>Total users</span><strong id="stat-learners">—</strong><small>Open user management</small><div class="stat-decoration">◎</div></button>
    <button type="button" class="stat-card compact-stat-card" data-admin-section="users"><span>Active IDs</span><strong id="stat-active">—</strong><small>Verified members</small><div class="mini-bars"><i></i><i></i><i></i><i></i><i></i></div></button>
    <button type="button" class="stat-card compact-stat-card" data-admin-section="transactions"><span>Today's activation volume</span><strong>₹<b id="stat-today-earnings">—</b></strong><small>Paid activation volume</small><div class="stat-spark stat-spark-lime">₹</div></button>
    <button type="button" class="stat-card compact-stat-card" data-admin-section="kyc"><span>Pending KYC</span><strong id="stat-kyc">—</strong><small>Documents to review</small><div class="stat-spark">◇</div></button>
    <button type="button" class="stat-card compact-stat-card" data-admin-section="finance"><span>Pending withdrawals</span><strong id="stat-withdrawals">—</strong><small>Requests to process</small><div class="stat-spark stat-spark-orange">↑</div></button>`;
  }

  if (!$('#admin-activity-feed')) {
    const activityCard = document.createElement('div');
    activityCard.className = 'admin-card admin-overview-activity';
    activityCard.innerHTML = '<div class="admin-card-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Live activity</div><h2>Recent admin events</h2></div><button type="button" class="text-link" data-admin-section="settings">View logs <span>↗</span></button></div><div class="activity-feed" id="admin-activity-feed"><div class="table-loading">Loading activity…</div></div>';
    overview.appendChild(activityCard);
  }
}

function ensureSidebarBadges() {
  const badgeMap = [
    ['users', 'nav-user-count'],
    ['kyc', 'nav-kyc-count'],
    ['finance', 'nav-finance-count'],
    ['courses', 'nav-course-count']
  ];
  badgeMap.forEach(([section, id]) => {
    const button = document.querySelector(`.admin-nav button[data-admin-section="${section}"]`);
    if (!button || $(`#${id}`)) return;
    const badge = document.createElement('b');
    badge.id = id;
    badge.className = 'nav-count';
    badge.hidden = true;
    button.appendChild(badge);
  });
}

function ensureAdminModules() {
  const content = $('#admin-content');
  if (!content || $('#admin-section-referrals')) return;

  const referralSection = document.createElement('section');
  referralSection.className = 'admin-panel';
  referralSection.id = 'admin-section-referrals';
  referralSection.innerHTML = `
    <div class="admin-section-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Growth intelligence</div><h2>Referral tree & affiliate tracking</h2></div><label class="module-select-label">View network<select id="referral-root-select"></select></label></div>
    <div class="referral-summary-grid"><article class="referral-summary-card"><span>Level 1 team</span><strong id="referral-level-1">—</strong><small>Direct referrals</small></article><article class="referral-summary-card"><span>Level 2 team</span><strong id="referral-level-2">—</strong><small>Second level</small></article><article class="referral-summary-card"><span>Level 3 team</span><strong id="referral-level-3">—</strong><small>Third level</small></article><article class="referral-summary-card referral-summary-dark"><span>Commission paid</span><strong>₹<b id="referral-commission-total">—</b></strong><small>Selected member</small></article></div>
    <div class="referral-module-grid"><div class="admin-card"><div class="admin-card-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Network map</div><h2>Level-wise team</h2></div><span class="muted-note" id="referral-root-label">—</span></div><div class="referral-tree-list" id="referral-tree-list"><div class="table-loading">Loading team…</div></div></div><div class="admin-card"><div class="admin-card-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Distribution</div><h2>Commission by level</h2></div></div><div class="commission-level-list" id="commission-level-list"><div class="table-loading">Loading commissions…</div></div></div></div>
    <div class="table-wrap referral-payout-table"><table class="course-table admin-table"><thead><tr><th>Beneficiary</th><th>Level</th><th>Source user</th><th>Amount</th><th>Date</th></tr></thead><tbody id="referral-payout-body"><tr><td colspan="5" class="table-loading">Loading payouts…</td></tr></tbody></table></div>`;
  content.appendChild(referralSection);

  const settingsSection = document.createElement('section');
  settingsSection.className = 'admin-panel';
  settingsSection.id = 'admin-section-settings';
  settingsSection.innerHTML = `
    <div class="admin-section-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Control center</div><h2>System settings & logs</h2></div><button type="button" class="button button-dark" data-admin-section="transactions">Open audit trail <span class="button-arrow">↗</span></button></div>
    <div class="settings-status-grid"><div class="admin-card settings-status-card"><span class="settings-status-icon">◉</span><strong>Authentication</strong><small id="settings-auth-status">Checking…</small></div><div class="admin-card settings-status-card"><span class="settings-status-icon">▦</span><strong>Course storage</strong><small id="settings-storage-status">Checking…</small></div><div class="admin-card settings-status-card"><span class="settings-status-icon">✓</span><strong>Audit logging</strong><small id="settings-audit-status">Checking…</small></div></div>
    <div class="settings-module-grid"><div class="admin-card"><div class="admin-card-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Platform rules</div><h2>Current configuration</h2></div></div><dl class="settings-list"><div><dt>Activation price</dt><dd>₹500</dd></div><div><dt>Level 1 commission</dt><dd>₹50</dd></div><div><dt>Level 2 commission</dt><dd>₹25</dd></div><div><dt>Level 3 commission</dt><dd>₹25</dd></div><div><dt>Course PDF bucket</dt><dd><code>course-pdfs</code></dd></div></dl></div><div class="admin-card"><div class="admin-card-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Operations</div><h2>Activity logs</h2></div><button type="button" class="text-link" id="settings-refresh-log">Refresh <span>↻</span></button></div><div class="activity-feed" id="settings-activity-feed"><div class="table-loading">Loading logs…</div></div></div></div>`;
  content.appendChild(settingsSection);
  $('#referral-root-select')?.addEventListener('change', (event) => { referralRootId = event.target.value; renderReferralModule(); });
  $('#settings-refresh-log')?.addEventListener('click', renderSettingsModule);
}

function ensureAdminFilters() {
  const userSearchBar = $('.user-search-bar');
  if (userSearchBar && !$('#user-status-filter')) {
    const filter = document.createElement('select');
    filter.id = 'user-status-filter';
    filter.className = 'admin-filter-select';
    filter.innerHTML = '<option value="all">All users</option><option value="active">Active IDs</option><option value="inactive">Inactive IDs</option><option value="admin">Admins</option>';
    userSearchBar.appendChild(filter);
    filter.addEventListener('change', () => { userStatusFilter = filter.value; userPage = 1; applyUserFilters(); });
  }

  const userTableWrap = $('#user-table-body')?.closest('.table-wrap');
  if (userTableWrap && !$('#user-pagination')) {
    const pager = document.createElement('div');
    pager.id = 'user-pagination';
    pager.className = 'admin-pagination';
    pager.innerHTML = '<button type="button" class="admin-action" id="user-page-prev">← Previous</button><span id="user-page-label">Page 1</span><button type="button" class="admin-action" id="user-page-next">Next →</button>';
    userTableWrap.insertAdjacentElement('afterend', pager);
    $('#user-page-prev').addEventListener('click', () => { if (userPage > 1) { userPage -= 1; renderUsers(); } });
    $('#user-page-next').addEventListener('click', () => { if (userPage < Math.ceil(visibleProfiles.length / userPageSize)) { userPage += 1; renderUsers(); } });
  }

  const userDetailSide = $('.user-detail-side');
  if (userDetailSide && !$('#selected-user-kyc')) {
    const extraStats = document.createElement('div');
    extraStats.className = 'user-extra-stats';
    extraStats.innerHTML = '<div class="detail-stat-row"><span>Activation date</span><strong id="selected-user-activated">—</strong></div><div class="detail-stat-row"><span>KYC status</span><strong id="selected-user-kyc">—</strong></div><div class="detail-stat-row"><span>Referred by</span><strong id="selected-user-referrer">—</strong></div>';
    userDetailSide.insertBefore(extraStats, $('#selected-user-team-list'));
  }

  const kycHeading = $('#admin-section-kyc .admin-section-heading');
  if (kycHeading && !$('#kyc-filter')) {
    const filter = document.createElement('select');
    filter.id = 'kyc-filter';
    filter.className = 'admin-filter-select';
    filter.innerHTML = '<option value="pending">Pending only</option><option value="all">All submissions</option><option value="approved">Approved</option><option value="rejected">Rejected</option>';
    filter.value = kycFilter;
    kycHeading.appendChild(filter);
    filter.addEventListener('change', () => { kycFilter = filter.value; renderKyc(); });
  }

  const kycTableWrap = $('#kyc-table-body')?.closest('.table-wrap');
  if (kycTableWrap && !$('#kyc-change-request-card')) {
    const card = document.createElement('div');
    card.id = 'kyc-change-request-card';
    card.className = 'admin-card kyc-change-request-card';
    card.innerHTML = '<div class="admin-card-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Change requests</div><h2>Approved KYC updates</h2></div><span class="muted-note">Respond via WhatsApp / Telegram</span></div><div class="kyc-change-request-list" id="kyc-change-request-list"><div class="table-loading">Loading requests…</div></div>';
    kycTableWrap.insertAdjacentElement('afterend', card);
  }

  const financeHeading = $('#admin-section-finance .admin-section-heading');
  if (financeHeading && !$('#finance-filter')) {
    const filter = document.createElement('select');
    filter.id = 'finance-filter';
    filter.className = 'admin-filter-select';
    filter.innerHTML = '<option value="pending">Pending only</option><option value="all">All requests</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option>';
    financeHeading.appendChild(filter);
    filter.addEventListener('change', () => { financeFilter = filter.value; renderFinance(); });
  }

  const transactionHeading = $('#admin-section-transactions .admin-section-heading');
  if (transactionHeading && !$('#transaction-search')) {
    const input = document.createElement('input');
    input.id = 'transaction-search';
    input.className = 'admin-filter-input';
    input.type = 'search';
    input.placeholder = 'Search order, payment or user';
    transactionHeading.appendChild(input);
    input.addEventListener('input', () => { transactionQuery = input.value.trim().toLowerCase(); renderTransactions(); });
    const exportButton = document.createElement('button');
    exportButton.id = 'transaction-export';
    exportButton.className = 'admin-action transaction-export';
    exportButton.type = 'button';
    exportButton.textContent = 'Export CSV';
    transactionHeading.appendChild(exportButton);
    exportButton.addEventListener('click', exportTransactions);
  }
}

function exportTransactions() {
  const profileName = (id) => profiles.find((profile) => profile.id === id)?.full_name || 'User';
  const matches = (row, ...values) => !transactionQuery || values.some((value) => String(value || '').toLowerCase().includes(transactionQuery));
  const lines = [['Type', 'User', 'Reference', 'Level', 'Amount', 'Status', 'Date']];
  paymentRows.filter((row) => matches(row, profileName(row.user_id), row.razorpay_order_id, row.razorpay_payment_id, row.status)).forEach((row) => lines.push(['Activation payment', profileName(row.user_id), row.razorpay_payment_id || row.razorpay_order_id || '', '', row.amount, row.status, row.created_at]));
  commissionRows.filter((row) => matches(row, profileName(row.beneficiary_user_id), profileName(row.source_user_id), row.level, row.status)).forEach((row) => lines.push([`Level ${row.level} commission`, profileName(row.beneficiary_user_id), profileName(row.source_user_id), row.level, row.amount, row.status || 'credited', row.created_at]));
  const csv = lines.map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `zenvixa-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function setCount(selector, value) {
  const element = $(selector);
  if (!element) return;
  element.textContent = value;
  element.hidden = !value;
}

function renderStats() {
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const isToday = (value) => {
    return new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === today;
  };
  const todayEarnings = paymentRows.filter((row) => row.status === 'paid' && isToday(row.created_at)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  $('#stat-learners').textContent = profiles.length;
  $('#stat-active').textContent = profiles.filter((profile) => profile.is_active).length;
  $('#stat-kyc').textContent = kycRows.filter((row) => row.status === 'pending').length;
  $('#stat-today-earnings').textContent = money(todayEarnings);
  $('#stat-withdrawals').textContent = withdrawalRows.filter((row) => row.status === 'pending').length;
}

function renderAdminInsights() {
  const pendingKyc = kycRows.filter((row) => row.status === 'pending').length;
  const pendingFinance = [...depositRows, ...withdrawalRows].filter((row) => row.status === 'pending').length;
  const missingPdfs = courses.filter((course) => course.status === 'published' && !course.pdf_path).length;
  setCount('#nav-user-count', profiles.length);
  setCount('#nav-kyc-count', pendingKyc);
  setCount('#nav-finance-count', pendingFinance);
  setCount('#nav-course-count', missingPdfs);
}

function buildActivityItems() {
  const profileName = (id) => profiles.find((profile) => profile.id === id)?.full_name || 'User';
  return [
    ...auditRows.map((row) => ({ date: row.created_at, icon: '✓', tone: 'positive', title: row.action.replaceAll('_', ' '), meta: `${profileName(row.actor_user_id)} · ${row.entity_type}` })),
    ...paymentRows.map((row) => ({ date: row.created_at, icon: '₹', tone: row.status === 'paid' ? 'positive' : 'neutral', title: `Activation ${row.status}`, meta: `${profileName(row.user_id)} · ₹${money(row.amount)}` })),
    ...commissionRows.map((row) => ({ date: row.created_at, icon: '↗', tone: 'positive', title: `Level ${row.level} commission`, meta: `${profileName(row.beneficiary_user_id)} · ₹${money(row.amount)}` })),
    ...kycRows.map((row) => ({ date: row.submitted_at, icon: '◇', tone: row.status === 'pending' ? 'warning' : 'neutral', title: `KYC ${row.status}`, meta: profileName(row.user_id) })),
    ...kycChangeRows.map((row) => ({ date: row.created_at, icon: '↻', tone: row.status === 'pending' ? 'warning' : 'neutral', title: `KYC change ${row.status}`, meta: profileName(row.user_id) })),
    ...depositRows.map((row) => ({ date: row.created_at, icon: '↓', tone: row.status === 'pending' ? 'warning' : 'neutral', title: `Deposit ${row.status}`, meta: `${profileName(row.user_id)} · ₹${money(row.amount)}` })),
    ...withdrawalRows.map((row) => ({ date: row.created_at, icon: '↑', tone: row.status === 'pending' ? 'warning' : 'neutral', title: `Withdrawal ${row.status}`, meta: `${profileName(row.user_id)} · ₹${money(row.amount)}` }))
  ].filter((item) => item.date).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderActivityFeed() {
  const target = $('#admin-activity-feed');
  if (!target) return;
  const activity = buildActivityItems().slice(0, 6);
  target.innerHTML = activity.length ? activity.map((item) => `<div class="activity-row"><i class="activity-icon ${item.tone}">${item.icon}</i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></span><time>${dateLabel(item.date)}</time></div>`).join('') : '<div class="table-loading">No activity yet.</div>';
}

function getReferralLevels(rootId) {
  const levels = [[], [], []];
  let parentIds = [rootId];
  const visited = new Set(parentIds);
  for (let level = 0; level < 3; level += 1) {
    const members = profiles.filter((profile) => parentIds.includes(profile.referred_by) && !visited.has(profile.id));
    levels[level] = members;
    members.forEach((member) => visited.add(member.id));
    parentIds = members.map((member) => member.id);
  }
  return levels;
}

function renderReferralModule() {
  const select = $('#referral-root-select');
  const root = profiles.find((profile) => profile.id === (referralRootId || currentProfile?.id)) || profiles[0];
  if (!select || !root) return;
  referralRootId = root.id;
  const options = [...profiles].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map((profile) => `<option value="${profile.id}">${escapeHtml(profile.full_name || profile.email || 'User')} · ${escapeHtml(profile.referral_code || 'no code')}</option>`).join('');
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = root.id;
  const levels = getReferralLevels(root.id);
  const commissions = commissionRows.filter((row) => row.beneficiary_user_id === root.id);
  const byLevel = [1, 2, 3].map((level) => commissions.filter((row) => Number(row.level) === level).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  $('#referral-level-1').textContent = levels[0].length;
  $('#referral-level-2').textContent = levels[1].length;
  $('#referral-level-3').textContent = levels[2].length;
  $('#referral-commission-total').textContent = money(byLevel.reduce((sum, value) => sum + value, 0));
  $('#referral-root-label').textContent = `${root.full_name || 'User'} · ${root.referral_code || '—'}`;
  $('#commission-level-list').innerHTML = [1, 2, 3].map((level, index) => `<div class="commission-level-row"><span><i>L${level}</i><span><strong>Level ${level}</strong><small>${levels[index].length} members in network</small></span></span><b>₹${money(byLevel[index])}</b></div>`).join('');
  $('#referral-tree-list').innerHTML = levels.some((level) => level.length) ? levels.map((members, index) => `<div class="referral-level-group"><span class="referral-level-label">Level ${index + 1}</span><div class="referral-member-list">${members.map((member) => `<span class="referral-member"><i>${initials(member.full_name || member.email || 'U')}</i><span><strong>${escapeHtml(member.full_name || 'Unnamed user')}</strong><small>${escapeHtml(member.referral_code || '')}</small></span><em class="${member.is_active ? 'active' : 'inactive'}">${member.is_active ? 'Active' : 'Pending'}</em></span>`).join('')}</div></div>`).join('') : '<div class="table-loading">No referrals in the first three levels.</div>';
  $('#referral-payout-body').innerHTML = commissions.length ? [...commissions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12).map((row) => `<tr><td>${escapeHtml(root.full_name || 'User')}</td><td>Level ${row.level}</td><td>${escapeHtml(profiles.find((profile) => profile.id === row.source_user_id)?.full_name || 'User')}</td><td class="positive-amount">₹${money(row.amount)}</td><td>${dateLabel(row.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="table-loading">No commission payouts yet.</td></tr>';
}

function renderSettingsModule() {
  const activeCount = profiles.filter((profile) => profile.is_active).length;
  $('#settings-auth-status').textContent = `Connected · ${activeCount} active IDs`;
  $('#settings-storage-status').textContent = `Ready · ${courses.filter((course) => course.pdf_path).length}/${courses.length || 0} PDFs uploaded`;
  $('#settings-audit-status').textContent = `${auditRows.length} recent events loaded`;
  const target = $('#settings-activity-feed');
  if (!target) return;
  const activity = buildActivityItems().slice(0, 12);
  target.innerHTML = activity.length ? activity.map((item) => `<div class="activity-row"><i class="activity-icon ${item.tone}">${item.icon}</i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></span><time>${dateLabel(item.date)}</time></div>`).join('') : '<div class="table-loading">No logs yet.</div>';
}

function renderRecentUsers() {
  const target = $('#recent-users');
  if (!target) return;
  const recent = [...profiles].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  target.innerHTML = recent.length ? recent.map((profile) => `<div class="mini-user-row"><span class="mini-user-avatar">${initials(profile.full_name || profile.email || 'U')}</span><span><strong>${escapeHtml(profile.full_name || 'Unnamed user')}</strong><small>${escapeHtml(profile.email || profile.referral_code || '')}</small></span><em>${profile.is_active ? 'Active' : 'Pending'}</em></div>`).join('') : '<div class="table-loading">No users yet.</div>';
}

function renderUsers() {
  const target = $('#user-table-body');
  if (!visibleProfiles.length) { target.innerHTML = '<tr><td colspan="6" class="table-loading">No users match this search.</td></tr>'; return; }
  const pageCount = Math.max(1, Math.ceil(visibleProfiles.length / userPageSize));
  userPage = Math.min(userPage, pageCount);
  const pageStart = (userPage - 1) * userPageSize;
  const pageRows = visibleProfiles.slice(pageStart, pageStart + userPageSize);
  target.innerHTML = pageRows.map((profile) => `<tr><td><div class="admin-user-cell"><span class="learner-avatar">${initials(profile.full_name || profile.email || 'U')}</span><span><strong>${escapeHtml(profile.full_name || 'Unnamed user')}</strong><small>${escapeHtml(profile.email || 'No email')}</small></span></div></td><td><code class="referral-inline">${escapeHtml(profile.referral_code || '—')}</code></td><td><span class="admin-status ${profile.is_active ? 'active' : 'inactive'}">${profile.is_active ? 'active' : 'inactive'}</span></td><td><span class="admin-status ${escapeHtml(profile.kyc_status || 'pending')}">${escapeHtml((profile.kyc_status || 'not_submitted').replace('_', ' '))}</span></td><td>${escapeHtml(profile.role)}</td><td><button class="admin-action" data-user-action="select" data-user-id="${profile.id}">View</button>${profile.id === currentUser.id ? '<span class="muted-note"> Current</span>' : ` <button class="admin-action ${profile.is_active ? 'danger-action' : ''}" data-user-action="toggle" data-user-id="${profile.id}" data-active="${profile.is_active}">${profile.is_active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('');
  const pageLabel = $('#user-page-label');
  if (pageLabel) pageLabel.textContent = `Page ${userPage} of ${pageCount} · ${visibleProfiles.length} users`;
  if ($('#user-page-prev')) $('#user-page-prev').disabled = userPage <= 1;
  if ($('#user-page-next')) $('#user-page-next').disabled = userPage >= pageCount;
}

async function renderKyc() {
  const target = $('#kyc-table-body');
  const filteredRows = kycFilter === 'all' ? kycRows : kycRows.filter((row) => row.status === kycFilter);
  if (!filteredRows.length) { target.innerHTML = '<tr><td colspan="5" class="table-loading">No KYC submissions match this filter.</td></tr>'; return; }
  const rows = await Promise.all(filteredRows.map(async (row) => {
    const profile = profiles.find((item) => item.id === row.user_id);
    const documentLink = async (path, label) => {
      if (!path) return `<span class="muted-note">${label}: missing</span>`;
      const { data } = await supabaseClient.storage.from('kyc-documents').createSignedUrl(path, 600);
      return `<a class="document-link ${data?.signedUrl ? '' : 'is-unavailable'}" href="${data?.signedUrl || '#'}" target="_blank" rel="noopener">${label} ${data?.signedUrl ? '↗' : '(unavailable)'}</a>`;
    };
    const documents = await Promise.all([
      documentLink(row.aadhaar_path || row.document_path, 'Aadhaar'),
      documentLink(row.pan_path, 'PAN'),
      documentLink(row.upi_qr_path, 'UPI QR'),
      documentLink(row.selfie_path, 'Selfie')
    ]);
    const reviewNote = row.rejection_reason ? `<small class="review-note">${escapeHtml(row.rejection_reason)}</small>` : '';
    const bank = row.bank_account_details || {};
    const bankNote = bank.account_number ? `<small class="review-note">Bank: ${escapeHtml(bank.account_holder || '—')} · ${escapeHtml(bank.account_number)} · ${escapeHtml(bank.ifsc || '—')}${bank.upi_id ? ` · UPI ${escapeHtml(bank.upi_id)}` : ''}</small>` : '';
    return `<tr><td><div class="admin-user-cell"><span class="learner-avatar">${initials(profile?.full_name || 'U')}</span><span><strong>${escapeHtml(profile?.full_name || row.legal_name)}</strong><small>${escapeHtml(profile?.email || '')}</small></span></div>${bankNote}</td><td><div class="kyc-document-links">${documents.join('')}</div>${reviewNote}</td><td>${dateLabel(row.submitted_at)}</td><td><span class="admin-status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>${row.status === 'pending' ? `<button class="admin-action" data-kyc-action="approve" data-kyc-id="${row.id}">Approve</button><button class="admin-action danger-action" data-kyc-action="reject" data-kyc-id="${row.id}">Reject</button>` : `<span class="muted-note">${row.reviewed_at ? dateLabel(row.reviewed_at) : 'Reviewed'}</span>`}</td></tr>`;
  }));
  target.innerHTML = rows.join('');
}

function renderKycChangeRequests() {
  const target = $('#kyc-change-request-list');
  if (!target) return;
  const rows = [...kycChangeRows].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || new Date(b.created_at) - new Date(a.created_at));
  if (!rows.length) { target.innerHTML = '<div class="table-loading">No KYC change requests yet.</div>'; return; }
  target.innerHTML = rows.slice(0, 50).map((row) => {
    const profile = profiles.find((item) => item.id === row.user_id);
    const action = row.status === 'pending' ? `<span class="request-actions"><button data-kyc-change-action="approve" data-kyc-change-id="${row.id}">Respond / accept</button><button class="reject" data-kyc-change-action="reject" data-kyc-change-id="${row.id}">Reject</button></span>` : `<span class="admin-status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>`;
    const response = row.admin_response ? `<small class="review-note">Response: ${escapeHtml(row.admin_response)} · via ${escapeHtml(row.responded_via || 'support')}</small>` : '';
    const normalizedContact = row.contact_value.replace(/[^0-9]/g, '');
    const contactLink = row.preferred_contact === 'whatsapp' && normalizedContact
      ? `<a class="contact-link" href="https://wa.me/${normalizedContact}" target="_blank" rel="noopener">Open WhatsApp ↗</a>`
      : row.preferred_contact === 'telegram' && row.contact_value
        ? `<a class="contact-link" href="https://t.me/${encodeURIComponent(row.contact_value.replace(/^@/, ''))}" target="_blank" rel="noopener">Open Telegram ↗</a>`
        : '';
    return `<div class="request-item"><div class="request-top"><strong>${escapeHtml(profile?.full_name || 'User')}</strong><span>${escapeHtml(row.preferred_contact)}</span></div><div class="request-bottom"><span><small>${escapeHtml(row.reason)}</small><small class="review-note">Contact: ${escapeHtml(row.contact_value)} · ${dateLabel(row.created_at)} ${contactLink}</small>${response}</span>${action}</div></div>`;
  }).join('');
}

function requestMarkup(row, kind) {
  const profile = profiles.find((item) => item.id === row.user_id);
  const pending = row.status === 'pending';
  const reference = kind === 'deposit' ? (row.reference || 'No reference') : `${row.account_details?.account_holder || 'Bank account'} · A/c ${row.account_details?.account_number || 'pending'} · ${row.account_details?.ifsc || 'IFSC pending'}${row.account_details?.upi_id ? ` · UPI ${row.account_details.upi_id}` : ''}`;
  const action = pending
    ? `<span class="request-actions"><button data-finance-action="approve" data-finance-kind="${kind}" data-finance-id="${row.id}">Approve</button><button class="reject" data-finance-action="reject" data-finance-kind="${kind}" data-finance-id="${row.id}">Reject</button></span>`
    : row.status === 'approved' && kind === 'withdrawal'
      ? `<span class="request-actions"><button data-finance-action="paid" data-finance-kind="withdrawal" data-finance-id="${row.id}">Mark paid</button></span>`
      : `<span class="admin-status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span>`;
  const note = row.admin_note ? `<small class="review-note">${escapeHtml(row.admin_note)}</small>` : '';
  const payout = row.payout_reference ? `<small class="review-note">Payout: ${escapeHtml(row.payout_reference)}</small>` : '';
  const fee = Number(row.fee_amount ?? Number(row.amount || 0) * 0.05);
  const net = Number(row.net_amount ?? Number(row.amount || 0) - fee);
  const payoutBreakdown = kind === 'withdrawal' ? `<small class="payout-breakdown">Gross ₹${money(row.amount)} · Fee 5% ₹${money(fee)} · Final payout ₹${money(net)}</small>` : '';
  return `<div class="request-item"><div class="request-top"><strong>${escapeHtml(profile?.full_name || 'User')}</strong><span>${kind === 'withdrawal' ? `₹${money(net)} payout` : `₹${money(row.amount)}`}</span></div><div class="request-bottom"><span><small>${escapeHtml(reference)}</small>${payoutBreakdown}${note}${payout}</span>${action}</div></div>`;
}

function renderFinance() {
  const filterRows = (rows) => financeFilter === 'all' ? rows : rows.filter((row) => row.status === financeFilter);
  const deposits = filterRows(depositRows);
  const withdrawals = filterRows(withdrawalRows);
  $('#deposit-list').innerHTML = deposits.length ? deposits.map((row) => requestMarkup(row, 'deposit')).join('') : '<div class="table-loading">No deposit requests match this filter.</div>';
  $('#withdrawal-list').innerHTML = withdrawals.length ? withdrawals.map((row) => requestMarkup(row, 'withdrawal')).join('') : '<div class="table-loading">No withdrawal requests match this filter.</div>';
}

function renderCourses() {
  const select = $('#upload-course-select');
  select.innerHTML = courses.map((course) => `<option value="${course.id}">${escapeHtml(course.title)}</option>`).join('');
  $('#admin-course-body').innerHTML = courses.length ? courses.map((course) => `<tr><td><div class="course-name"><span class="course-swatch ${escapeHtml(course.accent)}">${course.accent === 'orange' ? '◒' : course.accent === 'violet' ? '⌁' : '✺'}</span><span><strong>${escapeHtml(course.title)}</strong><small>${escapeHtml(course.category)}</small></span></div></td><td><button class="admin-status-button ${escapeHtml(course.status)}" data-course-action="toggle-status" data-course-id="${course.id}">${escapeHtml(course.status)}</button></td><td>${Number(course.lessons || 0)}</td><td>${course.pdf_path ? '<span class="admin-status approved">Uploaded</span>' : '<span class="admin-status pending">Missing</span>'}</td><td>${dateLabel(course.created_at)}</td><td><button class="admin-action danger-action" data-course-action="remove-pdf" data-course-id="${course.id}" ${course.pdf_path ? '' : 'disabled'}>Remove PDF</button></td></tr>`).join('') : '<tr><td colspan="6" class="table-loading">No courses yet.</td></tr>';
}

function renderTransactions() {
  const profileName = (id) => profiles.find((profile) => profile.id === id)?.full_name || 'User';
  const matches = (row, ...values) => !transactionQuery || values.some((value) => String(value || '').toLowerCase().includes(transactionQuery));
  const filteredPayments = paymentRows.filter((row) => matches(row, profileName(row.user_id), row.razorpay_order_id, row.razorpay_payment_id, row.status));
  const filteredCommissions = commissionRows.filter((row) => matches(row, profileName(row.beneficiary_user_id), profileName(row.source_user_id), row.level, row.status));
  $('#transaction-table-body').innerHTML = filteredPayments.length ? filteredPayments.slice(0, 100).map((row) => `<tr><td>${escapeHtml(profileName(row.user_id))}</td><td><code class="referral-inline">${escapeHtml(row.razorpay_order_id || '—')}</code>${row.razorpay_payment_id ? `<small class="review-note">Payment: ${escapeHtml(row.razorpay_payment_id)}</small>` : ''}</td><td>₹${money(row.amount)}</td><td><span class="admin-status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>${dateLabel(row.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="table-loading">No activation transactions match this search.</td></tr>';
  $('#commission-table-body').innerHTML = filteredCommissions.length ? filteredCommissions.slice(0, 100).map((row) => `<tr><td>${escapeHtml(profileName(row.beneficiary_user_id))}</td><td>Level ${row.level}</td><td>${escapeHtml(profileName(row.source_user_id))}</td><td class="positive-amount">₹${money(row.amount)}</td><td>${dateLabel(row.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="table-loading">No commissions match this search.</td></tr>';
}

async function fetchAllRows(table, orderColumn = 'created_at', pageSize = 500) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseClient.from(table).select('*').order(orderColumn, { ascending: false }).range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: rows, error: null };
}

async function loadData() {
  const results = await Promise.all([
    fetchAllRows('profiles'),
    fetchAllRows('courses'),
    fetchAllRows('kyc_submissions', 'submitted_at'),
    fetchAllRows('kyc_change_requests'),
    fetchAllRows('deposit_requests'),
    fetchAllRows('withdrawal_requests'),
    fetchAllRows('activation_payments'),
    fetchAllRows('referral_commissions'),
    fetchAllRows('admin_audit_logs')
  ]);
  const [profilesResult, coursesResult, kycResult, kycChangeResult, depositsResult, withdrawalsResult, paymentsResult, commissionsResult, auditResult] = results;
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) { showToast(`Admin data load failed: ${failedResult.error.message}`); return; }
  profiles = profilesResult.data || [];
  courses = coursesResult.data || [];
  kycRows = kycResult.data || [];
  kycChangeRows = kycChangeResult.data || [];
  depositRows = depositsResult.data || [];
  withdrawalRows = withdrawalsResult.data || [];
  paymentRows = paymentsResult.data || [];
  commissionRows = commissionsResult.data || [];
  auditRows = auditResult.data || [];
  visibleProfiles = [...profiles];
  applyUserFilters();
  renderStats(); renderAdminInsights(); renderActivityFeed(); renderReferralModule(); renderSettingsModule(); renderRecentUsers(); await renderKyc(); renderKycChangeRequests(); renderFinance(); renderCourses(); renderTransactions();
}

async function refreshData() {
  $('#refresh-admin').disabled = true;
  try {
    await loadData();
    showToast('Admin data refreshed.', true);
  } finally {
    $('#refresh-admin').disabled = false;
  }
}

function scheduleLiveRefresh() {
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => { loadData(); }, 350);
}

async function openUserDetail(userId) {
  selectedUser = profiles.find((profile) => profile.id === userId);
  if (!selectedUser) return;
  $('#user-detail-panel').hidden = false;
  $('#selected-user-title').textContent = selectedUser.full_name || selectedUser.email || 'Selected user';
  $('#selected-user-id').textContent = `${selectedUser.id} · ${selectedUser.referral_code}`;
  $('#edit-user-id').value = selectedUser.id;
  $('#edit-user-name').value = selectedUser.full_name || '';
  $('#edit-user-email').value = selectedUser.email || '';
  $('#edit-user-phone').value = selectedUser.phone || '';
  $('#edit-user-country').value = selectedUser.country || 'India';
  $('#edit-user-role').value = selectedUser.role || 'student';
  $('#edit-user-role').disabled = currentUser.id !== SUPER_ADMIN_ID;
  $('#edit-user-active').checked = Boolean(selectedUser.is_active);
  $('#edit-user-password').value = '';
  setMessage('#admin-user-message', ''); setMessage('#admin-password-message', '');
  const [teamResult, walletResult] = await Promise.all([
    supabaseClient.rpc('admin_get_user_team', { p_user_id: selectedUser.id }),
    supabaseClient.rpc('admin_get_user_wallet_summary', { p_user_id: selectedUser.id })
  ]);
  if (teamResult.error || walletResult.error) { showToast(teamResult.error?.message || walletResult.error?.message || 'Unable to load user details.'); return; }
  const team = teamResult.data || [];
  const walletSummary = walletResult.data?.[0] || {};
  const balance = Number(walletSummary.balance || 0);
  $('#selected-user-joined').textContent = dateLabel(selectedUser.created_at);
  $('#selected-user-activated').textContent = selectedUser.activated_at ? dateLabel(selectedUser.activated_at) : 'Not active';
  $('#selected-user-kyc').textContent = (selectedUser.kyc_status || 'not_submitted').replace('_', ' ');
  const referrer = profiles.find((profile) => profile.id === selectedUser.referred_by);
  $('#selected-user-referrer').textContent = referrer?.full_name || referrer?.referral_code || 'Direct / unknown';
  $('#selected-user-wallet').textContent = `₹${money(balance)}`;
  $('#selected-user-team').textContent = team.length;
  $('#selected-user-team-list').innerHTML = team.length ? team.map((member) => `<span class="team-preview-member">${escapeHtml(member.full_name || member.email || 'User')} <em>L${member.level}</em></span>`).join('') : '<span class="muted-note">No team members yet.</span>';
  $('#user-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function searchUsers() {
  userPage = 1;
  applyUserFilters();
}

function applyUserFilters() {
  const query = $('#user-search').value.trim().toLowerCase();
  visibleProfiles = profiles.filter((profile) => {
    const matchesQuery = !query || [profile.id, profile.referral_code, profile.email, profile.full_name, profile.phone].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = userStatusFilter === 'all'
      || (userStatusFilter === 'active' && profile.is_active)
      || (userStatusFilter === 'inactive' && !profile.is_active)
      || (userStatusFilter === 'admin' && profile.role === 'admin');
    return matchesQuery && matchesStatus;
  });
  renderUsers();
  if (query && visibleProfiles.length === 1) openUserDetail(visibleProfiles[0].id);
}

function closeUserDetail() { $('#user-detail-panel').hidden = true; selectedUser = null; }

async function saveUserProfile(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  data.role = $('#edit-user-role').value;
  if (data.role === 'admin' && currentUser.id !== SUPER_ADMIN_ID) { setMessage('#admin-user-message', 'Only the super admin can grant admin access.'); return; }
  const { error } = await supabaseClient.functions.invoke('admin-user-management', { body: { action: 'update_profile', user_id: data.user_id, full_name: data.full_name, email: data.email, phone: data.phone, country: data.country, role: data.role, is_active: data.is_active === 'on' } });
  if (error) { setMessage('#admin-user-message', error.message); return; }
  setMessage('#admin-user-message', 'Profile updated successfully.', true); showToast('User profile updated.', true); await loadData(); await openUserDetail(data.user_id);
}

async function resetUserPassword() {
  const password = $('#edit-user-password').value;
  if (!selectedUser) { setMessage('#admin-password-message', 'Select a user first.'); return; }
  if (currentUser.id !== SUPER_ADMIN_ID) { setMessage('#admin-password-message', 'Only the super admin can reset passwords.'); return; }
  if (password.length < 8) { setMessage('#admin-password-message', 'New password must be at least 8 characters.'); return; }
  const button = $('#reset-user-password'); button.disabled = true;
  const { error } = await supabaseClient.functions.invoke('admin-user-management', { body: { action: 'reset_password', user_id: selectedUser.id, new_password: password } });
  button.disabled = false;
  if (error) { setMessage('#admin-password-message', error.message); return; }
  $('#edit-user-password').value = ''; setMessage('#admin-password-message', 'Password reset successfully. Share it securely with the user.', true); showToast('Password reset completed.', true);
}

async function toggleUser(button) {
  const nextActive = button.dataset.active !== 'true';
  const action = nextActive ? 'activate' : 'deactivate';
  if (!window.confirm(`Are you sure you want to ${action} this user ID?`)) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc('admin_update_user_status', { p_user_id: button.dataset.userId, p_is_active: nextActive, p_kyc_status: null, p_role: null });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast('User status updated.', true); await loadData();
}

async function reviewKyc(button) {
  const status = button.dataset.kycAction === 'approve' ? 'approved' : 'rejected';
  if (status === 'approved' && !window.confirm('Approve this KYC submission?')) return;
  const reason = status === 'rejected' ? window.prompt('Reason for rejection (required)', 'Please upload a clearer document.')?.trim() : null;
  if (status === 'rejected' && !reason) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc('admin_review_kyc', { p_kyc_id: button.dataset.kycId, p_status: status, p_rejection_reason: reason });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast(`KYC ${status}.`, true); await loadData();
}

async function reviewKycChangeRequest(button) {
  const status = button.dataset.kycChangeAction === 'approve' ? 'approved' : 'rejected';
  const response = window.prompt('Write the response that will be shared with the user (required)')?.trim();
  if (!response) return;
  const channel = window.prompt('Response channel: whatsapp, telegram or both', 'whatsapp')?.trim().toLowerCase();
  if (!['whatsapp', 'telegram', 'both'].includes(channel)) { showToast('Choose whatsapp, telegram or both.'); return; }
  if (!window.confirm(`${status === 'approved' ? 'Accept' : 'Reject'} this KYC change request?`)) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc('admin_review_kyc_change_request', { p_request_id: button.dataset.kycChangeId, p_status: status, p_response: response, p_responded_via: channel });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast(`KYC change request ${status}.`, true);
  await loadData();
}

async function reviewFinance(button) {
  const status = button.dataset.financeAction === 'approve' ? 'approved' : 'rejected';
  const kind = button.dataset.financeKind;
  const functionName = kind === 'deposit' ? 'admin_review_deposit' : 'admin_review_withdrawal';
  if (status === 'approved' && !window.confirm(`Approve this ${kind} request?`)) return;
  const reason = status === 'rejected' ? window.prompt('Reason for rejection (required)', 'Request could not be approved.')?.trim() : null;
  if (status === 'rejected' && !reason) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc(functionName, { p_request_id: button.dataset.financeId, p_status: status, p_note: reason });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast(`${kind} request ${status}.`, true); await loadData();
}

async function markWithdrawalPaid(button) {
  const reference = window.prompt('Enter payout reference / UTR (required)')?.trim();
  if (!reference) return;
  if (!window.confirm('Mark this approved withdrawal as paid?')) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc('admin_mark_withdrawal_paid', { p_request_id: button.dataset.financeId, p_payout_reference: reference });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast('Withdrawal marked as paid.', true); await loadData();
}

async function uploadCoursePdf(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const course = courses.find((item) => item.id === data.get('course_id'));
  const file = data.get('pdf');
  if (!course || !(file instanceof File) || !file.size) { setMessage('#course-upload-message', 'Choose a course and PDF first.'); return; }
  if (file.size > 25 * 1024 * 1024 || file.type !== 'application/pdf') { setMessage('#course-upload-message', 'Please upload a PDF smaller than 25MB.'); return; }
  const safeFileName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
  const path = `${course.id}/${Date.now()}-${safeFileName}`;
  const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Uploading…';
  const { error: uploadError } = await supabaseClient.storage.from('course-pdfs').upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (uploadError) { button.disabled = false; button.innerHTML = 'Upload to course-pdfs <span class="button-arrow">↗</span>'; setMessage('#course-upload-message', uploadError.message); return; }
  const previousPath = course.pdf_path;
  const { error } = await supabaseClient.rpc('admin_update_course', { p_course_id: course.id, p_status: course.status, p_pdf_path: path });
  button.disabled = false; button.innerHTML = 'Upload to course-pdfs <span class="button-arrow">↗</span>';
  if (error) { await supabaseClient.storage.from('course-pdfs').remove([path]); setMessage('#course-upload-message', error.message); return; }
  if (previousPath && previousPath !== path) await supabaseClient.storage.from('course-pdfs').remove([previousPath]);
  form.reset(); setMessage('#course-upload-message', 'PDF uploaded and connected to the course.', true); showToast('Course PDF uploaded.', true); await loadData();
}

async function toggleCourseStatus(button) {
  const course = courses.find((item) => item.id === button.dataset.courseId);
  if (!course) return;
  const nextStatus = course.status === 'published' ? 'draft' : 'published';
  if (!window.confirm(`Move “${course.title}” to ${nextStatus}?`)) return;
  button.disabled = true;
  const { error } = await supabaseClient.rpc('admin_update_course', { p_course_id: course.id, p_status: nextStatus, p_pdf_path: course.pdf_path || null });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast(`Course moved to ${nextStatus}.`, true); await loadData();
}

async function removeCoursePdf(button) {
  const course = courses.find((item) => item.id === button.dataset.courseId);
  if (!course?.pdf_path) return;
  if (!window.confirm(`Remove the PDF attached to “${course.title}”?`)) return;
  button.disabled = true;
  const { error: storageError } = await supabaseClient.storage.from('course-pdfs').remove([course.pdf_path]);
  if (storageError) { showToast(storageError.message); button.disabled = false; return; }
  const { error } = await supabaseClient.rpc('admin_update_course', { p_course_id: course.id, p_status: course.status, p_pdf_path: null });
  if (error) { showToast(error.message); button.disabled = false; return; }
  showToast('Course PDF removed.', true); await loadData();
}

document.addEventListener('click', (event) => {
  const sectionTrigger = event.target.closest('[data-admin-section]');
  if (sectionTrigger) switchAdminSection(sectionTrigger.dataset.adminSection);
});
$('#admin-mobile-menu')?.addEventListener('click', () => $('#admin-sidebar').classList.add('open'));
$('#admin-mobile-close')?.addEventListener('click', () => $('#admin-sidebar').classList.remove('open'));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#admin-sidebar')?.classList.remove('open'); });
document.addEventListener('click', (event) => {
  const sidebar = $('#admin-sidebar');
  const menu = $('#admin-mobile-menu');
  if (window.innerWidth <= 700 && sidebar?.classList.contains('open') && !sidebar.contains(event.target) && !menu?.contains(event.target)) sidebar.classList.remove('open');
});
$('#admin-logout')?.addEventListener('click', async () => { await supabaseClient.auth.signOut(); window.location.replace('index.html'); });
$('#refresh-admin')?.addEventListener('click', refreshData);
$('#course-upload-form')?.addEventListener('submit', uploadCoursePdf);
$('#user-search-button')?.addEventListener('click', searchUsers);
$('#user-search')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchUsers(); } });
$('#close-user-detail')?.addEventListener('click', closeUserDetail);
$('#admin-user-edit-form')?.addEventListener('submit', saveUserProfile);
$('#reset-user-password')?.addEventListener('click', resetUserPassword);
document.addEventListener('click', (event) => {
  const userAction = event.target.closest('[data-user-action]');
  const kycAction = event.target.closest('[data-kyc-action]');
  const kycChangeAction = event.target.closest('[data-kyc-change-action]');
  const financeAction = event.target.closest('[data-finance-action]');
  const courseAction = event.target.closest('[data-course-action]');
  if (userAction?.dataset.userAction === 'select') openUserDetail(userAction.dataset.userId);
  if (userAction?.dataset.userAction === 'toggle') toggleUser(userAction);
  if (kycAction) reviewKyc(kycAction);
  if (kycChangeAction) reviewKycChangeRequest(kycChangeAction);
  if (financeAction?.dataset.financeAction === 'paid') markWithdrawalPaid(financeAction);
  else if (financeAction) reviewFinance(financeAction);
  if (courseAction?.dataset.courseAction === 'toggle-status') toggleCourseStatus(courseAction);
  if (courseAction?.dataset.courseAction === 'remove-pdf') removeCoursePdf(courseAction);
});

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user;
  if (!currentUser) { document.body.classList.add('admin-unauthorized'); $('#admin-gate').hidden = false; return; }
  const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || (profile?.role !== 'admin' && currentUser.id !== SUPER_ADMIN_ID)) { document.body.classList.add('admin-unauthorized'); $('#admin-gate').hidden = false; return; }
  currentProfile = profile;
  $('#admin-content').hidden = false;
  ensureAdminOverview();
  ensureAdminModules();
  ensureSidebarBadges();
  ensureAdminFilters();
  renderHeader();
  await loadData();
  adminRealtimeChannel = supabaseClient.channel('admin-live-requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, scheduleLiveRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_submissions' }, scheduleLiveRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_change_requests' }, scheduleLiveRefresh)
    .subscribe();
  const initialSection = window.location.hash.replace('#', '');
  if (['overview', 'users', 'kyc', 'finance', 'courses', 'referrals', 'transactions', 'settings'].includes(initialSection)) switchAdminSection(initialSection);
})();
