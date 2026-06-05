// ============================================
// AMBASSADOR CONNECT — APP v3
// Drag-and-drop Kanban · YOE · Range Filters
// ============================================

const AMBASSADOR_TAGS = [
  'Chef','Kitchen Consultant','Kitchen Equipment Dealer/Distributor',
  'Food Business Owner (Small)','Food Business Owner (Large Chain)',
  'Government Projects Consultant','Culinary Institute'
];

const TAG_COLORS = {
  'Chef':                                 { bg:'#fff0f0', text:'#c0392b', border:'#ffcece' },
  'Kitchen Consultant':                   { bg:'#fff8e1', text:'#b7791f', border:'#fde68a' },
  'Kitchen Equipment Dealer/Distributor': { bg:'#f0fdfb', text:'#0f766e', border:'#99f6e4' },
  'Food Business Owner (Small)':          { bg:'#f5f3ff', text:'#6d28d9', border:'#ddd6fe' },
  'Food Business Owner (Large Chain)':    { bg:'#eff6ff', text:'#1d4ed8', border:'#bfdbfe' },
  'Government Projects Consultant':       { bg:'#f0fdf4', text:'#166534', border:'#bbf7d0' },
  'Culinary Institute':                   { bg:'#fdf4ff', text:'#86198f', border:'#f0abfc' }
};

let currentUser      = null;
let currentProfile   = null;
let allAmbassadors   = [];
let allProfiles      = [];
let currentAmbassadorId = null;
let allNotes         = [];
let noteFilter       = 'all';
let ambViewMode      = 'grid';
let myViewMode       = 'grid';
let activeFilters    = { search:'', city:'', state:'', assigned:'', status:'', tag:'',
                         followersMin:'', followersMax:'', yoeMin:'', yoeMax:'' };
let quickAssignAmbId = null;

// drag state
let dragAmbId  = null;
let dragSource = null;

// ============================================
// INIT
// ============================================
(async () => {
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  currentUser = session.user;
  await loadProfile();
  await Promise.all([loadAmbassadors(), loadProfiles()]);
  renderDashboard();
})();

async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error || !data) return;
  currentProfile = data;
  updateUserUI();
  showAdminElements();
}

function updateUserUI() {
  const name = currentProfile.full_name || currentProfile.email;
  const e = id => document.getElementById(id);
  if (e('userNameSidebar'))  e('userNameSidebar').textContent  = name.split(' ')[0];
  if (e('userRoleSidebar'))  e('userRoleSidebar').textContent  = currentProfile.role;
  if (e('userAvatarSidebar')){ e('userAvatarSidebar').textContent = getInitials(name); e('userAvatarSidebar').style.background = getAvatarColor(name); }
}

function showAdminElements() {
  if (currentProfile?.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    const btn = document.getElementById('addAmbassadorBtn');
    if (btn) btn.style.display = '';
  }
}

// ============================================
// NAVIGATION
// ============================================
function switchView(viewId, linkEl) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById(`view-${viewId}`);
  if (view) view.classList.add('active');
  if (linkEl) linkEl.classList.add('active');
  const titles = { dashboard:'Dashboard', ambassadors:'All Ambassadors', 'my-ambassadors':'My Assignments', sales:'Sales Members', admin:'Admin Panel' };
  document.getElementById('pageTitle').textContent = titles[viewId] || 'Dashboard';
  if (viewId === 'ambassadors')    { populateFilterDropdowns(); applyFilters(); }
  if (viewId === 'my-ambassadors') renderMyAmbassadors();
  if (viewId === 'sales')          loadSalesView();
  if (viewId === 'admin')          loadAdminView();
  if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ============================================
// DATA
// ============================================
async function loadAmbassadors() {
  const { data, error } = await sb.from('ambassadors')
    .select('*, assigned_profile:profiles!ambassadors_assigned_to_fkey(id, full_name, email)')
    .order('name');
  if (error) { console.error(error); return; }
  allAmbassadors = data || [];
  updateStats();
  renderTopAmbassadors();
}

async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('*').order('full_name');
  if (error) return;
  allProfiles = data || [];
}

// ============================================
// VIEW MODE
// ============================================
function setAmbView(mode, btn) {
  ambViewMode = mode;
  document.querySelectorAll('[id^="vbtn-"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#view-ambassadors .amb-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`amb-view-${mode}`).classList.add('active');
  applyFilters();
}

function setMyView(mode, btn) {
  myViewMode = mode;
  document.querySelectorAll('[id^="mvbtn-"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#view-my-ambassadors .amb-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`my-view-${mode}`).classList.add('active');
  renderMyAmbassadors();
}

// ============================================
// FILTERS
// ============================================
function populateFilterDropdowns() {
  const cities = [...new Set(allAmbassadors.map(a => a.city).filter(Boolean))].sort();
  const cityEl = document.getElementById('filterCity');
  if (cityEl) { cityEl.innerHTML = '<option value="">All Cities</option>' + cities.map(c=>`<option value="${c}">${c}</option>`).join(''); cityEl.value = activeFilters.city; }

  const states = [...new Set(allAmbassadors.map(a => a.state).filter(Boolean))].sort();
  const stateEl = document.getElementById('filterState');
  if (stateEl) { stateEl.innerHTML = '<option value="">All States</option>' + states.map(s=>`<option value="${s}">${s}</option>`).join(''); stateEl.value = activeFilters.state; }

  const assignedEl = document.getElementById('filterAssigned');
  if (assignedEl) {
    assignedEl.innerHTML = '<option value="">All Members</option><option value="unassigned">Unassigned</option>' +
      allProfiles.filter(p => p.role==='sales'||p.role==='admin').map(p=>`<option value="${p.id}">${p.full_name}</option>`).join('');
    assignedEl.value = activeFilters.assigned;
  }

  // Restore range values
  ['followersMin','followersMax','yoeMin','yoeMax'].forEach(k => {
    const el = document.getElementById('filter_'+k);
    if (el) el.value = activeFilters[k];
  });

  renderTagFilterChips();
}

function renderTagFilterChips() {
  const container = document.getElementById('tagFilterChips');
  if (!container) return;
  container.innerHTML = AMBASSADOR_TAGS.map(tag => {
    const tc = TAG_COLORS[tag] || { bg:'#f4f4f5', text:'#3f3f46', border:'#e4e4e7' };
    const isActive = activeFilters.tag === tag;
    return `<button class="tag-filter-chip ${isActive?'active':''}" style="--tag-bg:${tc.bg};--tag-text:${tc.text};--tag-border:${tc.border}" onclick="toggleTagFilter('${tag}',this)">${tag}</button>`;
  }).join('');
}

function toggleTagFilter(tag, btn) {
  activeFilters.tag = activeFilters.tag===tag ? '' : tag;
  document.querySelectorAll('.tag-filter-chip').forEach(c => c.classList.remove('active'));
  if (activeFilters.tag) btn.classList.add('active');
  applyFilters(); updateClearBtn();
}

function applyFilters() {
  const g = id => document.getElementById(id);
  if (g('ambSearch'))       activeFilters.search      = g('ambSearch').value.toLowerCase();
  if (g('filterCity'))      activeFilters.city        = g('filterCity').value;
  if (g('filterState'))     activeFilters.state       = g('filterState').value;
  if (g('filterAssigned'))  activeFilters.assigned    = g('filterAssigned').value;
  if (g('filterStatus'))    activeFilters.status      = g('filterStatus').value;
  if (g('filter_followersMin')) activeFilters.followersMin = g('filter_followersMin').value;
  if (g('filter_followersMax')) activeFilters.followersMax = g('filter_followersMax').value;
  if (g('filter_yoeMin'))   activeFilters.yoeMin      = g('filter_yoeMin').value;
  if (g('filter_yoeMax'))   activeFilters.yoeMax      = g('filter_yoeMax').value;

  let filtered = allAmbassadors.filter(a => {
    const q = activeFilters.search;
    if (q && !a.name?.toLowerCase().includes(q) && !a.city?.toLowerCase().includes(q) &&
             !a.state?.toLowerCase().includes(q) && !(a.tags||[]).some(t=>t.toLowerCase().includes(q))) return false;
    if (activeFilters.city   && a.city  !== activeFilters.city)  return false;
    if (activeFilters.state  && a.state !== activeFilters.state) return false;
    if (activeFilters.status && a.status !== activeFilters.status) return false;
    if (activeFilters.assigned==='unassigned' && a.assigned_to) return false;
    if (activeFilters.assigned && activeFilters.assigned!=='unassigned' && a.assigned_to !== activeFilters.assigned) return false;
    if (activeFilters.tag && !(a.tags||[]).includes(activeFilters.tag)) return false;
    if (activeFilters.followersMin && (a.followers||0) < Number(activeFilters.followersMin)) return false;
    if (activeFilters.followersMax && (a.followers||0) > Number(activeFilters.followersMax)) return false;
    if (activeFilters.yoeMin && (a.years_experience||0) < Number(activeFilters.yoeMin)) return false;
    if (activeFilters.yoeMax && (a.years_experience||0) > Number(activeFilters.yoeMax)) return false;
    return true;
  });

  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = `${filtered.length} ambassador${filtered.length!==1?'s':''}`;
  updateClearBtn();

  if (ambViewMode==='grid')    renderGridView(filtered);
  if (ambViewMode==='list')    renderListView(filtered);
  if (ambViewMode==='kanban')  renderKanbanView(filtered);
  if (ambViewMode==='compact') renderCompactView(filtered);
}

function updateClearBtn() {
  const btn = document.getElementById('clearFiltersBtn');
  if (!btn) return;
  btn.style.display = Object.values(activeFilters).some(v=>v!=='') ? '' : 'none';
}

function clearFilters() {
  activeFilters = { search:'', city:'', state:'', assigned:'', status:'', tag:'', followersMin:'', followersMax:'', yoeMin:'', yoeMax:'' };
  ['ambSearch','filterCity','filterState','filterAssigned','filterStatus',
   'filter_followersMin','filter_followersMax','filter_yoeMin','filter_yoeMax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('.tag-filter-chip').forEach(c => c.classList.remove('active'));
  applyFilters();
}

function handleSearch(query) {
  activeFilters.search = query.toLowerCase();
  const el = document.getElementById('ambSearch');
  if (el) el.value = query;
  switchView('ambassadors', document.querySelector('[data-view="ambassadors"]'));
  applyFilters();
}

// ============================================
// GRID VIEW
// ============================================
function renderGridView(list) {
  const grid = document.getElementById('ambassadorsGrid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML = emptyState(); return; }
  grid.innerHTML = list.map(amb => {
    const color = getAvatarColor(amb.name);
    const assignedName = amb.assigned_profile?.full_name || 'Unassigned';
    const tagsHtml = (amb.tags||[]).map(t=>tagBadge(t)).join('');
    return `
    <div class="ambassador-card" onclick="openAmbassadorDetail('${amb.id}')">
      <div class="amb-card-top">
        <div class="ambassador-avatar" style="background:${color}">${getInitials(amb.name)}</div>
        <div class="amb-card-info">
          <div class="amb-card-name">${amb.name}</div>
          <div class="amb-card-location">📍 ${amb.city}, ${amb.state}</div>
        </div>
        <span class="status-badge status-${amb.status||'active'}">${amb.status||'active'}</span>
      </div>
      ${tagsHtml ? `<div class="amb-tags-row">${tagsHtml}</div>` : ''}
      <div class="amb-card-stats">
        <div class="amb-stat">
          <span class="amb-stat-val">${formatFollowers(amb.followers)}</span>
          <span class="amb-stat-label">Followers</span>
        </div>
        <div class="amb-stat">
          <span class="amb-stat-val">${amb.years_experience != null ? amb.years_experience+'y' : '—'}</span>
          <span class="amb-stat-label">Exp.</span>
        </div>
      </div>
      <div class="amb-card-footer">
        <div class="assigned-chip">
          <div class="assigned-dot" style="background:${amb.assigned_to?'#14b8a6':'#d1d5db'}"></div>
          <span>${assignedName}</span>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center">
          ${amb.linkedin_url?`<a href="${amb.linkedin_url}" target="_blank" onclick="event.stopPropagation()" class="linkedin-link">in</a>`:''}
          <button class="assign-quick-btn" onclick="event.stopPropagation();openQuickAssign('${amb.id}')" title="Reassign">⇄</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================
// LIST VIEW
// ============================================
function renderListView(list) {
  const tbody = document.getElementById('ambassadorsListBody');
  if (!tbody) return;
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="8">${emptyState()}</td></tr>`; return; }
  tbody.innerHTML = list.map(amb => {
    const color = getAvatarColor(amb.name);
    const assignedName = amb.assigned_profile?.full_name || '—';
    const tagsHtml = (amb.tags||[]).map(t=>tagBadge(t,true)).join('');
    return `
    <tr onclick="openAmbassadorDetail('${amb.id}')" style="cursor:pointer">
      <td>
        <div style="display:flex;align-items:center;gap:0.625rem">
          <div class="ambassador-avatar" style="background:${color};width:34px;height:34px;font-size:0.75rem;flex-shrink:0">${getInitials(amb.name)}</div>
          <div>
            <div style="font-weight:600;font-size:0.875rem">${amb.name}</div>
            ${tagsHtml?`<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:3px">${tagsHtml}</div>`:''}
          </div>
        </div>
      </td>
      <td>${amb.city||'—'}</td>
      <td>${amb.state||'—'}</td>
      <td style="font-weight:600">${formatFollowers(amb.followers)}</td>
      <td style="font-weight:600">${amb.years_experience!=null?amb.years_experience+' yrs':'—'}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.4rem">
          <span>${assignedName}</span>
          <button class="assign-quick-btn" onclick="event.stopPropagation();openQuickAssign('${amb.id}')" title="Reassign">⇄</button>
        </div>
      </td>
      <td><span class="status-badge status-${amb.status||'active'}">${amb.status||'active'}</span></td>
      <td>
        <div style="display:flex;gap:0.375rem">
          ${amb.linkedin_url?`<a href="${amb.linkedin_url}" target="_blank" onclick="event.stopPropagation()" class="linkedin-link">in</a>`:''}
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();editAmbassador('${amb.id}')">✎</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ============================================
// KANBAN VIEW — Drag & Drop
// ============================================
function renderKanbanView(list) {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;

  const columns = [{ id:'unassigned', name:'Unassigned', color:'#a1a1aa' }];
  allProfiles.filter(p=>p.role==='sales'||p.role==='admin').forEach(p => {
    columns.push({ id:p.id, name:p.full_name, color:getAvatarColor(p.full_name) });
  });

  board.innerHTML = columns.map(col => {
    const colAmbs = list.filter(a => col.id==='unassigned' ? !a.assigned_to : a.assigned_to===col.id);
    const cards = colAmbs.map(amb => kanbanCard(amb)).join('');

    return `
    <div class="kanban-col" id="kcol-${col.id}"
      data-col-id="${col.id}"
      ondragover="onKanbanDragOver(event)"
      ondragenter="onKanbanDragEnter(event,this)"
      ondragleave="onKanbanDragLeave(event,this)"
      ondrop="onKanbanDrop(event,this,'${col.id}')">
      <div class="kanban-col-header">
        <div class="kanban-col-dot" style="background:${col.color}"></div>
        <span class="kanban-col-name">${col.name}</span>
        <span class="kanban-col-count" id="kcount-${col.id}">${colAmbs.length}</span>
      </div>
      <div class="kanban-col-body" id="kbody-${col.id}">${cards ||
        `<div class="kanban-drop-hint" id="khint-${col.id}">Drop here</div>`
      }</div>
    </div>`;
  }).join('');
}

function kanbanCard(amb) {
  const tagsHtml = (amb.tags||[]).slice(0,2).map(t=>tagBadge(t,true)).join('');
  return `
  <div class="kanban-card" id="kcard-${amb.id}"
    draggable="true"
    data-amb-id="${amb.id}"
    ondragstart="onKanbanDragStart(event,this,'${amb.id}')"
    ondragend="onKanbanDragEnd(event,this)"
    onclick="openAmbassadorDetail('${amb.id}')">
    <div class="kanban-card-top">
      <div class="ambassador-avatar" style="background:${getAvatarColor(amb.name)};width:30px;height:30px;font-size:0.7rem;flex-shrink:0">${getInitials(amb.name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:0.83rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${amb.name}</div>
        <div style="font-size:0.72rem;color:var(--gray-400)">📍 ${amb.city}, ${amb.state}</div>
      </div>
      <span class="status-badge status-${amb.status||'active'}" style="font-size:0.6rem">${amb.status||'active'}</span>
    </div>
    ${tagsHtml?`<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:6px">${tagsHtml}</div>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
      <div style="display:flex;gap:0.75rem">
        <span style="font-size:0.75rem;font-weight:600;color:var(--coral)">${formatFollowers(amb.followers)}</span>
        ${amb.years_experience!=null?`<span style="font-size:0.75rem;font-weight:600;color:var(--teal)">${amb.years_experience}y exp</span>`:''}
      </div>
      <div class="kanban-drag-handle" title="Drag to reassign">⠿</div>
    </div>
  </div>`;
}

// --- Drag handlers ---
function onKanbanDragStart(event, el, ambId) {
  dragAmbId  = ambId;
  dragSource = el.closest('.kanban-col').dataset.colId;
  el.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', ambId);
}

function onKanbanDragEnd(event, el) {
  el.classList.remove('dragging');
  document.querySelectorAll('.kanban-col.drag-over').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.kanban-drop-hint.visible').forEach(h => h.classList.remove('visible'));
  dragAmbId = null; dragSource = null;
}

function onKanbanDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function onKanbanDragEnter(event, col) {
  event.preventDefault();
  col.classList.add('drag-over');
  const hint = col.querySelector('.kanban-drop-hint');
  if (hint) hint.classList.add('visible');
}

function onKanbanDragLeave(event, col) {
  if (!col.contains(event.relatedTarget)) {
    col.classList.remove('drag-over');
    const hint = col.querySelector('.kanban-drop-hint');
    if (hint) hint.classList.remove('visible');
  }
}

async function onKanbanDrop(event, colEl, targetColId) {
  event.preventDefault();
  colEl.classList.remove('drag-over');
  const hint = colEl.querySelector('.kanban-drop-hint');
  if (hint) hint.classList.remove('visible');

  const ambId = event.dataTransfer.getData('text/plain') || dragAmbId;
  if (!ambId || targetColId === dragSource) return;

  const newAssigned = targetColId === 'unassigned' ? null : targetColId;
  const { error } = await sb.from('ambassadors').update({ assigned_to: newAssigned }).eq('id', ambId);
  if (error) { showToast('Failed to reassign: ' + error.message, 'error'); return; }

  // Optimistic UI update
  const amb = allAmbassadors.find(a => a.id === ambId);
  if (amb) {
    amb.assigned_to = newAssigned;
    const newProfile = allProfiles.find(p => p.id === newAssigned);
    amb.assigned_profile = newProfile ? { id: newProfile.id, full_name: newProfile.full_name } : null;
  }

  const assigneeName = newAssigned ? allProfiles.find(p=>p.id===newAssigned)?.full_name : 'Unassigned';
  showToast(`Assigned to ${assigneeName}!`);

  // Re-render only kanban (fast)
  applyFilters();
  updateStats();
}

// ============================================
// COMPACT VIEW
// ============================================
function renderCompactView(list) {
  const container = document.getElementById('ambassadorsCompact');
  if (!container) return;
  if (!list.length) { container.innerHTML = emptyState(); return; }
  container.innerHTML = list.map(amb => {
    const color = getAvatarColor(amb.name);
    const assignedName = amb.assigned_profile?.full_name || 'Unassigned';
    const tagsHtml = (amb.tags||[]).map(t=>tagBadge(t,true)).join('');
    return `
    <div class="compact-row" onclick="openAmbassadorDetail('${amb.id}')">
      <div class="ambassador-avatar" style="background:${color};width:32px;height:32px;font-size:0.7rem;flex-shrink:0">${getInitials(amb.name)}</div>
      <div class="compact-row-name">
        <span style="font-weight:600;font-size:0.875rem">${amb.name}</span>
        ${tagsHtml?`<span style="display:flex;gap:3px;flex-wrap:wrap">${tagsHtml}</span>`:''}
      </div>
      <div class="compact-row-loc">📍 ${amb.city}, ${amb.state}</div>
      <div class="compact-row-followers">${formatFollowers(amb.followers)}</div>
      <div class="compact-row-yoe" style="font-size:0.8rem;font-weight:600;color:var(--teal)">${amb.years_experience!=null?amb.years_experience+'y':'—'}</div>
      <div class="compact-row-assigned">
        <span>${assignedName}</span>
        <button class="assign-quick-btn" onclick="event.stopPropagation();openQuickAssign('${amb.id}')" title="Reassign">⇄</button>
      </div>
      <span class="status-badge status-${amb.status||'active'}">${amb.status||'active'}</span>
      ${amb.linkedin_url?`<a href="${amb.linkedin_url}" target="_blank" onclick="event.stopPropagation()" class="linkedin-link">in</a>`:'<span></span>'}
    </div>`;
  }).join('');
}

// ============================================
// MY ASSIGNMENTS
// ============================================
function renderMyAmbassadors() {
  const q = document.getElementById('myAmbSearch')?.value?.toLowerCase() || '';
  let mine = allAmbassadors.filter(a => a.assigned_to === currentUser.id);
  if (q) mine = mine.filter(a => a.name?.toLowerCase().includes(q)||a.city?.toLowerCase().includes(q)||a.state?.toLowerCase().includes(q));

  if (myViewMode === 'grid') {
    const grid = document.getElementById('myAmbassadorsGrid');
    if (!grid) return;
    if (!mine.length) { grid.innerHTML = emptyState('No ambassadors assigned to you yet.'); return; }
    grid.innerHTML = mine.map(amb => {
      const color = getAvatarColor(amb.name);
      const tagsHtml = (amb.tags||[]).map(t=>tagBadge(t)).join('');
      return `
      <div class="ambassador-card" onclick="openAmbassadorDetail('${amb.id}')">
        <div class="amb-card-top">
          <div class="ambassador-avatar" style="background:${color}">${getInitials(amb.name)}</div>
          <div class="amb-card-info">
            <div class="amb-card-name">${amb.name}</div>
            <div class="amb-card-location">📍 ${amb.city}, ${amb.state}</div>
          </div>
          <span class="status-badge status-${amb.status||'active'}">${amb.status||'active'}</span>
        </div>
        ${tagsHtml?`<div class="amb-tags-row">${tagsHtml}</div>`:''}
        <div class="amb-card-stats">
          <div class="amb-stat"><span class="amb-stat-val">${formatFollowers(amb.followers)}</span><span class="amb-stat-label">Followers</span></div>
          <div class="amb-stat"><span class="amb-stat-val">${amb.years_experience!=null?amb.years_experience+'y':'—'}</span><span class="amb-stat-label">Exp.</span></div>
        </div>
        <div class="amb-card-footer">
          ${amb.linkedin_url?`<a href="${amb.linkedin_url}" target="_blank" onclick="event.stopPropagation()" class="linkedin-link">in</a>`:'<span></span>'}
        </div>
      </div>`;
    }).join('');
  } else {
    const tbody = document.getElementById('myAmbassadorsListBody');
    if (!tbody) return;
    if (!mine.length) { tbody.innerHTML=`<tr><td colspan="7">${emptyState()}</td></tr>`; return; }
    tbody.innerHTML = mine.map(amb => {
      const color = getAvatarColor(amb.name);
      const tagsHtml = (amb.tags||[]).map(t=>tagBadge(t,true)).join('');
      return `
      <tr onclick="openAmbassadorDetail('${amb.id}')" style="cursor:pointer">
        <td><div style="display:flex;align-items:center;gap:0.625rem">
          <div class="ambassador-avatar" style="background:${color};width:34px;height:34px;font-size:0.75rem;flex-shrink:0">${getInitials(amb.name)}</div>
          <div><div style="font-weight:600;font-size:0.875rem">${amb.name}</div>
          ${tagsHtml?`<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:3px">${tagsHtml}</div>`:''}
        </div></div></td>
        <td>${amb.city}</td><td>${amb.state}</td>
        <td style="font-weight:600">${formatFollowers(amb.followers)}</td>
        <td style="font-weight:600;color:var(--teal)">${amb.years_experience!=null?amb.years_experience+' yrs':'—'}</td>
        <td><span class="status-badge status-${amb.status||'active'}">${amb.status||'active'}</span></td>
        <td>${amb.linkedin_url?`<a href="${amb.linkedin_url}" target="_blank" onclick="event.stopPropagation()" class="linkedin-link">in</a>`:''}</td>
      </tr>`;
    }).join('');
  }
}

// ============================================
// TAG HELPERS
// ============================================
function tagBadge(tag, small=false) {
  const tc = TAG_COLORS[tag] || { bg:'#f4f4f5', text:'#3f3f46', border:'#e4e4e7' };
  return `<span style="background:${tc.bg};color:${tc.text};border:1px solid ${tc.border};font-size:${small?'0.6':'0.68'}rem;font-weight:600;padding:${small?'1px 5px':'2px 7px'};border-radius:999px;white-space:nowrap;font-family:var(--font-body)">${tag}</span>`;
}

function emptyState(msg='No ambassadors found.') {
  return `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">◎</div><p>${msg}</p></div>`;
}

// ============================================
// QUICK ASSIGN
// ============================================
function openQuickAssign(ambId) {
  quickAssignAmbId = ambId;
  const amb = allAmbassadors.find(a=>a.id===ambId);
  if (!amb) return;
  document.getElementById('quickAssignName').textContent = amb.name;
  const sel = document.getElementById('quickAssignSelect');
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    allProfiles.filter(p=>p.role==='sales'||p.role==='admin')
      .map(p=>`<option value="${p.id}" ${amb.assigned_to===p.id?'selected':''}>${p.full_name}</option>`).join('');
  openModal('quickAssignModal');
}

async function saveQuickAssign() {
  const assignTo = document.getElementById('quickAssignSelect').value || null;
  const { error } = await sb.from('ambassadors').update({ assigned_to: assignTo }).eq('id', quickAssignAmbId);
  if (error) { showToast('Failed to assign: '+error.message,'error'); return; }
  const amb = allAmbassadors.find(a=>a.id===quickAssignAmbId);
  if (amb) { amb.assigned_to = assignTo; amb.assigned_profile = assignTo ? allProfiles.find(p=>p.id===assignTo) : null; }
  showToast('Ambassador reassigned!');
  closeModal('quickAssignModal');
  await loadAmbassadors(); applyFilters(); renderMyAmbassadors();
}

// ============================================
// DETAIL MODAL
// ============================================
async function openAmbassadorDetail(id) {
  const amb = allAmbassadors.find(a=>a.id===id);
  if (!amb) return;
  currentAmbassadorId = id;
  const color = getAvatarColor(amb.name);
  document.getElementById('detailAvatar').textContent = getInitials(amb.name);
  document.getElementById('detailAvatar').style.background = color;
  document.getElementById('detailName').textContent = amb.name;
  document.getElementById('detailMeta').textContent = `${amb.city}, ${amb.state} · ${formatFollowers(amb.followers)} followers${amb.years_experience!=null?' · '+amb.years_experience+' yrs exp':''}`;

  const tagsSection = document.getElementById('detailTags');
  if (tagsSection) tagsSection.innerHTML = (amb.tags||[]).length ? (amb.tags).map(t=>tagBadge(t)).join('') : '<span style="color:var(--gray-400);font-size:0.83rem">No tags</span>';

  document.getElementById('detailContactInfo').innerHTML = [
    amb.email ? `<div class="contact-row"><span class="contact-icon">✉</span><a href="mailto:${amb.email}" class="contact-link">${amb.email}</a></div>` : '',
    amb.phone ? `<div class="contact-row"><span class="contact-icon">📞</span><span>${amb.phone}</span></div>` : '',
    amb.linkedin_url ? `<div class="contact-row"><span class="contact-icon">in</span><a href="${amb.linkedin_url}" target="_blank" class="contact-link">LinkedIn Profile</a></div>` : '',
  ].filter(Boolean).join('') || '<p style="color:var(--gray-400);font-size:0.83rem">No contact info</p>';

  const assignedProfile = allProfiles.find(p=>p.id===amb.assigned_to);
  document.getElementById('detailAssignment').innerHTML = assignedProfile
    ? `<div class="contact-row"><span class="contact-icon">◉</span><span>${assignedProfile.full_name}</span><button class="assign-quick-btn" style="margin-left:0.5rem" onclick="closeModal('detailModal');openQuickAssign('${amb.id}')">⇄</button></div>`
    : `<div class="contact-row" style="color:var(--gray-400);font-size:0.83rem">Unassigned <button class="assign-quick-btn" style="margin-left:0.5rem" onclick="closeModal('detailModal');openQuickAssign('${amb.id}')">Assign ⇄</button></div>`;

  document.getElementById('detailBio').textContent = amb.bio || '—';
  const deleteBtn = document.getElementById('detailDeleteBtn');
  if (deleteBtn) deleteBtn.style.display = currentProfile?.role==='admin' ? '' : 'none';

  noteFilter = 'all';
  document.querySelectorAll('.note-tab').forEach(t=>t.classList.toggle('active', t.dataset.type==='all'));
  await loadNotes(id);
  openModal('detailModal');
}

// ============================================
// NOTES
// ============================================
async function loadNotes(ambassadorId) {
  const notesList = document.getElementById('notesList');
  notesList.innerHTML = '<div class="loading-pulse">Loading notes...</div>';
  const { data, error } = await sb.from('notes')
    .select('*, author:profiles(full_name,id)')
    .eq('ambassador_id', ambassadorId)
    .order('created_at', { ascending:false });
  if (error) { notesList.innerHTML = '<p style="color:var(--coral);padding:1rem">Error loading notes.</p>'; return; }
  allNotes = data || [];
  renderNotes();
}

function renderNotes() {
  const notesList = document.getElementById('notesList');
  const filtered = noteFilter==='all' ? allNotes : allNotes.filter(n=>n.note_type===noteFilter);
  if (!filtered.length) { notesList.innerHTML=`<div class="empty-state"><div class="empty-state-icon">✎</div><p>No notes yet.</p></div>`; return; }
  const typeColors = { general:'#71717a',call:'#14b8a6',email:'#6366f1',meeting:'#f59e0b',follow_up:'#ff6b6b' };
  notesList.innerHTML = filtered.map(note => {
    const isOwn = note.author?.id===currentUser.id;
    const color = getAvatarColor(note.author?.full_name||'');
    return `<div class="note-card">
      <div class="note-card-top">
        <div class="note-author-row">
          <div class="note-avatar" style="background:${color}">${getInitials(note.author?.full_name||'?')}</div>
          <span class="note-author">${note.author?.full_name||'Unknown'}</span>
          <span class="note-time">${timeAgo(note.created_at)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span class="note-type-tag" style="background:${typeColors[note.note_type]||'#71717a'}20;color:${typeColors[note.note_type]||'#71717a'}">${note.note_type||'general'}</span>
          ${isOwn?`<button class="note-delete-btn" onclick="deleteNote('${note.id}')">✕</button>`:''}
        </div>
      </div>
      <div class="note-content">${note.content.replace(/\n/g,'<br/>')}</div>
    </div>`;
  }).join('');
}

function filterNotes(type,btn) {
  noteFilter=type;
  document.querySelectorAll('.note-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active'); renderNotes();
}

async function addNote() {
  const content = document.getElementById('newNoteContent').value.trim();
  const noteType = document.getElementById('newNoteType').value;
  if (!content) { showToast('Please write something first.','error'); return; }
  const { data, error } = await sb.from('notes').insert({
    ambassador_id:currentAmbassadorId, author_id:currentUser.id, content, note_type:noteType
  }).select('*, author:profiles(full_name,id)').single();
  if (error) { showToast('Failed to add note.','error'); return; }
  document.getElementById('newNoteContent').value='';
  allNotes.unshift(data); renderNotes();
  showToast('Note added!'); loadRecentActivity(); loadNotesCount();
}

async function deleteNote(noteId) {
  if (!confirm('Delete this note?')) return;
  const { error } = await sb.from('notes').delete().eq('id', noteId);
  if (error) { showToast('Failed to delete.','error'); return; }
  allNotes = allNotes.filter(n=>n.id!==noteId); renderNotes(); showToast('Note deleted.');
}

// ============================================
// AMBASSADOR CRUD
// ============================================
function openAmbassadorModal(data=null) {
  const select = document.getElementById('ambAssignTo');
  select.innerHTML = '<option value="">— Unassigned —</option>' +
    allProfiles.filter(p=>p.role==='sales'||p.role==='admin').map(p=>`<option value="${p.id}">${p.full_name}</option>`).join('');
  renderTagCheckboxes(data?.tags||[]);

  if (data) {
    document.getElementById('ambassadorModalTitle').textContent = 'Edit Ambassador';
    document.getElementById('ambassadorId').value   = data.id;
    document.getElementById('ambName').value        = data.name||'';
    document.getElementById('ambCity').value        = data.city||'';
    document.getElementById('ambState').value       = data.state||'';
    document.getElementById('ambFollowers').value   = data.followers||'';
    document.getElementById('ambYoe').value         = data.years_experience!=null?data.years_experience:'';
    document.getElementById('ambLinkedin').value    = data.linkedin_url||'';
    document.getElementById('ambEmail').value       = data.email||'';
    document.getElementById('ambPhone').value       = data.phone||'';
    document.getElementById('ambBio').value         = data.bio||'';
    document.getElementById('ambAssignTo').value    = data.assigned_to||'';
    document.getElementById('ambStatus').value      = data.status||'active';
  } else {
    document.getElementById('ambassadorModalTitle').textContent = 'Add Ambassador';
    document.getElementById('ambassadorId').value = '';
    ['ambName','ambCity','ambState','ambFollowers','ambYoe','ambLinkedin','ambEmail','ambPhone','ambBio'].forEach(id=>{document.getElementById(id).value='';});
    document.getElementById('ambAssignTo').value=''; document.getElementById('ambStatus').value='active';
  }
  openModal('ambassadorModal');
}

function renderTagCheckboxes(selectedTags=[]) {
  const container = document.getElementById('ambTagsContainer');
  if (!container) return;
  container.innerHTML = AMBASSADOR_TAGS.map(tag => {
    const tc = TAG_COLORS[tag]||{bg:'#f4f4f5',text:'#3f3f46',border:'#e4e4e7'};
    const checked = selectedTags.includes(tag);
    return `<label class="tag-checkbox-label ${checked?'checked':''}" style="--tag-bg:${tc.bg};--tag-text:${tc.text};--tag-border:${tc.border}" onclick="toggleTagCheckbox(this)">
      <input type="checkbox" value="${tag}" ${checked?'checked':''} style="display:none"/>${tag}</label>`;
  }).join('');
}

function toggleTagCheckbox(label) {
  const cb = label.querySelector('input[type=checkbox]');
  cb.checked=!cb.checked; label.classList.toggle('checked',cb.checked);
}

function getSelectedTags() {
  const container = document.getElementById('ambTagsContainer');
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
}

async function saveAmbassador() {
  const id    = document.getElementById('ambassadorId').value;
  const name  = document.getElementById('ambName').value.trim();
  const city  = document.getElementById('ambCity').value.trim();
  const state = document.getElementById('ambState').value.trim();
  if (!name||!city||!state) { showToast('Name, city, and state are required.','error'); return; }

  const yoeRaw = document.getElementById('ambYoe').value;
  const payload = {
    name, city, state,
    followers:        parseInt(document.getElementById('ambFollowers').value)||0,
    years_experience: yoeRaw!=='' ? parseInt(yoeRaw) : null,
    linkedin_url:     document.getElementById('ambLinkedin').value.trim()||null,
    email:            document.getElementById('ambEmail').value.trim()||null,
    phone:            document.getElementById('ambPhone').value.trim()||null,
    bio:              document.getElementById('ambBio').value.trim()||null,
    assigned_to:      document.getElementById('ambAssignTo').value||null,
    status:           document.getElementById('ambStatus').value,
    tags:             getSelectedTags(),
  };

  let error;
  if (id) { ({error}=await sb.from('ambassadors').update(payload).eq('id',id)); }
  else    { payload.created_by=currentUser.id; ({error}=await sb.from('ambassadors').insert(payload)); }

  if (error) { showToast('Failed to save: '+error.message,'error'); return; }
  showToast(id?'Ambassador updated!':'Ambassador added!');
  closeModal('ambassadorModal');
  await loadAmbassadors(); applyFilters(); renderMyAmbassadors();
}

function editAmbassador(id) { const amb=allAmbassadors.find(a=>a.id===id); if(amb) openAmbassadorModal(amb); }
function editCurrentAmbassador() { const amb=allAmbassadors.find(a=>a.id===currentAmbassadorId); if(!amb)return; closeModal('detailModal'); openAmbassadorModal(amb); }

async function deleteCurrentAmbassador() {
  if (!confirm('Delete this ambassador? This cannot be undone.')) return;
  const { error } = await sb.from('ambassadors').delete().eq('id', currentAmbassadorId);
  if (error) { showToast('Failed to delete.','error'); return; }
  showToast('Ambassador deleted.'); closeModal('detailModal');
  await loadAmbassadors(); applyFilters();
}

// ============================================
// DASHBOARD
// ============================================
function updateStats() {
  const total=allAmbassadors.length;
  const mine=allAmbassadors.filter(a=>a.assigned_to===currentUser.id).length;
  const totalFollowers=allAmbassadors.reduce((s,a)=>s+(a.followers||0),0);
  document.getElementById('statTotal').textContent=total;
  document.getElementById('statMine').textContent=mine;
  document.getElementById('statFollowers').textContent=formatFollowers(totalFollowers);
  loadNotesCount();
}

async function loadNotesCount() {
  const oneWeekAgo=new Date(Date.now()-7*86400000).toISOString();
  const {count}=await sb.from('notes').select('id',{count:'exact',head:true}).gte('created_at',oneWeekAgo);
  document.getElementById('statNotes').textContent=count||0;
}

async function renderDashboard() { await loadRecentActivity(); renderTopAmbassadors(); }

async function loadRecentActivity() {
  const feed=document.getElementById('activityFeed'); if(!feed)return;
  const {data}=await sb.from('notes').select('*, author:profiles(full_name), ambassador:ambassadors(name)').order('created_at',{ascending:false}).limit(8);
  if(!data||!data.length){feed.innerHTML='<div class="empty-state"><p>No activity yet.</p></div>';return;}
  feed.innerHTML=data.map(n=>`<div class="activity-item"><div class="activity-dot"></div><div class="activity-text"><strong>${n.author?.full_name||'Someone'}</strong> logged a ${n.note_type||'note'} for <strong>${n.ambassador?.name||'an ambassador'}</strong></div><div class="activity-time">${timeAgo(n.created_at)}</div></div>`).join('');
}

function renderTopAmbassadors() {
  const container=document.getElementById('topAmbassadors'); if(!container)return;
  const top=[...allAmbassadors].filter(a=>a.followers>0).sort((a,b)=>b.followers-a.followers).slice(0,6);
  if(!top.length){container.innerHTML='<div class="empty-state"><p>No data yet.</p></div>';return;}
  container.innerHTML=top.map((a,i)=>`<div class="top-item" onclick="openAmbassadorDetail('${a.id}')" style="cursor:pointer"><div class="top-rank">#${i+1}</div><div class="ambassador-avatar" style="background:${getAvatarColor(a.name)};width:30px;height:30px;font-size:0.7rem">${getInitials(a.name)}</div><div class="top-info"><div class="top-name">${a.name}</div><div class="top-sub">${a.city}, ${a.state}</div></div><div class="top-followers">${formatFollowers(a.followers)}</div></div>`).join('');
}

// ============================================
// SALES / ADMIN
// ============================================
async function loadSalesView() {
  await loadProfiles();
  const grid=document.getElementById('salesGrid'); if(!grid)return;
  const sales=allProfiles.filter(p=>p.role==='sales'||p.role==='admin');
  if(!sales.length){grid.innerHTML='<div class="empty-state"><p>No sales members yet.</p></div>';return;}
  grid.innerHTML=sales.map(p=>{
    const count=allAmbassadors.filter(a=>a.assigned_to===p.id).length;
    return `<div class="sales-card"><div class="sales-avatar" style="background:${getAvatarColor(p.full_name)};color:white">${getInitials(p.full_name)}</div><div class="sales-name">${p.full_name}</div><div class="sales-email">${p.email}</div><div class="sales-count"><strong>${count}</strong> ambassador${count!==1?'s':''} assigned</div>${p.role==='admin'?'<div style="margin-top:0.5rem"><span class="role-badge role-admin">Admin</span></div>':''}</div>`;
  }).join('');
}

async function loadAdminView() {
  await loadProfiles();
  const table=document.getElementById('allUsersTable'); if(!table)return;
  table.innerHTML=`<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Ambassadors</th><th>Actions</th></tr></thead><tbody>${allProfiles.map(p=>{
    const count=allAmbassadors.filter(a=>a.assigned_to===p.id).length;
    return `<tr><td><div style="display:flex;align-items:center;gap:0.5rem"><div class="user-avatar" style="background:${getAvatarColor(p.full_name)}">${getInitials(p.full_name)}</div>${p.full_name}</div></td><td>${p.email}</td><td><span class="role-badge role-${p.role}">${p.role}</span></td><td>${count}</td><td>${p.id!==currentUser.id?`<button class="btn btn-sm btn-outline" onclick="toggleRole('${p.id}','${p.role}')">Make ${p.role==='admin'?'Sales':'Admin'}</button>`:'<span style="color:var(--gray-400);font-size:0.8rem">You</span>'}</td></tr>`;
  }).join('')}</tbody></table>`;
}

async function toggleRole(profileId,currentRole) {
  const newRole=currentRole==='admin'?'sales':'admin';
  if(!confirm(`Change this user's role to ${newRole}?`))return;
  const {error}=await sb.from('profiles').update({role:newRole}).eq('id',profileId);
  if(error){showToast('Failed to update role.','error');return;}
  showToast('Role updated!'); await loadProfiles(); loadAdminView();
}

function openAddSalesModal() {
  ['salesName','salesEmail','salesPassword'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('salesModalError').style.display='none';
  openModal('salesModal');
}

async function addSalesMember() {
  const name=document.getElementById('salesName').value.trim();
  const email=document.getElementById('salesEmail').value.trim();
  const password=document.getElementById('salesPassword').value;
  const errorEl=document.getElementById('salesModalError');
  errorEl.style.display='none';
  if(!name||!email||!password){errorEl.textContent='All fields are required.';errorEl.style.display='block';return;}
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:name,role:'sales'}}});
  if(error){errorEl.textContent=error.message;errorEl.style.display='block';return;}
  showToast(`Sales member ${name} created!`);
  closeModal('salesModal'); await loadProfiles(); loadSalesView(); loadAdminView();
}

async function handleLogout() { await sb.auth.signOut(); window.location.href='index.html'; }