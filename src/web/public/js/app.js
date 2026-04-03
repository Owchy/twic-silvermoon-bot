// Shared app shell — runs on every authenticated page.
// Checks auth, injects sidebar + topbar, exposes helpers.

const CLASS_COLORS = {
  'Death Knight':'#C41E3A','Demon Hunter':'#A330C9','Druid':'#FF7C0A',
  'Evoker':'#33937F','Hunter':'#AAD372','Mage':'#3FC7EB','Monk':'#00FF98',
  'Paladin':'#F48CBA','Priest':'#c8c8c8','Rogue':'#FFF468','Shaman':'#0070DD',
  'Warlock':'#8788EE','Warrior':'#C69B3A',
};

const CLASS_EMOJI = {
  'Death Knight':'💀','Demon Hunter':'🔱','Druid':'🌿','Evoker':'🐉',
  'Hunter':'🏹','Mage':'🔮','Monk':'🥋','Paladin':'🛡️','Priest':'✨',
  'Rogue':'🗡️','Shaman':'⚡','Warlock':'👁️','Warrior':'⚔️',
};

const DIFF_BADGE = { LFR:'badge-lfr', Normal:'badge-normal', Heroic:'badge-heroic', Mythic:'badge-mythic' };
const RANK_LABEL = { gm:'👑 GM', officer:'⭐ Officer', raider:'🗡️ Raider', trial:'🔰 Trial', social:'😊 Social', alt:'🔄 Alt' };

let currentUser = null;

async function initApp(pageTitle) {
  const res = await fetch('/api/me');
  if (res.status === 401) { window.location.href = '/login'; return null; }
  currentUser = await res.json();

  const activePage = window.location.pathname.replace('/', '') || 'dashboard';

  // ── Sidebar ────────────────────────────────────────────────────────────────
  const navItems = [
    { href: '/dashboard',  icon: '📊', label: 'Dashboard'   },
    { href: '/raids',      icon: '⚔️',  label: 'Raids'        },
    { href: '/roster',     icon: '👥', label: 'Roster'       },
    { href: '/attendance', icon: '📈', label: 'Attendance'   },
    { href: '/mplus',      icon: '🏆', label: 'Mythic+'      },
    { href: '/loot',       icon: '🎁', label: 'Loot'         },
    { href: '/settings',   icon: '⚙️',  label: 'Settings', officer: true },
  ];

  const navHtml = navItems.map(n => `
    <a href="${n.href}" class="nav-link${n.href.includes(activePage) ? ' active' : ''}${n.officer ? ' officer-only' : ''}">
      <span class="icon">${n.icon}</span>${n.label}
    </a>`).join('');

  const avatarUrl = currentUser.avatar
    ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <h1>⚔️ Silvermoon</h1>
      <p>Guild Dashboard</p>
    </div>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <img src="${avatarUrl}" class="user-avatar" alt="">
        <span class="user-name">${currentUser.username}</span>
        <form action="/auth/logout" method="post">
          <button type="submit" class="logout-btn" title="Log out">↩</button>
        </form>
      </div>
    </div>`;

  if (currentUser.isOfficer) document.getElementById('sidebar').classList.add('is-officer');

  // ── Topbar ─────────────────────────────────────────────────────────────────
  const topbarEl = document.getElementById('topbar');
  if (topbarEl) {
    topbarEl.className = 'topbar';
    topbarEl.innerHTML = `<h2>${pageTitle}</h2><div class="topbar-actions" id="topbar-actions"></div>`;
  }

  return currentUser;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function classColor(cls) { return CLASS_COLORS[cls] || '#e6edf3'; }
function classEmoji(cls) { return CLASS_EMOJI[cls] || '•'; }

function classBadge(cls, spec) {
  const color = classColor(cls);
  return `<span style="color:${color};font-weight:600">${classEmoji(cls)} ${spec || ''} ${cls || ''}</span>`;
}

function diffBadge(diff) {
  return `<span class="badge ${DIFF_BADGE[diff] || ''}">${diff}</span>`;
}

function rankBadge(rank) {
  return `<span class="badge badge-${rank}">${RANK_LABEL[rank] || rank}</span>`;
}

function statusBadge(status) {
  const labels = { accepted:'✅ Accepted', late:'⏰ Late', tentative:'❓ Tentative', declined:'❌ Declined', benched:'🪑 Benched', absent:'🔴 Absent' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:500;z-index:9999;background:${type==='error'?'#f85149':'#3fb950'};color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.4)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

async function apiRequest(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) e.target.classList.remove('open');
});
