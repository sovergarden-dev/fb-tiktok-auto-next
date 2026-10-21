const KEYS = ['enabled', 'facebook', 'instagram', 'x', 'tiktok', 'youtube', 'hud', 'backgroundPlay', 'liteMode', 'shortcuts', 'skipSeen', 'autoPip', 'holdFast', 'durFilter', 'adSkip', 'copyrightMutedSkip', 'showSkipBadge', 'debug'];
const NUM_KEYS = ['durMin', 'durMax', 'introSkip', 'endOffset', 'bulkLimit'];
// Giới hạn từng ô số: endOffset cho phép âm (chuyển sớm) và số lẻ 0.5 giây.
const NUM_RANGE = { durMin: [0, 36000], durMax: [0, 36000], introSkip: [0, 60], endOffset: [-10, 10], bulkLimit: [10, 500] };
function clampNum(key, raw) {
  const [lo, hi] = NUM_RANGE[key] || [0, 1e9];
  let n = Number(raw);
  if (!isFinite(n)) n = 0;
  n = Math.max(lo, Math.min(hi, n));
  return key === 'endOffset' ? Math.round(n * 2) / 2 : Math.round(n);
}

const DEFAULTS = {
  enabled: true,
  facebook: true,
  instagram: true,
  x: true,
  tiktok: true,
  youtube: true,
  hud: true,
  backgroundPlay: false,
  shortcuts: true,
  skipSeen: false,
  autoPip: false,
  holdFast: true,
  liteMode: false,
  durFilter: false,
  durMin: 0,
  durMax: 0,
  adSkip: true,
  copyrightMutedSkip: false,
  showSkipBadge: true,
  introSkip: 0,
  endOffset: -0.5,
  bulkLimit: 100,
  debug: false
};

async function load() {
  const stored = await chrome.storage.sync.get({ ...DEFAULTS, fileTemplate: '' });
  for (const key of KEYS) {
    const el = document.getElementById(key);
    if (el) el.checked = Boolean(stored[key]);
  }
  for (const key of NUM_KEYS) {
    const el = document.getElementById(key);
    if (el) el.value = String(clampNum(key, stored[key]));
  }
  const tplEl = document.getElementById('fileTemplate');
  if (tplEl) {
    tplEl.value = stored.fileTemplate || '';
  }
}

function bind() {
  for (const key of KEYS) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.addEventListener('change', async () => {
      await chrome.storage.sync.set({ [key]: el.checked });
      updateStatus();
    });
  }
  for (const key of NUM_KEYS) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.addEventListener('change', async () => {
      const v = clampNum(key, el.value);
      el.value = String(v);
      await chrome.storage.sync.set({ [key]: v });
    });
  }
  const tplEl = document.getElementById('fileTemplate');
  if (tplEl) {
    tplEl.addEventListener('change', async () => {
      await chrome.storage.sync.set({ fileTemplate: tplEl.value.trim() });
    });
  }
}

// ---------- nhật ký hoạt động ----------
function pad2(n) { return (n < 10 ? '0' : '') + n; }
let logFilter = 'all';
function logMatches(e) {
  if (logFilter === 'all') return true;
  if (logFilter === 'dl') return e.k === 'dl' || e.k === 'bulk';
  return e.k === logFilter;
}
function fmtLogLine(e) {
  const d = new Date(e.t || 0);
  const site = e.site === 'facebook' ? 'FB' : e.site === 'instagram' ? 'IG' : e.site === 'x' ? 'X' : e.site === 'tiktok' ? 'TT' : e.site === 'youtube' ? 'YT' : '·';
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + ' [' + site + '] ' + (e.m || '');
}
async function renderLog() {
  const box = document.getElementById('actlog');
  if (!box) return;
  const { actLog } = await chrome.storage.local.get({ actLog: [] });
  const rows = (Array.isArray(actLog) ? actLog : []).filter(logMatches);
  if (!rows.length) { box.textContent = logFilter === 'all' ? 'Chưa có sự kiện nào.' : 'Không có sự kiện loại này.'; return; }
  box.textContent = rows.slice().reverse().map(fmtLogLine).join('\n');
}
async function copyLog(btn) {
  const { actLog } = await chrome.storage.local.get({ actLog: [] });
  const mf = chrome.runtime.getManifest();
  let tabUrl = '';
  try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); tabUrl = (tab && tab.url) || ''; } catch {}
  const lines = [
    '=== ' + mf.name + ' v' + mf.version + ' — nhật ký hoạt động ===',
    'Thời điểm: ' + new Date().toLocaleString(),
    'Trang: ' + tabUrl,
    'Trình duyệt: ' + navigator.userAgent,
    '---',
  ].concat(Array.isArray(actLog) && actLog.length ? actLog.map(fmtLogLine) : ['(trống)']);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btn.textContent = '✓ Đã chép';
  } catch {
    btn.textContent = 'Lỗi chép';
  }
  setTimeout(() => { btn.textContent = 'Sao chép'; }, 1600);
}
function bindLog() {
  const clearBtn = document.getElementById('act-logclear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ actLog: [] });
      renderLog();
    });
  }
  const copyBtn = document.getElementById('act-logcopy');
  if (copyBtn) copyBtn.addEventListener('click', () => copyLog(copyBtn));
  const filt = document.getElementById('logfilter');
  if (filt) {
    filt.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        logFilter = b.getAttribute('data-f') || 'all';
        filt.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        renderLog();
      });
    });
  }
  renderLog();
  setInterval(renderLog, 2000);
}

async function updateStatus() {
  const statusEl = document.getElementById('status');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    // Without the "tabs" permission, tab.url is only readable on the sites we
    // have host permissions for — so an unreadable URL means an unsupported tab.
    statusEl.innerHTML = 'Tab hiện tại: <b>không phải Facebook / Instagram / TikTok / YouTube / X</b>.';
    return;
  }

  const supported = /https?:\/\/(www\.|m\.)?(facebook\.com|instagram\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com)\//i.test(tab.url);
  if (!supported) {
    statusEl.innerHTML = 'Tab hiện tại: <b>không phải Facebook / Instagram / TikTok / YouTube / X</b>.';
    return;
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'AUTONEXT_STATUS' });
    if (res?.ok) {
      const site = res.site === 'facebook' ? 'Facebook' : res.site === 'instagram' ? 'Instagram Reels' : res.site === 'x' ? 'X (Twitter) Videos' : res.site === 'tiktok' ? 'TikTok' : res.site === 'youtube' ? 'YouTube Shorts' : 'Không rõ';
      const active = res.enabled && res.relevant;
      statusEl.innerHTML =
        `Trang: <b>${site}</b><br/>` +
        `Trang phù hợp: <b>${res.relevant ? 'Có' : 'Không'}</b><br/>` +
        `Trạng thái: <b>${active ? 'Đang hoạt động ✅' : 'Tạm dừng'}</b>`;
      return;
    }
  } catch {
    statusEl.innerHTML =
      'Script chưa chạy trên tab này.<br/>Hãy <b>tải lại trang</b> (F5) sau khi bật tiện ích.';
    return;
  }

  statusEl.innerHTML = 'Không xác định được trạng thái.';
}

function sendAction(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'VIP_ACTION', action }, () => void chrome.runtime.lastError);
    }
    window.close();
  });
}

function bindActions() {
  const map = { 'act-download': 'download', 'act-pip': 'pip', 'act-bulk': 'bulk', 'act-fav': 'favlist' };
  for (const [id, action] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => sendAction(action));
  }
  const clearSeen = document.getElementById('act-clearseen');
  if (clearSeen) {
    clearSeen.addEventListener('click', async () => {
      await chrome.storage.local.set({ seenIds: [] });
      clearSeen.textContent = '✓ Đã xoá lịch sử đã xem';
      setTimeout(() => { clearSeen.textContent = '🧹 Xoá lịch sử đã xem'; }, 1600);
    });
  }
}

load().then(() => {
  bind();
  bindActions();
  bindLog();
  updateStatus();
});
