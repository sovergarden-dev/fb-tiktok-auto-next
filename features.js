(() => {
  if (window.__autoNextVipInjected) return;
  window.__autoNextVipInjected = true;

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
    volumeNormalize: false,
    autoPip: false,
    holdFast: true,
    liteMode: false,
    bulkLimit: 100,
    playbackRate: 1,
    remoteBlocklistUrl: ''
  };
  let settings = { ...DEFAULTS };

  const host = location.hostname;
  const isFacebook = /(^|\.)facebook\.com$/i.test(host);
  const isInstagram = /(^|\.)instagram\.com$/i.test(host);
  const isX = /(^|\.)(x|twitter)\.com$/i.test(host);
  const isTikTok = /(^|\.)tiktok\.com$/i.test(host);
  const isYouTube = /(^|\.)youtube\.com$/i.test(host);
  const platform = isFacebook ? 'facebook' : isInstagram ? 'instagram' : isX ? 'x' : isTikTok ? 'tiktok' : isYouTube ? 'youtube' : 'other';
  const isTop = window.top === window;
  // VIP features run only in the top frame: this avoids duplicate downloads when
  // the popup broadcasts an action to every frame, and skips wasted work in ad
  // iframes. The player video on FB Reels / TikTok / YT Shorts lives in the top
  // document, so nothing is lost.
  if (!isTop) return;

  function siteEnabled() {
    if (!settings.enabled) return false;
    if (isFacebook) return settings.facebook !== false;
    if (isInstagram) return settings.instagram !== false;
    if (isX) return settings.x !== false;
    if (isTikTok) return settings.tiktok !== false;
    if (isYouTube) return settings.youtube !== false;
    return false;
  }
  function pageRelevant() {
    if (isFacebook) return /\/reels?\//i.test(location.pathname);
    if (isInstagram) return /\/(?:reels?|p)\//i.test(location.pathname);
    if (isX) return /\/(?:i\/videos|.*\/status)/i.test(location.pathname);
    if (isTikTok) return true;
    if (isYouTube) return /\/shorts\//i.test(location.pathname);
    return false;
  }

  try {
    chrome.storage?.sync?.get(null, (stored) => {
      settings = { ...DEFAULTS, ...(stored || {}) };
      applyBackgroundPlay(settings.backgroundPlay);
      refreshHud();
      // Kiểm tra đồng bộ danh sách chặn từ xa mỗi 24 giờ
      try {
        chrome.storage?.local?.get({ lastBlockSyncAt: 0 }, (r) => {
          const last = Number(r && r.lastBlockSyncAt) || 0;
          if (Date.now() - last > 24 * 60 * 60 * 1000) {
            chrome.storage?.local?.set({ lastBlockSyncAt: Date.now() });
            syncRemoteBlocklist(false);
          }
        });
      } catch {}
    });
  } catch {}

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.favIds) {
      try { favIdsSync = new Set(changes.favIds.newValue || []); } catch {}
      delete changes.favIds;
    }
    if (changes.blockedSync) {
      applyBlockedSync(changes.blockedSync.newValue);
      delete changes.blockedSync;
    }
    if (changes.blockedKw) {
      applyKwSync(changes.blockedKw.newValue);
      delete changes.blockedKw;
    }
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
    applyBackgroundPlay(settings.backgroundPlay);
    applyVolumeNormalize();
    refreshHud();
  });

  // HUD position is per-device (screen sizes differ), so it lives in storage.local.
  // Vị trí + hướng lưu RIÊNG cho từng trang (hudPos_facebook/tiktok/youtube) vì
  // bố cục mỗi trang khác nhau; khóa hudPos cũ dùng làm dự phòng lần đầu.
  const HUD_POS_KEY = 'hudPos_' + platform;
  try {
    chrome.storage?.local?.get({ hudPos: null, [HUD_POS_KEY]: null, hudMini: null }, (s) => {
      // Mặc định: thu nhỏ thành nút tròn. Chỉ mở sẵn khi người dùng đã tự ghim (đã lưu hudMini = false).
      if (!s || s.hudMini !== false) setHudMini(true);
      const pos = (s && s[HUD_POS_KEY]) || (s && s.hudPos) || null;
      if (pos && typeof pos.left === 'number') {
        settings.hudPos = pos;
        if (hudRoot) applyHudPos();
      }
    });
  } catch {}

  // ---------- helpers ----------
  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return w * h;
  }
  function getActiveVideo() {
    const api = window.__autoNextApi;
    if (api && typeof api.getActiveVideo === 'function') {
      const v = api.getActiveVideo();
      if (v) return v;
    }
    const vids = Array.from(document.querySelectorAll('video'));
    if (!vids.length) return null;
    const playing = vids
      .filter((v) => !v.paused && !v.ended && v.readyState >= 2)
      .sort((a, b) => visibleArea(b) - visibleArea(a));
    if (playing.length) return playing[0];
    return vids.sort((a, b) => visibleArea(b) - visibleArea(a))[0] || vids[0];
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---------- toast ----------
  let toastEl = null, toastTimer = null;
  function toast(msg, ms) {
    if (!isTop) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;z-index:2147483647;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(17,17,20,.93);color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:none;opacity:0;transition:opacity .18s ease;max-width:80vw;text-align:center;';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.style.opacity = '0'; }, ms || 2200);
  }

  // ---------- nhật ký hoạt động (đọc trong popup, 50 sự kiện gần nhất) ----------
  function alog(kind, msg) {
    try {
      chrome.storage?.local?.get({ actLog: [] }, (st) => {
        const arr = Array.isArray(st && st.actLog) ? st.actLog : [];
        arr.push({ t: Date.now(), k: kind, m: String(msg).slice(0, 180), site: platform });
        try { chrome.storage?.local?.set({ actLog: arr.slice(-50) }); } catch {}
      });
    } catch {}
  }
  window.__anLog = alog;

  // ---------- tự chẩn đoán: đếm thất bại liên tiếp của từng tính năng ----------
  // Trang đổi giao diện âm thầm → tính năng hỏng lặp lại. Vượt ngưỡng 3 lần
  // liên tiếp thì báo rõ cho người dùng thay vì hỏng trong im lặng.
  const featFails = {};
  const featWarned = {};
  function noteFeature(name, ok, hint) {
    if (ok) { featFails[name] = 0; featWarned[name] = false; return; }
    featFails[name] = (featFails[name] || 0) + 1;
    if (featFails[name] >= 3 && !featWarned[name]) {
      featWarned[name] = true;
      toast('⚠️ ' + hint + ' (' + featFails[name] + ' lần liên tiếp) — trang có thể vừa đổi giao diện', 4600);
      alog('warn', '⚠️ ' + hint + ' — nghi trang đổi giao diện');
    }
  }
  window.__anNoteFeature = noteFeature;

  // ---------- collected media (bulk) ----------
  const collected = new Map();
  // Các clip được tick chọn trong tab "Danh sách tải" (chọn từng clip để tải).
  const bulkSel = new Set();
  // Các mục được tick chọn trong tab "Chặn" (để bỏ chặn hàng loạt).
  const blockSel = new Set();
  function clipKey() {
    try {
      const api = window.__autoNextApi;
      if (api && typeof api.clipId === 'function') return api.clipId();
    } catch {}
    return null;
  }
  function recordMedia(v) {
    if (!v) return;
    // Chế độ siêu nhẹ: không thu thập link tải.
    if (settings.liteMode) return;
    let src = v.currentSrc || v.src || '';
    let dlNote = '';
    if (!src || src.indexOf('http') !== 0) {
      // blob/MSE (FB Reels, TikTok khi đăng nhập): video.src không tải được,
      // dò link file thật để gom vào danh sách tải.
      const s = resolveDownloadSource(v);
      if (!s || !s.url) return;
      src = s.url;
      dlNote = s.note || '';
    }
    // Dedup by clip ID: signed CDN URLs change for the same clip, so keying by
    // URL produced duplicates. Fallback to the URL when the ID is unknown.
    const key = clipKey() || src;
    const prev = collected.get(key);
    if (prev) {
      // Same clip seen again — keep the freshest (non-expired) link.
      prev.url = src;
      prev.ts = Date.now();
      return;
    }
    collected.set(key, { url: src, platform, title: (document.title || '').slice(0, 120), author: currentAuthor() || '', page: location.href, ts: Date.now(), note: dlNote, dur: (isFinite(v.duration) && v.duration > 0) ? Math.round(v.duration) : 0 });
    // Giới hạn danh sách tải: đầy thì tự bỏ link CŨ nhất để không phình vô hạn trong phiên xem dài.
    const lim = Math.max(10, Math.min(500, Number(settings.bulkLimit) || 100));
    if (collected.size > lim) {
      const oldest = [...collected.entries()].sort((a, b) => a[1].ts - b[1].ts);
      let over = collected.size - lim;
      for (const en of oldest) {
        if (over-- <= 0) break;
        collected.delete(en[0]);
        bulkSel.delete(en[0]);
      }
    }
    updateBulkCount();
  }
  // ---------- kiểm tra "sức khỏe" file sau khi tải ----------
  // Mở thầm file vừa tải bằng một thẻ video ẩn để đọc thời lượng thật; nếu
  // lệch nhiều so với clip gốc (dấu hiệu file cụt kiểu "xem được 5 giây rồi
  // đứng hình") thì báo ngay. Không đọc được metadata trong 4s → không kết
  // luận được, coi như ổn để không chặn oan.
  function checkBlobHealth(objectUrl, expectedDur) {
    return new Promise((resolve) => {
      try {
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        let settled = false;
        const done = (ok, dur) => {
          if (settled) return;
          settled = true;
          try { probe.removeAttribute('src'); probe.load(); } catch {}
          resolve({ ok, dur: dur || 0 });
        };
        const timer = setTimeout(() => done(true, 0), 4000);
        probe.addEventListener('loadedmetadata', () => {
          clearTimeout(timer);
          const dur = probe.duration;
          if (!isFinite(dur) || dur <= 0) { done(false, 0); return; }
          if (expectedDur > 0 && dur < expectedDur - 2.5) { done(false, dur); return; }
          done(true, dur);
        }, { once: true });
        probe.addEventListener('error', () => { clearTimeout(timer); done(false, 0); }, { once: true });
        probe.src = objectUrl;
      } catch { resolve({ ok: true, dur: 0 }); }
    });
  }
  function guessName(url, i) {
    let id = '';
    try { const p = location.pathname.split('/').filter(Boolean); id = p[p.length - 1] || ''; } catch {}
    if (!id) id = String(Date.now());
    const safe = (platform + '_' + id + (i != null ? ('_' + i) : '')).replace(/[^\w.-]+/g, '_').slice(0, 90);
    return 'AutoNext/' + safe + '.mp4';
  }
  // ---------- tên file theo mẫu ----------
  // Mẫu chỉnh trong popup; hỗ trợ {tacgia} {tieude} {ngay} {site} {id}.
  function cleanPart(s, max) {
    return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 64);
  }
  function buildFileName(it, i) {
    const tpl = cleanPart(settings.fileTemplate, 120) || '{site} - {tacgia} - {tieude} - {ngay}';
    const d = new Date((it && it.ts) || Date.now());
    const pad = (n) => (n < 10 ? '0' : '') + n;
    const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    let id = '';
    try { const p = ((it && it.page) ? new URL(it.page).pathname : location.pathname).split('/').filter(Boolean); id = p[p.length - 1] || ''; } catch {}
    const title = cleanPart((it && it.title) || document.title, 64).replace(/\s*[|•·–—-]\s*(Facebook|TikTok|YouTube).*$/i, '').trim();
    const author = cleanPart((it && it.author) || currentAuthor(), 40);
    let name = tpl
      .replace(/\{site\}/g, (it && it.platform) || platform)
      .replace(/\{tacgia\}/g, author || 'an-danh')
      .replace(/\{tieude\}/g, title || ('clip_' + (id || Date.now())))
      .replace(/\{ngay\}/g, date)
      .replace(/\{id\}/g, cleanPart(id, 40) || String(Date.now()));
    name = cleanPart(name, 140) || ('AutoNext_' + Date.now());
    return 'AutoNext/' + name + (i != null ? (' (' + i + ')') : '') + '.mp4';
  }

  // ---------- download ----------
  function anchorDownload(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name || '';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function downloadUrl(url, name) {
    if (url.indexOf('blob:') === 0) {
      try {
        const r = await fetch(url);
        const b = await r.blob();
        const u = URL.createObjectURL(b);
        anchorDownload(u, name);
        setTimeout(() => URL.revokeObjectURL(u), 15000);
        return true;
      } catch { return false; }
    }
    const ok = await new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ type: 'AUTONEXT_DOWNLOAD', url, filename: name }, (resp) => {
          void chrome.runtime.lastError;
          res(!!(resp && resp.ok));
        });
      } catch { res(false); }
    });
    if (ok) return true;
    // Dự phòng: tải bằng fetch ngay trong trang (mang cookie + ngữ cảnh thật,
    // cứu các link CDN từ chối tải "nguội" qua chrome.downloads).
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return false;
      const b = await r.blob();
      if (!b || !b.size) return false;
      const u = URL.createObjectURL(b);
      anchorDownload(u, (name || '').split('/').pop() || '');
      setTimeout(() => URL.revokeObjectURL(u), 30000);
      return true;
    } catch { return false; }
  }
  // Tải và KIỂM CHỨNG toàn vẹn file (fetch ngay trong trang, mang cookie).
  // Chỉ lưu khi tải đủ 100% dung lượng — chặn triệt để lỗi file bị cắt cụt
  // (xem được vài giây đầu rồi đứng hình do CDN ngắt giữa chừng).
  async function fetchVerifiedBlob(url) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      const expected = Number(r.headers.get('content-length') || 0);
      const type = (r.headers.get('content-type') || '').toLowerCase();
      if (type.indexOf('text') === 0 || type.indexOf('application/json') === 0) return null;
      const b = await r.blob();
      if (!b || b.size < 65536) return null; // quá nhỏ = trang lỗi / mảnh khởi tạo DASH
      if (expected && b.size < expected - 2048) return null; // thiếu dữ liệu = file cụt
      return { objectUrl: URL.createObjectURL(b), size: b.size };
    } catch { return null; }
  }
  // ---------- tìm nguồn tải thật (blob/MSE) ----------
  // FB Reels và TikTok (khi đăng nhập) phát bằng MSE nên video.src chỉ là
  // blob: — không fetch được. Phải dò link file thật:
  // - Facebook: link MP4 tiến trình (CÓ tiếng) nằm trong JSON Relay của trang
  //   dưới khóa browser_native_hd_url / browser_native_sd_url.
  // - Facebook (dự phòng): bắt URL fbcdn của các đoạn stream qua Performance
  //   API rồi bỏ bytestart/byteend. DASH tách hình/tiếng nên có thể thiếu tiếng.
  // - TikTok: URL segment trên tiktokcdn là URL file đầy đủ (Range nằm ở
  //   header) — dùng lại được ngay.
  function fbNativeUrl() {
    let idNow = '';
    try { const m = location.pathname.match(/\/reels?\/(\d+)/); if (m) idNow = m[1]; } catch {}
    if (!idNow) idNow = String(clipKey() || '');
    let fallback = null;
    const scripts = document.querySelectorAll('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const t = scripts[i].textContent || '';
      if (t.indexOf('browser_native_hd_url') === -1 && t.indexOf('browser_native_sd_url') === -1) continue;
      const re = /"browser_native_(?:hd|sd)_url":"((?:\\.|[^"\\])+)"/g;
      let mm;
      while ((mm = re.exec(t))) {
        let u = '';
        try { u = JSON.parse('"' + mm[1] + '"'); } catch { continue; }
        if (u.indexOf('https://') !== 0) continue;
        if (!fallback) fallback = u;
        if (idNow) {
          // Ưu tiên URL nằm gần ID của reel đang xem (trang ch���a nhiều video).
          const p = t.lastIndexOf(idNow, mm.index);
          if (p !== -1 && mm.index - p < 30000) return u;
        }
      }
    }
    return fallback;
  }
  function sniffFbUrl() {
    const sums = new Map();
    try {
      performance.getEntriesByType('resource').forEach((e) => {
        const u = e.name || '';
        if (u.indexOf('fbcdn.net') === -1 || u.indexOf('bytestart') === -1) return;
        let base = '';
        try {
          const x = new URL(u);
          x.searchParams.delete('bytestart');
          x.searchParams.delete('byteend');
          base = x.toString();
        } catch { return; }
        sums.set(base, (sums.get(base) || 0) + (e.decodedBodySize || e.transferSize || 0));
      });
    } catch {}
    // Luồng nặng nhất là track hình (track tiếng nhẹ hơn nhiều).
    let best = null, max = -1;
    sums.forEach((n, u) => { if (n > max) { max = n; best = u; } });
    return best;
  }
  function sniffTikTokUrl() {
    let best = null, bestTs = -1;
    try {
      performance.getEntriesByType('resource').forEach((e) => {
        const u = e.name || '';
        if (!/tiktokcdn[\w-]*\.com|tiktokv\.com/i.test(u)) return;
        if (u.indexOf('mime_type=video_mp4') === -1 && !/\.mp4(\?|$)/i.test(u)) return;
        if (e.startTime > bestTs) { bestTs = e.startTime; best = u; }
      });
    } catch {}
    return best;
  }
  // ---------- trích xuất kiểu yt-dlp: đọc JSON nội bộ của trang ----------
  function unescapeJsonUrl(s) { try { return JSON.parse('"' + s + '"'); } catch { return ''; } }
  // TikTok: link MP4 đầy đủ (CÓ tiếng) nằm trong JSON hydrate của trang
  // dưới khóa downloadAddr / playAddr — ưu tiên URL gần ID clip đang xem.
  function ttJsonUrl() {
    let idNow = '';
    try { const m = location.pathname.match(/\/(?:video|photo)\/(\d+)/); if (m) idNow = m[1]; } catch {}
    if (!idNow) idNow = String(clipKey() || '');
    let fallback = null;
    const scripts = document.querySelectorAll('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const t = scripts[i].textContent || '';
      if (t.indexOf('"playAddr"') === -1 && t.indexOf('"downloadAddr"') === -1) continue;
      const re = /"(?:downloadAddr|playAddr)":"((?:\\.|[^"\\])+)"/g;
      let mm;
      while ((mm = re.exec(t))) {
        const u = unescapeJsonUrl(mm[1]);
        if (u.indexOf('https://') !== 0) continue;
        if (!fallback) fallback = u;
        if (idNow) { const p = t.lastIndexOf(idNow, mm.index); if (p !== -1 && mm.index - p < 20000) return u; }
      }
    }
    return fallback;
  }
  // YouTube: đọc ytInitialPlayerResponse (cắt object JSON bằng đếm ngoặc),
  // lấy định dạng MP4 tiến trình (hình + tiếng chung một file, không cần mux).
  function ytPlayerJson() {
    const scripts = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
      const t = scripts[i].textContent || '';
      const at = t.indexOf('ytInitialPlayerResponse');
      if (at === -1) continue;
      const start = t.indexOf('{', at);
      if (start === -1) continue;
      let depth = 0, inStr = false, esc = false;
      for (let j = start; j < t.length; j++) {
        const c = t[j];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(start, j + 1)); } catch { break; } } }
      }
    }
    return null;
  }
  function ytProgressiveUrl() {
    const pr = ytPlayerJson();
    if (!pr) return null;
    let vidNow = '';
    try { const m = location.pathname.match(/\/shorts\/([\w-]+)/); if (m) vidNow = m[1]; } catch {}
    if (!vidNow) { try { vidNow = new URLSearchParams(location.search).get('v') || ''; } catch {} }
    const got = pr.videoDetails && pr.videoDetails.videoId;
    if (vidNow && got && got !== vidNow) return null; // JSON còn là của video trước (SPA)
    const fmts = (pr.streamingData && pr.streamingData.formats) || [];
    let best = null;
    for (const f of fmts) {
      if (f && f.url && f.mimeType && f.mimeType.indexOf('video/mp4') === 0) {
        if (!best || (f.width || 0) > (best.width || 0)) best = f;
      }
    }
    return best ? best.url : null;
  }
  // Cache theo clip để không quét lại script/performance liên tục ở main loop.
  let dlCache = { key: '', url: '', note: '', ts: 0 };
  function resolveDownloadSource(v) {
    const src = v ? (v.currentSrc || v.src || '') : '';
    const out = { url: '', blobUrl: src.indexOf('blob:') === 0 ? src : '', note: '' };
    if (src.indexOf('http') === 0) { out.url = src; return out; }
    const key = String(clipKey() || location.href);
    if (dlCache.key === key && (dlCache.url || Date.now() - dlCache.ts < 5000)) {
      out.url = dlCache.url;
      out.note = dlCache.note;
    } else {
      if (isFacebook) {
        out.url = fbNativeUrl() || '';
        if (!out.url) { out.url = sniffFbUrl() || ''; if (out.url) out.note = 'fb-sniff'; }
      } else if (isTikTok) {
        out.url = ttJsonUrl() || '';
        if (!out.url) out.url = sniffTikTokUrl() || '';
      } else if (isYouTube) {
        out.url = ytProgressiveUrl() || '';
        if (out.url) out.note = 'yt-prog';
      }
      dlCache = { key, url: out.url, note: out.note, ts: Date.now() };
    }
    return (out.url || out.blobUrl) ? out : null;
  }
  // ---------- máy ghi dự phòng (hoạt động mọi nền tảng, có tiếng) ----------
  // Khi mọi cách dò link đều thất bại: phát l���i clip từ đầu và ghi trực tiếp
  // luồng hình + tiếng (MediaRecorder) thành file .webm — không bao giờ "bó tay".
  let recState = null;
  function startRecordClip(v) {
    if (recState) return;
    if (!v.captureStream && !v.mozCaptureStream) { toast('Trình duyệt không hỗ trợ ghi clip'); return; }
    let stream;
    try { stream = v.captureStream ? v.captureStream() : v.mozCaptureStream(); } catch { toast('Trang chặn ghi clip này'); return; }
    let mime = 'video/webm;codecs=vp9,opus';
    try { if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm'; } catch { mime = 'video/webm'; }
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 }); } catch { toast('Không khởi tạo được bộ ghi'); return; }
    const st = { rec, chunks: [], video: v, prevMuted: v.muted, holdBefore: !!window.__anLoopHold, lastT: 0, save: true, timer: 0 };
    recState = st;
    window.__anLoopHold = true; // chặn tự lướt trong lúc ghi
    try { v.muted = false; } catch {} // để bản ghi có tiếng
    rec.ondataavailable = (e) => { if (e.data && e.data.size) st.chunks.push(e.data); };
    rec.onstop = () => {
      window.__anLoopHold = st.holdBefore;
      try { st.video.muted = st.prevMuted; } catch {}
      clearInterval(st.timer);
      if (recState === st) recState = null;
      if (!st.save || !st.chunks.length) { toast('Đã hủy ghi'); return; }
      const b = new Blob(st.chunks, { type: 'video/webm' });
      const u = URL.createObjectURL(b);
      anchorDownload(u, guessName('rec').split('/').pop().replace(/\.mp4$/, '.webm'));
      setTimeout(() => URL.revokeObjectURL(u), 30000);
      toast('✅ Đã lưu bản ghi (.webm, có tiếng)', 3200);
    };
    try { v.currentTime = 0; } catch {} // phát lại từ đầu để ghi trọn clip
    v.play().catch(() => {});
    rec.start(250);
    toast('⏺ Đang GHI lại clip từ đầu (không lấy được link trực tiếp) — bấm ⭳ lần nữa để dừng & lưu', 4200);
    st.timer = setInterval(() => {
      const vv = st.video;
      // Kết thúc khi: clip hết, quay vòng về đầu (loop), thẻ bị gỡ, hoặc quá 10 phút.
      const wrapped = (vv.currentTime || 0) + 0.3 < st.lastT;
      st.lastT = Math.max(st.lastT, vv.currentTime || 0);
      const atEnd = isFinite(vv.duration) && vv.duration > 0 && vv.currentTime >= vv.duration - 0.15;
      if (vv.ended || wrapped || atEnd || !vv.isConnected || st.lastT > 600) stopRecordClip(true);
    }, 300);
  }
  function stopRecordClip(save) {
    const st = recState;
    if (!st) return;
    st.save = save;
    try { st.rec.stop(); } catch { clearInterval(st.timer); window.__anLoopHold = st.holdBefore; recState = null; }
  }
  async function downloadCurrent() {
    // Đang ghi → bấm lần nữa = dừng và lưu ngay.
    if (recState) { stopRecordClip(true); return; }
    const v = getActiveVideo();
    if (!v) { toast('Không tìm thấy video'); return; }
    const s = resolveDownloadSource(v);
    // FB & TikTok: KHÔNG đưa thẳng link CDN cho chrome.downloads — CDN hay ngắt
    // giữa chừng tạo file cụt (chỉ xem được vài giây đầu rồi đứng hình).
    // Tải bằng fetch trong trang + kiểm chứng đủ dung lượng rồi mới lưu; link
    // hỏng thì tự thử nguồn kia, bí quá thì ghi lại clip (luôn trọn vẹn).
    // (YouTube giữ đường chrome.downloads: googlevideo không cho fetch chéo nguồn.)
    if ((isFacebook || isTikTok) && s && s.url) {
      toast('Đang tải video (có kiểm tra toàn vẹn)…');
      recordMedia(v);
      let got = await fetchVerifiedBlob(s.url);
      let note = s.note;
      if (!got && isFacebook) {
        dlCache = { key: '', url: '', note: '', ts: 0 };
        const alt = (s.note === 'fb-sniff') ? (fbNativeUrl() || '') : (sniffFbUrl() || '');
        if (alt && alt !== s.url) {
          got = await fetchVerifiedBlob(alt);
          if (got) note = (s.note === 'fb-sniff') ? '' : 'fb-sniff';
        }
      }
      if (got) {
        const expDur = (isFinite(v.duration) && v.duration > 0) ? v.duration : 0;
        const health = await checkBlobHealth(got.objectUrl, expDur);
        const fname = buildFileName(null).split('/').pop();
        anchorDownload(got.objectUrl, fname);
        setTimeout(() => URL.revokeObjectURL(got.objectUrl), 30000);
        const mb = (got.size / 1048576).toFixed(1);
        markDownloaded(clipKey());
        noteFeature('download', true);
        if (!health.ok) {
          alog('dl', '⚠️ File tải về nghi bị cụt: đọc được ' + (health.dur ? Math.round(health.dur) + 's' : 'lỗi metadata') + (expDur ? (' / clip ' + Math.round(expDur) + 's') : ''));
          toast('⚠️ File vừa lưu có vẻ bị cụt (' + (health.dur ? ('chỉ ' + Math.round(health.dur) + 's') : 'không đọc được') + ') — bấm ⭳ lần nữa để GHI lại clip cho chắc', 5000);
        } else {
          alog('dl', '✅ Tải trọn clip ' + mb + ' MB' + (health.dur ? (' · ' + Math.round(health.dur) + 's') : '') + ': ' + fname);
          toast(note === 'fb-sniff' ? ('✅ Đã tải trọn clip (' + mb + ' MB — bản dự phòng, có thể không có tiếng)') : ('✅ Đã tải trọn clip (' + mb + ' MB, có tiếng — đã kiểm tra' + (health.dur ? (' ' + Math.round(health.dur) + 's') : '') + ')'), 3400);
        }
        return;
      }
      if (isTikTok) {
        // TikTok đôi lúc chặn đọc chéo nguồn từ trang → giao trình tải của Chrome.
        const ok = await downloadUrl(s.url, buildFileName(null));
        if (ok) { markDownloaded(clipKey()); noteFeature('download', true); alog('dl', 'Đã gửi tải TikTok (không kiểm chứng được từ trang)'); toast('Đã gửi tải — nếu file mở lên bị lỗi, bấm ⭳ lần nữa để GHI lại clip', 3600); return; }
      }
      dlCache = { key: '', url: '', note: '', ts: 0 };
      noteFeature('download', false, 'Tải clip trực tiếp thất bại');
      alog('dl', '❌ Link trực tiếp lỗi/cụt → chuyển sang ghi lại clip');
      toast('Link trực tiếp bị lỗi/cụt — chuyển sang GHI lại clip để chắc chắn xem trọn vẹn', 3800);
      startRecordClip(v);
      return;
    }
    if (s && s.url) {
      toast('Đang tải video…');
      recordMedia(v);
      const ok = await downloadUrl(s.url, buildFileName(null));
      if (ok) {
        markDownloaded(clipKey());
        noteFeature('download', true);
        alog('dl', '✅ Đã gửi tải: ' + (s.note || 'link trực tiếp'));
        if (s.note === 'fb-sniff') toast('Đã gửi tải (bản dự phòng — có thể không có tiếng)', 3400);
        else if (s.note === 'yt-prog') toast('Đã gửi tải (MP4 có tiếng — bản tiến trình của YouTube)', 3400);
        return;
      }
    }
    if (s && s.blobUrl) {
      const ok = await downloadUrl(s.blobUrl, guessName(s.blobUrl));
      if (ok) return;
    }
    // Xóa cache để lần bấm sau quét lại từ đầu.
    dlCache = { key: '', url: '', note: '', ts: 0 };
    noteFeature('download', false, 'Tải clip trực tiếp thất bại');
    alog('dl', '⚠️ Không có link tải được → ghi lại clip');
    // Phương án cuối cùng — hoạt động mọi nền tảng, có tiếng: ghi lại clip.
    startRecordClip(v);
  }

  // ---------- PiP thông minh (Document Picture-in-Picture) ----------
  // Giải pháp triệt để: mở CỬA SỔ PiP dạng tài liệu (Chrome 116+) chứa một
  // video trung gian chiếu luồng hình của clip thật (captureStream). Khi lướt
  // sang clip mới chỉ cần gắn lại luồng — cửa sổ KHÔNG bao giờ tự đóng.
  // Cửa sổ phóng to/thu nhỏ tự do tới cỡ màn hình, kích thước được lưu lại
  // để lần sau mở đúng như đã chỉnh. Tiếng vẫn phát từ trang chính.
  let pipWin = null, pipProxy = null, pipSrcVideo = null, pipSrcKey = '';
  let pipSize = { w: 460, h: 780 };
  try { chrome.storage.local.get({ pipSize: null }).then((st) => { if (st && st.pipSize && st.pipSize.w > 120 && st.pipSize.h > 120) pipSize = st.pipSize; }); } catch {}
  function pipSrcKeyOf(v) { return (v && (v.currentSrc || v.src)) || ''; }
  function pipReset() { pipWin = null; pipProxy = null; pipSrcVideo = null; pipSrcKey = ''; }
  function pipAttach(v) {
    if (!pipWin || !pipProxy || !v) return false;
    try {
      const stream = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
      if (!stream) return false;
      pipProxy.srcObject = stream;
      pipProxy.muted = true;
      pipProxy.play().catch(() => {});
      pipSrcVideo = v; pipSrcKey = pipSrcKeyOf(v);
      return true;
    } catch { return false; }
  }
  function pipTick() {
    if (!pipWin || !pipProxy) return;
    const v = getActiveVideo();
    if (!v) return;
    // Đổi thẻ video / đổi nguồn / luồng chưa có hình → gắn lại luồng mới.
    if (v !== pipSrcVideo || pipSrcKeyOf(v) !== pipSrcKey || (!pipProxy.videoWidth && v.readyState >= 2 && !v.paused)) pipAttach(v);
    else if (pipProxy.paused) pipProxy.play().catch(() => {});
  }
  async function openSmartPip() {
    if (!window.documentPictureInPicture || !documentPictureInPicture.requestWindow) return false;
    const v = getActiveVideo();
    if (!v) return false;
    try { pipWin = await documentPictureInPicture.requestWindow({ width: pipSize.w, height: pipSize.h }); }
    catch { pipWin = null; return false; }
    try {
      const d = pipWin.document;
      d.title = 'Phát nổi — Auto Next VIP';
      const st = d.createElement('style');
      st.textContent = 'html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#000;cursor:pointer}';
      d.head.appendChild(st);
      pipProxy = d.createElement('video');
      pipProxy.autoplay = true; pipProxy.muted = true; pipProxy.playsInline = true;
      d.body.appendChild(pipProxy);
      // Bấm vào hình = phát/tạm dừng clip thật; nháy đúp = chuyển clip kế.
      pipProxy.addEventListener('click', () => { const rv = pipSrcVideo || getActiveVideo(); if (!rv) return; if (rv.paused) rv.play().catch(() => {}); else rv.pause(); });
      pipProxy.addEventListener('dblclick', () => nextVideo());
      let szT = 0;
      pipWin.addEventListener('resize', () => { clearTimeout(szT); szT = setTimeout(() => { if (!pipWin) return; pipSize = { w: pipWin.innerWidth, h: pipWin.innerHeight }; try { chrome.storage.local.set({ pipSize }); } catch {} }, 350); });
      pipWin.addEventListener('pagehide', () => pipReset());
      if (!pipAttach(v)) { try { pipWin.close(); } catch {} pipReset(); return false; }
      toast('Phát nổi thông minh: tự bám theo clip mới • bấm = dừng/phát • nháy đúp = clip kế', 3600);
      return true;
    } catch { try { if (pipWin) pipWin.close(); } catch {} pipReset(); return false; }
  }
  // PiP thường (dự phòng): tự mở lại khi trang gỡ thẻ video lúc chuy��n clip.
  let nativePipWanted = false;
  document.addEventListener('leavepictureinpicture', (e) => {
    const old = e.target;
    setTimeout(() => {
      if (pipWin || !nativePipWanted || document.pictureInPictureElement) return;
      const nv = getActiveVideo();
      if (nv && (old !== nv || !old.isConnected)) {
        try { nv.disablePictureInPicture = false; } catch {}
        nv.requestPictureInPicture().catch(() => { nativePipWanted = false; toast('Trang chặn mở lại PiP tự động — bấm nút PiP thêm lần nữa nhé', 3200); });
      } else {
        nativePipWanted = false; // người dùng tự đóng cửa sổ PiP
      }
    }, 400);
  }, true);
  async function togglePiP() {
    if (pipWin) { try { pipWin.close(); } catch {} pipReset(); toast('Đã tắt phát nổi'); return; }
    if (document.pictureInPictureElement) { nativePipWanted = false; try { await document.exitPictureInPicture(); } catch {} toast('Đã tắt phát nổi'); return; }
    if (await openSmartPip()) return;
    const v = getActiveVideo();
    if (!v) { toast('Không có video'); return; }
    try {
      try { v.disablePictureInPicture = false; } catch {}
      await v.requestPictureInPicture();
      nativePipWanted = true;
      toast('Đang phát nổi (PiP thường)');
    } catch { toast('Không mở được PiP ở trang này'); }
  }

  // ---------- auto PiP (tự bật khi rời tab) ----------
  // Best effort: tùy phiên bản Chrome có thể yêu cầu thao tác người dùng hoặc
  // bật "Automatically enter picture-in-picture" trong cài đặt trang web.
  let autoPipActive = false;
  async function tryAutoPip() {
    if (!settings.autoPip || !siteEnabled() || !pageRelevant()) return;
    if (pipWin || document.pictureInPictureElement) return;
    const v = getActiveVideo();
    if (!v || v.paused || v.ended) return;
    try {
      v.disablePictureInPicture = false;
      await v.requestPictureInPicture();
      autoPipActive = true;
    } catch {}
  }
  async function exitAutoPip() {
    if (!autoPipActive) return;
    autoPipActive = false;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') tryAutoPip();
    else exitAutoPip();
  });
  // Chrome auto-PiP hook (nếu trình duyệt hỗ trợ hành động này).
  try {
    navigator.mediaSession?.setActionHandler?.('enterpictureinpicture', () => tryAutoPip());
  } catch {}

  // ---------- favorites (clip yêu thích) ----------
  let favorites = [];
  try {
    chrome.storage?.local?.get({ favorites: [] }, (s) => {
      favorites = Array.isArray(s?.favorites) ? s.favorites : [];
      refreshHud();
      if (panelOpen) renderPanel();
    });
  } catch {}
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.favorites) favorites = Array.isArray(changes.favorites.newValue) ? changes.favorites.newValue : [];
    if (changes.blockedAuthors) blockedAuthors = Array.isArray(changes.blockedAuthors.newValue) ? changes.blockedAuthors.newValue : [];
    if (changes.blockedKeywords) blockedKeywords = Array.isArray(changes.blockedKeywords.newValue) ? changes.blockedKeywords.newValue : [];
    if (!changes.favorites && !changes.blockedAuthors && !changes.blockedKeywords) return;
    refreshHud();
    if (panelOpen) renderPanel();
  });
  // ID yêu thích (nhẹ) còn được đồng bộ qua tài khoản Chrome (storage.sync,
  // tối đa 400 ID gần nhất) — dấu ★ theo bạn qua các máy; chi tiết clip vẫn
  // nằm trong storage.local của từng máy.
  let favIdsSync = new Set();
  try {
    chrome.storage?.sync?.get({ favIds: [] }, (s) => {
      favIdsSync = new Set(Array.isArray(s?.favIds) ? s.favIds : []);
      refreshHud();
    });
  } catch {}
  function saveFavorites() {
    try {
      chrome.storage.local.set({ favorites: favorites.slice(-1000) }, () => {
        if (chrome.runtime?.lastError) toast('⚠️ Không lưu được Yêu thích — hãy tải lại trang (F5) rồi thử lại', 3600);
      });
    } catch {
      toast('⚠️ Không lưu được Yêu thích — hãy tải lại trang (F5) rồi thử lại', 3600);
    }
    try { chrome.storage?.sync?.set({ favIds: [...favIdsSync].slice(-400) }); } catch {}
  }
  function favId() { return clipKey() || location.href; }
  // Link mở lại clip: ưu tiên link chuẩn do content script dò được (quan trọng
  // với TikTok trang For You — location.href không chứa ID clip).
  function favPage() {
    try {
      const api = window.__autoNextApi;
      if (api && typeof api.clipUrl === 'function') return api.clipUrl() || location.href;
    } catch {}
    return location.href;
  }
  function isFavorited() {
    const id = favId();
    return favIdsSync.has(id) || favorites.some((f) => f.id === id);
  }
  function toggleFavorite() {
    // Extension vừa được cập nhật/tải lại → context của trang này đã cũ,
    // mọi lệnh lưu sẽ thất bại im lặng. Báo thẳng thay vì "Đã lưu" giả.
    if (!chrome.runtime?.id) { toast('⚠️ Extension vừa được cập nhật — hãy tải lại trang (F5) rồi bấm ⭐ lại', 3600); return; }
    const id = favId();
    const i = favorites.findIndex((f) => f.id === id);
    if (i >= 0) {
      favorites.splice(i, 1);
      favIdsSync.delete(id);
      toast('Đã bỏ khỏi Yêu thích');
    } else {
      // Kể cả khi dấu ★ đồng bộ từ máy khác đang bật, bấm ⭐ vẫn LƯU chi tiết
      // clip vào danh sách máy này (trước đây bị hiểu nhầm thành "bỏ thích"
      // → clip không bao giờ xuất hiện trong danh sách).
      favorites.push({ id, page: favPage(), title: (document.title || '').slice(0, 120), platform, ts: Date.now() });
      favIdsSync.add(id);
      // Bỏ bộ lọc thư mục/tìm kiếm đang dính để clip mới chắc chắn nhìn thấy được.
      favSearchQ = '';
      favFolderQ = '';
      if (els.favSearch) els.favSearch.value = '';
      toast('⭐ Đã lưu vào Yêu thích (' + favorites.length + ' clip)');
    }
    saveFavorites();
    refreshHud();
    if (panelOpen && activeTab === 'fav') renderPanel();
  }
  function exportFavorites() {
    if (!favorites.length) { toast('Chưa có clip yêu thích nào'); return; }
    try {
      const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      anchorDownload(u, 'AutoNext_favorites_' + new Date().toISOString().slice(0, 10) + '.json');
      setTimeout(() => URL.revokeObjectURL(u), 15000);
      toast('Đã xuất ' + favorites.length + ' clip yêu thích (JSON)');
    } catch { toast('Xuất thất bại'); }
  }
  let favFileInput = null;
  function importFavorites() {
    if (!favFileInput) {
      favFileInput = document.createElement('input');
      favFileInput.type = 'file';
      favFileInput.accept = '.json,application/json';
      favFileInput.style.display = 'none';
      document.documentElement.appendChild(favFileInput);
      favFileInput.addEventListener('change', () => {
        const f = favFileInput.files && favFileInput.files[0];
        favFileInput.value = '';
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const arr = JSON.parse(String(rd.result));
            if (!Array.isArray(arr)) throw new Error('bad');
            let added = 0;
            for (const it of arr) {
              if (!it || typeof it !== 'object' || !it.id || !it.page) continue;
              if (favorites.some((x) => x.id === it.id)) continue;
              favorites.push({
                id: String(it.id),
                page: String(it.page),
                title: String(it.title || '').slice(0, 120),
                platform: String(it.platform || ''),
                note: String(it.note || '').slice(0, 200),
                folder: String(it.folder || '').slice(0, 30),
                ts: Number(it.ts) || Date.now()
              });
              favIdsSync.add(String(it.id));
              added++;
            }
            saveFavorites();
            if (panelOpen) renderPanel();
            refreshHud();
            toast(added ? ('Đã nhập ' + added + ' clip mới từ file') : 'Không có clip mới nào trong file', 3000);
          } catch { toast('File không hợp lệ — cần file JSON đã xuất từ extension', 3400); }
        };
        rd.readAsText(f);
      });
    }
    favFileInput.click();
  }

  // ---------- phát lần lượt clip yêu thích ----------
  // Hàng đợi nằm trong storage.local nên sống qua cả điều hướng đổi trang /
  // đổi nền tảng. Khi __anFavPlayback bật, content.js tạm ngưng auto-next,
  // seen-skip và marathon; features.js tự điều hướng sang clip kế tiếp.
  let favQueue = null;
  let favAdvancing = false;
  let favLoop = false;
  window.__anFavPlayback = false;
  // Ghi nhớ chế đ��� lặp vòng giữa các lần điều hướng clip.
  try { chrome.storage?.local?.get({ favLoop: false }, (s) => { favLoop = !!(s && s.favLoop); refreshHud(); }); } catch {}
  function toggleFavLoop() {
    favLoop = !favLoop;
    try { chrome.storage?.local?.set({ favLoop }); } catch {}
    toast(favLoop ? '\uD83D\uDD01 Lặp vòng danh sách: BẬT' : 'Lặp vòng danh sách: TẮT');
    refreshHud();
  }
  function favQueueMatchesHere(q) {
    const cur = q && q.active && Array.isArray(q.pages) ? q.pages[q.pos] : null;
    if (!cur) return false;
    try {
      const u = new URL(cur);
      return u.hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, '') && u.pathname === location.pathname;
    } catch { return false; }
  }
  function startFavPlayback(shuffle) {
    // Tôn trọng thư mục đang lọc trong tab Yêu thích (nếu có).
    // Thứ tự phát = thứ tự trong danh sách (kéo-thả trong tab ★ để sắp xếp).
    let items = [...favorites].reverse();
    if (favFolderQ) items = items.filter((f) => (f.folder || '') === favFolderQ);
    const pages = items.map((f) => f.page).filter(Boolean);
    if (!pages.length) { toast(favFolderQ ? 'Thư mục này chưa có clip nào' : 'Chưa có clip yêu thích nào'); return; }
    if (shuffle) {
      // Fisher–Yates: trộn đều thứ tự phát.
      for (let i = pages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pages[i], pages[j]] = [pages[j], pages[i]];
      }
    }
    favQueue = { pages, pos: 0, active: true, startedTs: Date.now() };
    try { chrome.storage?.local?.set({ favQueue }); } catch {}
    toast((shuffle ? '\uD83D\uDD00 Phát ngẫu nhiên ' : '\u25B6 Phát lần lượt ') + pages.length + (favFolderQ ? (' clip trong \uD83D\uDCC1 ' + favFolderQ) : ' clip yêu thích') + '\u2026', 3000);
    window.__anFavPlayback = favQueueMatchesHere(favQueue);
    refreshHud();
    if (!window.__anFavPlayback) { try { location.assign(pages[0]); } catch {} }
  }
  function stopFavPlayback(silent) {
    favQueue = null;
    window.__anFavPlayback = false;
    try { chrome.storage?.local?.remove('favQueue'); } catch {}
    if (!silent) toast('Đã dừng phát danh sách yêu thích');
    refreshHud();
  }
  function favPlaybackAdvance() {
    if (favAdvancing || !favQueue || !favQueue.active) return;
    let next = favQueue.pos + 1;
    let wrapped = false;
    if (next >= favQueue.pages.length) {
      if (favLoop && favQueue.pages.length > 0) {
        next = 0;
        wrapped = true;
      } else {
        toast('\uD83C\uDF89 Đã phát hết ' + favQueue.pages.length + ' clip yêu thích', 3400);
        stopFavPlayback(true);
        return;
      }
    }
    favAdvancing = true;
    favQueue = { ...favQueue, pos: next };
    try { chrome.storage?.local?.set({ favQueue }); } catch {}
    const targetUrl = favQueue.pages[next];
    // Cùng trang (danh sách 1 clip, hoặc lặp về đúng clip đang ở) — location.assign
    // sẽ không tải lại, nên tự phát lại video từ đầu thay vì đứng im.
    let sameHere = false;
    try {
      const tu = new URL(targetUrl);
      sameHere = tu.hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, '') && tu.pathname === location.pathname;
    } catch {}
    if (sameHere) {
      const v = getActiveVideo();
      if (v) { try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch {} }
      toast(wrapped ? '\uD83D\uDD01 Lặp lại clip ' + (next + 1) + '/' + favQueue.pages.length : '\u25B6 Yêu thích: clip ' + (next + 1) + '/' + favQueue.pages.length);
      favAdvancing = false;
      return;
    }
    toast((wrapped ? '\uD83D\uDD01 Lặp lại từ đầu · clip ' : '\u25B6 Yêu thích: clip ') + (next + 1) + '/' + favQueue.pages.length);
    try { location.assign(targetUrl); } catch { favAdvancing = false; }
  }
  // Đang gõ ở ô nhập liệu? (đồng bộ với logic hoãn auto-next của content.js)
  function typingNow() {
    try {
      let el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      if (!el || el === document.body) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'select') return true;
      if (tag === 'input') {
        const t = (el.type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'].includes(t);
      }
      return !!(el.isContentEditable || (el.getAttribute && el.getAttribute('role') === 'textbox'));
    } catch { return false; }
  }
  function favPlaybackTick() {
    if (!window.__anFavPlayback || !favQueue || !favQueue.active || favAdvancing) return;
    if (!favQueueMatchesHere(favQueue)) return;
    // Đang gõ bình luận — giữ nguyên clip, tick sau sẽ tự kiểm tra lại.
    if (typingNow()) return;
    const v = getActiveVideo();
    if (!v) return;
    const nearEnd = isFinite(v.duration) && v.duration > 0 && !v.paused && (v.duration - v.currentTime) <= 0.3;
    if (v.ended || nearEnd) favPlaybackAdvance();
  }
  // Khôi phục hàng đợi sau khi trang tải lại (điều hướng giữa các clip).
  try {
    chrome.storage?.local?.get({ favQueue: null }, (s) => {
      const q = s && s.favQueue;
      if (!q || !q.active || !Array.isArray(q.pages)) return;
      // Hàng đợi quá 2 giờ coi như bỏ dở — xoá để tránh kẹt trạng thái.
      if (Date.now() - (q.startedTs || 0) > 7200000) {
        try { chrome.storage?.local?.remove('favQueue'); } catch {}
        return;
      }
      favQueue = q;
      if (favQueueMatchesHere(q)) {
        window.__anFavPlayback = true;
        toast('\u25B6 Yêu thích: clip ' + (q.pos + 1) + '/' + q.pages.length);
        refreshHud();
      } else {
        stopFavPlayback(true);
      }
    });
  } catch {}

  // ---------- marathon (chỉ xem clip cùng tác giả) ----------
  // State sống theo phiên tab. Logic lướt qua clip khác tác giả n����m ở
  // content.js (handleClipEntry) — hai script dùng chung isolated world.
  window.__anToast = toast;
  window.__anMarathonSync = () => refreshHud();
  function currentAuthor() {
    try {
      const api = window.__autoNextApi;
      if (api && typeof api.author === 'function') return api.author();
    } catch {}
    return null;
  }
  function toggleMarathon() {
    if (window.__anMarathon) {
      window.__anMarathon = null;
      toast('Marathon tác giả: TẮT');
    } else {
      const a = currentAuthor();
      if (!a) {
        toast('Không nhận diện được tác giả clip này — đợi clip hiện đầy đủ rồi thử lại', 3000);
        refreshHud();
        return;
      }
      window.__anMarathon = { author: a, skips: 0 };
      toast('🎯 Marathon: chỉ xem clip của ' + a, 3000);
    }
    refreshHud();
  }

  // ---------- chặn tác giả (blacklist) ----------
  // Danh sách nằm trong storage.local; content.js đọc cùng key để tự lướt
  // qua clip của tác giả bị chặn (blocked-skip).
  let blockedAuthors = [];
  let blockedKeywords = [];
  function platformOfKey(k) { return k.slice(0, 3) === 'tt:' ? 'tiktok' : k.slice(0, 3) === 'yt:' ? 'youtube' : k.slice(0, 3) === 'ig:' ? 'instagram' : k.slice(0, 2) === 'x:' ? 'x' : 'facebook'; }
  // Áp bản đồng bộ (danh sách key gọn trong storage.sync) vào danh sách đầy đủ.
  function applyBlockedSync(keys) {
    if (!Array.isArray(keys)) return;
    const map = new Map(blockedAuthors.map((b) => [b.key, b]));
    blockedAuthors = keys
      .filter((k) => typeof k === 'string' && k.length > 3)
      .map((k) => map.get(k) || { key: k, author: k.slice(3), platform: platformOfKey(k), ts: Date.now() });
    try { chrome.storage?.local?.set({ blockedAuthors: blockedAuthors.slice(-500) }); } catch {}
    refreshHud();
    if (panelOpen && activeTab === 'block') renderPanel();
  }
  function applyKwSync(kws) {
    if (!Array.isArray(kws)) return;
    blockedKeywords = kws.filter((k) => typeof k === 'string' && k).slice(-100);
    try { chrome.storage?.local?.set({ blockedKeywords }); } catch {}
    if (panelOpen && activeTab === 'block') renderPanel();
  }
  try {
    // Nạp bản local trước, rồi gộp với bản đồng bộ qua tài khoản Chrome (nếu có).
    chrome.storage?.local?.get({ blockedAuthors: [], blockedKeywords: [] }, (s) => {
      blockedAuthors = Array.isArray(s?.blockedAuthors) ? s.blockedAuthors : [];
      blockedKeywords = Array.isArray(s?.blockedKeywords) ? s.blockedKeywords : [];
      refreshHud();
      chrome.storage?.sync?.get({ blockedSync: null, blockedKw: null }, (ss) => {
        if (Array.isArray(ss?.blockedSync)) applyBlockedSync(ss.blockedSync);
        if (Array.isArray(ss?.blockedKw)) applyKwSync(ss.blockedKw);
        // Lần đầu nâng cấp: đẩy danh sách local hiện có lên bản đồng bộ.
        if (!Array.isArray(ss?.blockedSync) && (blockedAuthors.length || blockedKeywords.length)) saveBlocked();
      });
    });
  } catch {}
  function saveBlocked() {
    try { chrome.storage?.local?.set({ blockedAuthors: blockedAuthors.slice(-500), blockedKeywords: blockedKeywords.slice(-100) }); } catch {}
    // Đồng bộ qua tài khoản Chrome: chỉ lưu key gọn (tối đa 300 tác giả +
    // 100 từ khóa) để không vượt hạn mức storage.sync.
    try { chrome.storage?.sync?.set({ blockedSync: blockedAuthors.slice(-300).map((b) => b.key), blockedKw: blockedKeywords.slice(-100) }); } catch {}
  }
  function authorKeyOf(a) { return (isTikTok ? 'tt:' : isYouTube ? 'yt:' : isInstagram ? 'ig:' : isX ? 'x:' : 'fb:') + a; }
  function currentAuthorBlocked() {
    const a = currentAuthor();
    return a ? blockedAuthors.some((b) => b.key === authorKeyOf(a)) : false;
  }
  function toggleBlockAuthor() {
    const a = currentAuthor();
    if (!a) {
      toast('Không nhận diện được tác giả clip này — đợi clip hiện đầy đủ rồi thử lại', 3000);
      return;
    }
    const key = authorKeyOf(a);
    const i = blockedAuthors.findIndex((b) => b.key === key);
    if (i >= 0) {
      blockedAuthors.splice(i, 1);
      toast('Đã bỏ chặn ' + a);
    } else {
      blockedAuthors.push({ key, author: a, platform, ts: Date.now() });
      toast('🚫 Đã chặn ' + a + ' — clip của họ sẽ được lướt qua', 3200);
    }
    saveBlocked();
    refreshHud();
    if (panelOpen && activeTab === 'block') renderPanel();
  }
  function showBlockMenuFacebook() {
    const a = currentAuthor();
    if (!a) {
      toast('Không nhận diện được tác giả clip này — đợi clip hiện đầy đủ rồi thử lại', 3000);
      return;
    }
    const choice = confirm(
      'CHẶN TÁC GIẢ TRÊN FACEBOOK: ' + a + '\n\n' +
      '• Bấm [OK]: CHẶN CỨNG trên Facebook (Tự động mở menu và chặn tài khoản vĩnh viễn, không bao giờ gặp lại).\n\n' +
      '• Bấm [Hủy]: CHẶN MỀM (Chỉ tự động lướt qua clip trên tiện ích này).'
    );
    if (choice) {
      hardBlockFacebookPage(true);
    } else {
      toggleBlockAuthor();
    }
  }
  // Chặn theo từ khóa tiêu đề: clip có tiêu đề chứa từ khóa sẽ được tự lướt
  // qua (kiểm tra ở content.js). Lưu ý: Facebook Reels không có tiêu đề riêng
  // từng clip nên bộ lọc này hiệu quả nhất trên TikTok / YouTube Shorts.
  function addBlockedKeyword(kw) {
    const k = String(kw || '').trim().toLowerCase().slice(0, 60);
    if (!k) return;
    if (blockedKeywords.includes(k)) { toast('Từ khóa này đã có trong danh sách'); return; }
    blockedKeywords.push(k);
    saveBlocked();
    toast('🚫 Đã chặn từ khóa "' + k + '" — clip có tiêu đề chứa nó sẽ bị lướt qua', 3200);
    if (panelOpen && activeTab === 'block') renderPanel();
  }
  function removeBlockedKeyword(k) {
    blockedKeywords = blockedKeywords.filter((x) => x !== k);
    saveBlocked();
    if (panelOpen && activeTab === 'block') renderPanel();
  }

  // Giả lập chuỗi sự kiện click đầy đủ để kích hoạt synthetic listeners của React
  function syntheticClick(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', base));
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new PointerEvent('pointerup', base));
      el.dispatchEvent(new MouseEvent('mouseup', base));
      el.dispatchEvent(new MouseEvent('click', base));
      if (typeof el.click === 'function') {
        try { el.click(); } catch {}
      }
      return true;
    } catch {
      try {
        if (typeof el.click === 'function') el.click();
        return true;
      } catch {
        return false;
      }
    }
  }

  // Chặn vĩnh viễn Trang trên tài khoản Facebook (Hard Block Account via 3-dots native menu)
  let hardBlockInProgress = false;
  async function hardBlockFacebookPage(skipConfirm = false) {
    if (!isFacebook) {
      toast('Chặn tài khoản vĩnh viễn hiện chỉ áp dụng trên Facebook Reels');
      return;
    }
    if (hardBlockInProgress) return;

    const api = window.__autoNextApi;
    const v = api && typeof api.getActiveVideo === 'function' ? api.getActiveVideo() : document.querySelector('video');
    const authorName = (api && typeof api.author === 'function' ? api.author() : currentAuthor()) || 'Trang này';

    if (!skipConfirm) {
      if (!confirm('Bạn có chắc muốn CHẶN VĨNH VIỄN ' + authorName + ' trên tài khoản Facebook không?\n(Sau khi chặn, Facebook sẽ chặn nick thật và không bao giờ phân phối clip của Trang này nữa)')) {
        return;
      }
    }

    hardBlockInProgress = true;

    // Tạm giữ không cho auto-next nhảy dở chừng
    try { api && api.setLoopHold && api.setLoopHold(true); } catch {}
    try { if (v && !v.paused) v.pause(); } catch {}

    toast('Đang thực hiện quy trình chặn ' + authorName + ' trên Facebook...', 3500);

    try {
      // 1. Tìm container chứa Reel đang phát
      const scope = v ? (v.closest('[role="main"]') || v.closest('[role="feed"] > div') || v.closest('div[data-pagelet*="Reel"]') || v.parentElement?.parentElement || document) : document;

      // 2. Tìm nút 3 chấm (...)
      const optLabels = [
        'hành động cho bài viết này', 'tác vụ khác cho thước phim này', 'tác vụ khác', 'tùy chọn khác', 'thao tác khác',
        'actions for this post', 'more options for this reel', 'more options', 'options', 'xem thêm'
      ];
      let optBtn = null;
      const candidates = Array.from(scope.querySelectorAll('[aria-label], [role="button"][aria-label], button[aria-label]'));
      for (const el of candidates) {
        const lbl = (el.getAttribute('aria-label') || '').toLowerCase().trim();
        if (optLabels.some(l => lbl === l || lbl.includes(l))) {
          if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) {
            optBtn = el;
            break;
          }
        }
      }
      if (!optBtn) {
        const popupBtns = Array.from(scope.querySelectorAll('[role="button"][aria-haspopup="menu"], button[aria-haspopup="menu"]'));
        if (popupBtns.length) optBtn = popupBtns[0];
      }
      if (!optBtn) {
        // Tìm rộng ra toàn bộ tài liệu nếu đang xem trên profile/trang
        const globalCandidates = Array.from(document.querySelectorAll('[aria-label], [role="button"][aria-label], button[aria-label]'));
        for (const el of globalCandidates) {
          const lbl = (el.getAttribute('aria-label') || '').toLowerCase().trim();
          if (optLabels.some(l => lbl === l || lbl.includes(l))) {
            if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) {
              optBtn = el;
              break;
            }
          }
        }
      }

      if (!optBtn) {
        toast('Không tìm thấy nút 3 chấm của Reel để mở menu chặn', 3500);
        return;
      }

      syntheticClick(optBtn);

      // 3. Chờ menu ngữ cảnh (div[role="menu"]) xuất hiện
      let menu = null;
      const menuStart = Date.now();
      while (Date.now() - menuStart < 2500) {
        await new Promise(r => setTimeout(r, 80));
        menu = document.querySelector('div[role="menu"]');
        if (menu && (menu.offsetWidth > 0 || menu.getClientRects().length > 0)) break;
      }

      if (!menu) {
        toast('Không mở được menu tùy chọn của Facebook', 3000);
        return;
      }

      // 4. Tìm mục "Chặn" trong menu
      let blockItem = null;
      const items = Array.from(menu.querySelectorAll('[role="menuitem"], div[role="button"]'));
      for (const it of items) {
        const txt = (it.textContent || '').trim().toLowerCase();
        const aria = (it.getAttribute('aria-label') || '').trim().toLowerCase();
        if (txt.includes('báo cáo') || txt.includes('report') || txt.includes('mời') || txt.includes('invite') || txt.includes('bỏ chặn') || txt.includes('unblock')) continue;
        if (/^(chặn|block)\b/i.test(txt) || txt === 'chặn' || txt === 'block' || aria.includes('chặn') || aria.includes('block')) {
          blockItem = it;
          break;
        }
      }

      if (!blockItem) {
        toast('Không tìm thấy mục "Chặn" trong menu của Facebook', 3500);
        try { document.body.click(); } catch {}
        return;
      }

      syntheticClick(blockItem);

      // 5. Chờ hộp thoại xác nhận thứ 1: "Chặn [Tên]?" (div[role="dialog"])
      let dialog = null;
      const dlgStart = Date.now();
      while (Date.now() - dlgStart < 3000) {
        await new Promise(r => setTimeout(r, 90));
        dialog = document.querySelector('div[role="dialog"]');
        if (dialog && (dialog.offsetWidth > 0 || dialog.getClientRects().length > 0)) break;
      }

      if (!dialog) {
        toast('Không thấy hộp thoại xác nhận chặn của Facebook', 3000);
        return;
      }

      // 6. Tìm nút Xác nhận trong dialog
      let confirmBtn = null;
      const dlgBtns = Array.from(dialog.querySelectorAll('[role="button"], button'));
      for (const b of dlgBtns) {
        const txt = (b.textContent || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        if (/hủy|cancel/i.test(txt) || /hủy|cancel/i.test(aria)) continue;
        if (/chặn|block|xác nhận|confirm/i.test(txt) || /chặn|block|xác nhận|confirm/i.test(aria)) {
          confirmBtn = b;
          break;
        }
      }

      if (!confirmBtn) {
        toast('Không tìm thấy nút Xác nhận trong hộp thoại Facebook', 3500);
        return;
      }

      syntheticClick(confirmBtn);
      await new Promise(r => setTimeout(r, 600));

      // 7. Chờ hộp thoại thứ 2 xuất hiện: "Bạn đã chặn [Tên]" và tự động bấm nút "Đóng"
      const closeStart = Date.now();
      while (Date.now() - closeStart < 2500) {
        await new Promise(r => setTimeout(r, 100));
        const allDlgs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        let closed = false;
        for (const dlg of allDlgs) {
          const btns = Array.from(dlg.querySelectorAll('[role="button"], button'));
          for (const b of btns) {
            const txt = (b.textContent || '').trim().toLowerCase();
            const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
            if (txt === 'đóng' || txt === 'close' || txt === 'ok' || aria === 'đóng' || aria === 'close') {
              syntheticClick(b);
              closed = true;
              break;
            }
          }
          if (closed) break;
        }
        if (closed) break;
      }

      // 8. Đồng thời lưu tác giả vào danh sách đen của tiện ích
      const a = currentAuthor();
      if (a) {
        const key = authorKeyOf(a);
        if (!blockedAuthors.some(b => b.key === key)) {
          blockedAuthors.push({ key, author: a, platform, ts: Date.now() });
          saveBlocked();
        }
      }

      toast('🚫 Đã chặn vĩnh viễn ' + authorName + ' trên Facebook!', 4000);
      refreshHud();

      // 9. Tự động lướt sang clip kế tiếp sau 800ms
      setTimeout(() => {
        try { api && api.setLoopHold && api.setLoopHold(false); } catch {}
        try { api && api.next && api.next(); } catch {}
      }, 800);

    } catch (err) {
      toast('Lỗi khi thực hiện quy trình chặn: ' + String(err), 3500);
    } finally {
      hardBlockInProgress = false;
      try { api && api.setLoopHold && api.setLoopHold(false); } catch {}
    }
  }

  // ---------- đè giữ đ�� tua nhanh (hold-to-fast) ----------
  // Đè giữ chuột/tay lên video ~0,35s => tạm tăng 2x như TikTok mobile;
  // thả ra là về tốc độ cũ. Cú click sinh ra sau khi thả được nuốt để
  // trang không tạm dừng video.
  const HOLD_MS = 350;
  const HOLD_RATE = 2;
  let holdFastActive = false;
  let holdTimer = null;
  let holdVideo = null;
  let holdSuppressClick = false;
  function pointOnVideo(e) {
    const v = getActiveVideo();
    if (!v) return null;
    const r = v.getBoundingClientRect();
    return (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) ? v : null;
  }
  document.addEventListener('pointerdown', (e) => {
    if (!settings.holdFast || !siteEnabled() || !pageRelevant()) return;
    if (e.button !== 0) return;
    try { if (hudRoot && e.composedPath && e.composedPath().includes(hudRoot)) return; } catch {}
    const v = pointOnVideo(e);
    if (!v || v.paused || v.ended) return;
    clearTimeout(holdTimer);
    holdVideo = v;
    holdTimer = setTimeout(() => {
      holdFastActive = true;
      try { holdVideo.playbackRate = HOLD_RATE; } catch {}
      toast('\u23E9 ' + HOLD_RATE + 'x — thả ra để về ' + (settings.playbackRate || 1) + 'x');
    }, HOLD_MS);
  }, true);
  function holdFastEnd() {
    clearTimeout(holdTimer);
    if (!holdFastActive) { holdVideo = null; return; }
    holdFastActive = false;
    holdSuppressClick = true;
    setTimeout(() => { holdSuppressClick = false; }, 420);
    try { if (holdVideo) holdVideo.playbackRate = settings.playbackRate || 1; } catch {}
    holdVideo = null;
    toast('Tốc độ phát: ' + (settings.playbackRate || 1) + 'x', 1200);
  }
  document.addEventListener('pointerup', holdFastEnd, true);
  document.addEventListener('pointercancel', holdFastEnd, true);
  document.addEventListener('click', (e) => {
    if (!holdSuppressClick) return;
    holdSuppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ---------- speed ----------
  const RATES = [1, 1.25, 1.5, 2, 0.5, 0.75];
  function enforceRate() {
    if (holdFastActive) return; // đang đè giữ tua nhanh — không ghi đè tốc độ
    const r = settings.playbackRate || 1;
    document.querySelectorAll('video').forEach((v) => { try { if (Math.abs(v.playbackRate - r) > 0.01) v.playbackRate = r; } catch {} });
  }
  function setRate(r) {
    settings.playbackRate = r;
    try { chrome.storage?.sync?.set({ playbackRate: r }); } catch {}
    enforceRate();
    refreshHud();
  }
  function cycleSpeed(dir) {
    let i = RATES.indexOf(settings.playbackRate);
    if (i < 0) i = 0;
    i = (i + (dir || 1) + RATES.length) % RATES.length;
    setRate(RATES[i]);
    toast('Tốc độ phát: ' + RATES[i] + 'x');
  }

  // ---------- volume normalization ----------
  // A DynamicsCompressor smooths out clips that are much louder than others.
  // Only blob:/MSE sources are hooked: they are same-origin, so Web Audio
  // won't CORS-taint (and mute) them. Direct cross-origin file sources are
  // skipped on purpose — hooking those would silence their audio.
  let audioCtx = null;
  const audioGraph = new WeakMap();
  function ensureAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume().catch(() => {}); } catch {}
    }
    return audioCtx;
  }
  document.addEventListener('pointerdown', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume().catch(() => {}); } catch {}
    }
  }, true);
  function routeGraph(g, normalized) {
    try {
      g.src.disconnect();
      if (normalized) g.src.connect(g.comp);
      else g.src.connect(g.ctx.destination);
      g.normalized = normalized;
    } catch {}
  }
  function hookVolume(v) {
    if (!v || audioGraph.has(v)) return;
    const src = v.currentSrc || v.src || '';
    if (src.indexOf('blob:') !== 0) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const srcNode = ctx.createMediaElementSource(v);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -28;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      comp.attack.value = 0.02;
      comp.release.value = 0.3;
      const gain = ctx.createGain();
      gain.gain.value = 1.1; // small make-up gain after compression
      comp.connect(gain);
      gain.connect(ctx.destination);
      const g = { ctx, src: srcNode, comp, gain, normalized: false };
      audioGraph.set(v, g);
      routeGraph(g, true);
    } catch {}
  }
  function applyVolumeNormalize() {
    const on = !!settings.volumeNormalize;
    document.querySelectorAll('video').forEach((v) => {
      const g = audioGraph.get(v);
      if (g) { if (g.normalized !== on) routeGraph(g, on); }
      else if (on) hookVolume(v);
    });
  }

  // ---------- nút âm lượng (hình tròn 2 nửa: trái giảm / phải tăng) ----------
  let userVolume = null;
  let userUnmuted = null; // true = người dùng muốn có tiếng; false = muốn tắt tiếng; null = chưa can thiệp
  try { chrome.storage.local.get({ userVolume: null, userUnmuted: null }).then((st) => { if (st && typeof st.userVolume === 'number') userVolume = st.userVolume; if (st && typeof st.userUnmuted === 'boolean') userUnmuted = st.userUnmuted; }); } catch {}
  const volApplied = new WeakSet();
  const volWatched = new WeakSet();
  let volOwnChangeUntil = 0; // dấu thời gian: thay đổi âm lượng do chính extension gây ra
  let lastGestureAt = 0;
  try {
    document.addEventListener('pointerdown', () => { lastGestureAt = Date.now(); }, true);
    document.addEventListener('keydown', () => { lastGestureAt = Date.now(); }, true);
  } catch {}
  // Tìm nút loa CỦA TRANG (FB Reels…) gần video. Nút aria-label "Bật tiếng"/"Unmute"
  // chỉ tồn tại khi trang đang coi là mute (và ngược lại) → thấy nút nghĩa là cần bấm để đồng bộ.
  function findSiteMuteToggle(v, wantMuted) {
    const re = wantMuted ? /^(mute|tắt tiếng|tắt âm thanh)/i : /^(unmute|bật tiếng|bật âm thanh)/i;
    let node = v;
    for (let i = 0; i < 8 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const cands = node.querySelectorAll('[role="button"][aria-label], button[aria-label]');
      for (const b of cands) {
        const l = (b.getAttribute('aria-label') || '').trim();
        if (!re.test(l)) continue;
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return b;
      }
    }
    return null;
  }
  // Đổi mute/unmute ĐỒNG BỘ với UI của trang: bấm chính nút loa của FB (nếu thấy)
  // để state nội bộ của FB cập nhật + tự ghi nhớ cho clip sau; rồi chốt lại trên thẻ video.
  function setMutedSynced(v, wantMuted) {
    volOwnChangeUntil = Date.now() + 900;
    if (isFacebook) {
      const b = findSiteMuteToggle(v, wantMuted);
      if (b) { try { b.click(); } catch {} noteFeature('volSync', true); }
    }
    try { v.muted = wantMuted; } catch {}
    if (!wantMuted && userVolume != null && userVolume > 0) {
      try { v.volume = userVolume; } catch {}
      // FB có thể đặt l���i volume ngay sau cú click → chốt thêm một nhịp nữa
      setTimeout(() => { volOwnChangeUntil = Date.now() + 300; try { if (!v.muted) v.volume = userVolume; } catch {} }, 150);
    }
  }
  // Khi NGƯỜI DÙNG tự chỉnh bằng nút loa gốc của trang → tôn trọng và ghi nhớ lựa chọn đó,
  // không giành quyền ở clip sau. (Thay đổi do script của trang thì bỏ qua.)
  function watchVolume(v) {
    if (volWatched.has(v)) return;
    volWatched.add(v);
    v.addEventListener('volumechange', () => {
      if (Date.now() < volOwnChangeUntil) return; // thay đổi do extension
      if (Date.now() - lastGestureAt > 1200) return; // thay đổi do script của trang
      userUnmuted = !v.muted;
      if (!v.muted && v.volume > 0) userVolume = Math.round(v.volume * 100) / 100;
      try { chrome.storage?.local?.set({ userVolume, userUnmuted }); } catch {}
    });
  }
  function adjustVolume(delta) {
    const v = getActiveVideo();
    if (!v) { toast('Không tìm thấy video'); return; }
    const base = (userVolume != null) ? userVolume : (v.muted ? 0 : (v.volume || 0));
    const nv = Math.max(0, Math.min(1, Math.round((base + delta) * 10) / 10));
    userVolume = nv;
    userUnmuted = nv > 0;
    volApplied.add(v);
    watchVolume(v);
    setMutedSynced(v, nv === 0);
    volOwnChangeUntil = Date.now() + 900;
    try { if (nv > 0) v.volume = nv; } catch {}
    try { chrome.storage?.local?.set({ userVolume: nv, userUnmuted }); } catch {}
    toast((nv === 0 ? '🔇' : (nv < 0.5 ? '🔉' : '🔊')) + ' Âm lượng: ' + Math.round(nv * 100) + '%');
  }
  // Áp lựa chọn âm lượng cho MỖI thẻ video mới (FB/TikTok tạo thẻ mới khi lướt clip).
  // Chỉ áp 1 lần mỗi thẻ; đồng bộ luôn trạng thái mute với nút loa của trang.
  function enforceVolume() {
    if (userVolume == null && userUnmuted == null) return;
    const v = getActiveVideo();
    if (!v || volApplied.has(v)) return;
    volApplied.add(v);
    watchVolume(v);
    if (userUnmuted === true && v.muted) setMutedSynced(v, false);
    else if (userUnmuted === false && !v.muted) setMutedSynced(v, true);
    if (userVolume != null && userVolume > 0) { volOwnChangeUntil = Date.now() + 900; try { v.volume = userVolume; } catch {} }
  }

  // ---------- loop ----------
  function toggleLoop() {
    const v = getActiveVideo();
    window.__anLoopHold = !window.__anLoopHold;
    try { if (v) v.loop = window.__anLoopHold; } catch {}
    if (window.__autoNextApi && window.__autoNextApi.setLoopHold) window.__autoNextApi.setLoopHold(window.__anLoopHold);
    toast(window.__anLoopHold ? 'Lặp lại clip: BẬT (tạm dừng tự chuyển)' : 'Lặp lại clip: TẮT');
    refreshHud();
  }

  // ---------- lặp đoạn A–B ----------
  // Bấm lần 1: đặt điểm A; lần 2: đặt điểm B và bắt đầu lặp đoạn đó;
  // lần 3: tắt. Khi đang lặp, auto-next tạm ngưng (dùng chung loop-hold).
  let abA = null, abB = null, abOn = false;
  function fmtTime(t) {
    t = Math.max(0, Math.floor(t || 0));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  function cycleAbLoop() {
    const v = getActiveVideo();
    if (!v) { toast('Không tìm thấy video'); return; }
    if (abOn) {
      abA = abB = null; abOn = false;
      window.__anLoopHold = false;
      if (window.__autoNextApi && window.__autoNextApi.setLoopHold) window.__autoNextApi.setLoopHold(false);
      toast('Lặp đoạn A–B: TẮT');
    } else if (abA === null) {
      abA = v.currentTime || 0;
      toast('Ⓐ Điểm A: ' + fmtTime(abA) + ' — tua tới chỗ muốn kết thúc rồi bấm lần nữa', 3000);
    } else {
      let b = v.currentTime || 0;
      if (b <= abA + 0.4) b = Math.min(isFinite(v.duration) && v.duration > 0 ? v.duration : abA + 1, abA + 1);
      if (b <= abA) { abA = v.currentTime || 0; toast('Ⓐ Điểm A: ' + fmtTime(abA)); refreshHud(); return; }
      abB = b; abOn = true;
      window.__anLoopHold = true;
      if (window.__autoNextApi && window.__autoNextApi.setLoopHold) window.__autoNextApi.setLoopHold(true);
      try { if (v.currentTime > abB || v.currentTime < abA) v.currentTime = abA; } catch {}
      toast('🔁 Lặp đoạn ' + fmtTime(abA) + ' → ' + fmtTime(abB) + ' — bấm AB lần nữa để tắt', 3200);
    }
    refreshHud();
  }
  // Vòng kiểm tra riêng 200ms cho mượt (main loop 800ms là quá thưa).
  setInterval(() => {
    if (!abOn || abA === null || abB === null) return;
    const v = getActiveVideo();
    if (!v) return;
    try {
      if (v.ended || v.currentTime >= abB - 0.05 || v.currentTime < abA - 1) {
        v.currentTime = abA;
        if (v.ended || v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      }
    } catch {}
  }, 200);

  // ---------- next ----------
  function nextVideo() {
    if (window.__autoNextApi && window.__autoNextApi.next) { window.__autoNextApi.next(); toast('Chuyển clip'); }
    else toast('Chưa sẵn sàng');
  }

  // ---------- điều khiển bằng phím media / tai nghe ----------
  // Nút "bài kế tiếp" trên tai nghe / phím media (⏭) => chuyển clip; nút "bài
  // trước" (⏮) => phát lại clip hiện tại từ đầu. Các trang (YouTube/TikTok)
  // hay tự ghi đè handler nên main loop khẳng định lại định kỳ. Play/pause
  // vẫn để nguyên cho trang xử lý.
  function assertMediaKeys() {
    try {
      const ms = navigator.mediaSession;
      if (!ms || !ms.setActionHandler) return;
      ms.setActionHandler('nexttrack', () => { nextVideo(); });
      ms.setActionHandler('previoustrack', () => {
        const v = getActiveVideo();
        if (!v) return;
        try {
          v.currentTime = 0;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } catch {}
        toast('⏮ Phát lại từ đầu');
      });
    } catch {}
  }

  // ---------- copy link sạch ----------
  // Sao chép URL clip hiện tại đã bỏ hết query/hash (tham số theo dõi).
  async function copyCleanLink() {
    const clean = location.origin + location.pathname;
    let ok = false;
    try { await navigator.clipboard.writeText(clean); ok = true; } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = clean;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.documentElement.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {}
    }
    toast(ok ? '🔗 Đã sao chép link sạch (bỏ tham số theo dõi)' : 'Không sao chép được link', 2600);
  }

  // ---------- background play ----------
  // Delegated to the service worker, which injects a MAIN-world override of
  // document.visibilityState/hidden. The page believes it stays visible while
  // our own content scripts keep seeing the real visibility state.
  let bgLast = null;
  function applyBackgroundPlay(on) {
    on = !!on;
    if (bgLast === on) return;
    bgLast = on;
    try {
      chrome.runtime?.sendMessage?.({ type: 'AUTONEXT_BGPLAY', on }, () => void chrome.runtime.lastError);
    } catch {}
  }

  // ---------- HUD (top frame only) ----------
  const HUD_CSS = ":host{ all:initial; } *{ box-sizing:border-box; font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; } .bar{ display:flex; align-items:center; gap:6px; padding:7px 9px; background:linear-gradient(135deg,#7C3AED,#EC4899,#FB923C); border-radius:999px; box-shadow:0 10px 30px rgba(0,0,0,.35); } .handle{ cursor:grab; color:rgba(255,255,255,.9); font-size:16px; padding:0 2px; user-select:none; touch-action:none; } .bar button{ position:relative; width:34px; height:34px; border:none; border-radius:50%; background:rgba(255,255,255,.16); color:#fff; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s ease, transform .1s ease; } .bar button:hover{ background:rgba(255,255,255,.34); } .bar button:active{ transform:scale(.92); } .bar button.active{ background:#fff; color:#EC4899; } .bar button svg{ width:16px; height:16px; display:block; pointer-events:none; } .dot svg{ width:14px; height:14px; display:block; pointer-events:none; } [data-act=fav].active svg path{ fill:currentColor; } [data-act=min] .ic-plus{ display:none; } .wrap.mini [data-act=min] .ic-min{ display:none; } .wrap.mini [data-act=min] .ic-plus{ display:block; } [data-act=vol]{ padding:0; overflow:hidden; } [data-act=vol] .vh{ flex:1 1 50%; align-self:stretch; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; line-height:1; user-select:none; } [data-act=vol] .vh:hover{ background:rgba(255,255,255,.28); } [data-act=vol] .vsep{ width:1px; align-self:stretch; margin:8px 0; background:rgba(255,255,255,.45); } [data-act=speed]{ width:auto !important; padding:0 10px; border-radius:17px !important; font-weight:700; font-size:13px; } .bulk-count{ position:absolute; top:-4px; right:-4px; background:#111; color:#fff; font-size:10px; font-weight:700; min-width:15px; height:15px; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:0 3px; } .panel{ display:none; flex-direction:column; margin-top:8px; width:320px; max-height:340px; background:#14161b; color:#e7e9ee; border-radius:12px; box-shadow:0 14px 40px rgba(0,0,0,.45); overflow:hidden; } .phead{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#1b1e25; font-size:13px; } .phead .x{ border:none; background:transparent; color:#9aa1ad; cursor:pointer; font-size:14px; } .list{ overflow:auto; padding:6px; flex:1; } .list .row{ display:flex; align-items:center; gap:8px; padding:6px; border-radius:8px; } .list .row:hover{ background:#1b1e25; } .list .ix{ color:#6c7482; font-size:11px; width:16px; } .list .ttl{ flex:1; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .list .mini{ border:none; background:#2b2f3a; color:#fff; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; } .empty{ color:#8a91a0; font-size:12px; text-align:center; padding:20px 10px; line-height:1.5; } .pfoot{ display:flex; gap:8px; padding:10px; background:#1b1e25; } .big{ flex:1; border:none; border-radius:8px; padding:9px; background:linear-gradient(135deg,#7C3AED,#EC4899); color:#fff; font-weight:700; cursor:pointer; } .ghost{ border:1px solid #2b2f3a; background:transparent; color:#9aa1ad; border-radius:8px; padding:9px 10px; cursor:pointer; } .ghost.active{ background:#EC4899; color:#fff; border-color:#EC4899; } .tabs{ display:flex; gap:4px; } .tab{ border:none; background:transparent; color:#9aa1ad; font-size:12px; font-weight:700; cursor:pointer; padding:4px 8px; border-radius:6px; } .tab.active{ background:#2b2f3a; color:#fff; } .ttl.link{ cursor:pointer; } .ttl.link:hover{ text-decoration:underline; } .dot{ display:none; width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#7C3AED,#EC4899); box-shadow:0 8px 22px rgba(0,0,0,.35); cursor:pointer; align-items:center; justify-content:center; color:#fff; font-size:11px; user-select:none; } .wrap.mini .bar{ display:none; } .wrap.mini .panel{ display:none !important; } .wrap.mini .dot{ display:flex; } .wrap.mini.peek .bar{ display:flex; } .wrap.mini.peek .dot{ display:none; } .col{ flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; overflow:hidden; } .note{ font-size:10px; color:#8a91a0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .psearch{ padding:8px 10px 0; background:#14161b; display:flex; gap:6px; } .psearch input{ flex:1; min-width:0; border:1px solid #2b2f3a; background:#0f1116; color:#e7e9ee; border-radius:8px; padding:7px 9px; font-size:12px; outline:none; } .kwin{ flex:1; min-width:0; border:1px solid #2b2f3a; background:#0f1116; color:#e7e9ee; border-radius:8px; padding:8px 9px; font-size:12px; outline:none; } .fsel{ max-width:46%; border:1px solid #2b2f3a; background:#0f1116; color:#e7e9ee; border-radius:8px; padding:7px 6px; font-size:12px; outline:none; } [data-act=ab]{ width:auto !important; padding:0 9px; border-radius:17px !important; font-weight:700; font-size:12px; letter-spacing:.5px; } .list .row[draggable=true]{ cursor:grab; } .list .row.dragging{ opacity:.45; } .list .row.dragover{ box-shadow:inset 0 2px 0 #EC4899; } .list .ck{ width:14px; height:14px; accent-color:#EC4899; cursor:pointer; flex:0 0 auto; } .wrap.vert{ display:flex; align-items:flex-start; gap:8px; } .wrap.vert.edge-right{ flex-direction:row-reverse; } .wrap.vert .panel{ margin-top:0; } .wrap.vert .bar{ flex-direction:column; padding:9px 7px; } .wrap.vert .handle{ padding:2px 0; } .wrap.vert [data-act=speed]{ width:34px !important; padding:0; border-radius:50% !important; } .wrap.vert [data-act=ab]{ width:34px !important; padding:0; border-radius:50% !important; } .wrap.vert [data-act=vol]{ flex-direction:column-reverse; height:52px; border-radius:17px; } .wrap.vert [data-act=vol] .vh{ width:100%; flex:1 1 50%; } .wrap.vert [data-act=vol] .vsep{ width:auto; height:1px; margin:0 8px; align-self:stretch; } .list .grp{ display:flex; align-items:center; gap:8px; padding:7px 6px 3px; font-size:11px; font-weight:700; color:#9aa1ad; } .list .grp .cnt{ color:#6c7482; font-weight:400; }";
  const HUD_HTML = "<div class='dot' title='Mở lại thanh điều khiển'><svg viewBox='0 0 24 24' fill='currentColor'><rect x='4' y='4' width='7' height='7' rx='1.6'/><rect x='13' y='4' width='7' height='7' rx='1.6'/><rect x='4' y='13' width='7' height='7' rx='1.6'/><rect x='13' y='13' width='7' height='7' rx='1.6'/></svg></div><div class='bar'><div class='handle' title='Kéo để di chuyển'>\u283F</div><button data-act='next' title='Clip tiếp theo (Alt+N)'><svg viewBox='0 0 24 24' fill='currentColor'><path d='M5.2 5.3v13.4c0 .9 1 1.4 1.7.9l9.4-6.7c.6-.4.6-1.4 0-1.8L6.9 4.4c-.7-.5-1.7 0-1.7.9z'/><rect x='17.2' y='4.8' width='2.4' height='14.4' rx='1.2'/></svg></button><button data-act='download' title='Tải video (Alt+D)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'><path d='M12 4.2v9.6'/><path d='M7.8 10l4.2 4.2L16.2 10'/><path d='M4.8 19.4h14.4'/></svg></button><button data-act='copy' title='Sao chép link sạch (Alt+C)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M10.4 13.6a4.4 4.4 0 006.2 0l2.6-2.6a4.4 4.4 0 00-6.2-6.2l-1.3 1.3'/><path d='M13.6 10.4a4.4 4.4 0 00-6.2 0l-2.6 2.6a4.4 4.4 0 006.2 6.2l1.3-1.3'/></svg></button><button data-act='fav' title='Yêu thích (Alt+F)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linejoin='round'><path d='M12 3.7l2.7 5.4 5.9.8-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2 5.9-.8z'/></svg></button><button data-act='pip' title='Phát nổi PiP (Alt+P)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3.2' y='5' width='17.6' height='14' rx='2.2'/><rect x='11.6' y='11.4' width='6.4' height='4.4' rx='1' fill='currentColor' stroke='none'/></svg></button><button data-act='loop' title='Lặp lại clip (Alt+L)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'><path d='M4.9 12a7.1 7.1 0 0112.1-5l2.1 1.9'/><path d='M19.1 4.7v4.2h-4.2'/><path d='M19.1 12a7.1 7.1 0 01-12.1 5l-2.1-1.9'/><path d='M4.9 19.3v-4.2h4.2'/></svg></button><button data-act='ab' title='Lặp đoạn A–B (Alt+A)'>AB</button><button data-act='marathon' title='Marathon tác giả (Alt+M)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9'><circle cx='12' cy='12' r='8.3'/><circle cx='12' cy='12' r='4.6'/><circle cx='12' cy='12' r='1.5' fill='currentColor' stroke='none'/></svg></button><button data-act='block' title='Chặn tác giả này (Alt+X)'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.1'><circle cx='12' cy='12' r='8.3'/><path d='M6.3 6.3l11.4 11.4'/></svg></button><button data-act='speed' title='Tốc độ phát (Alt+S)'><span class='lbl'>1x</span></button><button data-act='vol' title='Âm lượng — nửa trái: giảm, nửa phải: tăng'><span class='vh' data-vol='down'>\u2212</span><span class='vsep'></span><span class='vh' data-vol='up'>+</span></button><button data-act='bulk' title='Danh sách tải & yêu thích (Alt+B)'><svg viewBox='0 0 24 24' fill='currentColor'><rect x='4' y='4' width='7' height='7' rx='1.6'/><rect x='13' y='4' width='7' height='7' rx='1.6'/><rect x='4' y='13' width='7' height='7' rx='1.6'/><rect x='13' y='13' width='7' height='7' rx='1.6'/></svg><span class='bulk-count'>0</span></button><button data-act='min' title='Thu nhỏ thành nút tròn (di chuột vào để mở tạm)'><svg class='ic-min' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.3' stroke-linecap='round'><path d='M5.5 12h13'/></svg><svg class='ic-plus' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.3' stroke-linecap='round'><path d='M12 5.5v13'/><path d='M5.5 12h13'/></svg></button></div><div class='panel'><div class='phead'><div class='tabs'><button data-tab='bulk' class='tab active'>Danh sách tải</button><button data-tab='fav' class='tab'>\u2B50 Yêu thích</button><button data-tab='block' class='tab'>\uD83D\uDEAB Chặn mềm</button><button data-tab='fbblock' class='tab' style='color:#60a5fa;'>\uD83D\uDD12 Chặn trên FB</button></div><button data-act='close' class='x'>\u2715</button></div><div class='psearch' style='display:none'><select class='fsel' title='Lọc theo thư mục'></select><input placeholder='Tìm theo tên hoặc ghi chú…'></div><div class='list'></div><div class='pfoot' data-foot='bulk'><button data-act='dlall' class='big'>\u2B73 Tải tất cả</button><button data-act='clear' class='ghost'>Xoá danh sách</button></div><div class='pfoot' data-foot='fav' style='display:none'><button data-act='favplay' class='big'>\u25B6 Phát tất cả</button><button data-act='favshuffle' class='ghost' title='Phát ngẫu nhiên (trộn thứ tự)'>\uD83D\uDD00</button><button data-act='favloop' class='ghost' title='Lặp vòng danh sách (phát hết tự quay lại đầu)'>\uD83D\uDD01</button><button data-act='favexport' class='ghost' title='Xuất file JSON'>\u2B73</button><button data-act='favimport' class='ghost' title='Nhập từ file JSON'>\u2B71</button><button data-act='favclear' class='ghost' title='Xoá hết danh sách'>\u2715</button></div><div class='pfoot' data-foot='block' style='display:none'><input class='kwin' placeholder='Chặn từ khóa…' style='flex:1;min-width:0'><button data-act='kwadd' class='mini' style='padding:8px 10px'>Thêm</button><button data-act='blockunsel' class='mini' style='padding:8px 10px;background:#dc2626;color:#fff;font-weight:700;display:none' title='Bỏ chặn các mục đã chọn'>Bỏ chọn</button><button data-act='blockexport' class='ghost' title='Xuất danh sách chặn (JSON)'>\u2B73</button><button data-act='blockimport' class='ghost' title='Nhập danh sách chặn từ file JSON'>\u2B71</button><button data-act='blocksync' class='ghost' title='Đồng bộ danh sách chặn từ xa (URL)'>\uD83D\uDD04</button><button data-act='blockfbpage' class='ghost' title='Mở trang cài đặt chặn của Facebook'>\uD83D\uDD17</button><button data-act='blockclear' class='ghost' title='Bỏ chặn tất cả (tác giả + từ khóa)'>\u2715</button></div><div class='pfoot' data-foot='fbblock' style='display:none'><input class='fbin' placeholder='Tìm kiếm Trang/User đã chặn trên FB…' style='flex:1;min-width:0'><button data-act='fbblocksync' class='mini' style='padding:8px 12px;background:#2563eb;color:#fff;font-weight:700' title='Đồng bộ lại danh sách từ Facebook'>\uD83D\uDD04 Đồng bộ FB</button><button data-act='blockfbpage' class='ghost' title='Mở cài đặt chặn Facebook'>\uD83D\uDD17</button></div></div>";

  let hudRoot = null, shadow = null, els = {}, panelOpen = false;
  let activeTab = 'bulk';
  function buildHud() {
    if (hudRoot || !isTop) return;
    hudRoot = document.createElement('div');
    hudRoot.style.cssText = 'position:fixed;z-index:2147483647;';
    shadow = hudRoot.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = HUD_CSS;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = HUD_HTML;
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.documentElement.appendChild(hudRoot);

    els.speed = shadow.querySelector('[data-act=speed] .lbl');
    els.loopBtn = shadow.querySelector('[data-act=loop]');
    els.favBtn = shadow.querySelector('[data-act=fav]');
    els.marBtn = shadow.querySelector('[data-act=marathon]');
    els.panel = shadow.querySelector('.panel');
    els.list = shadow.querySelector('.list');
    els.count = shadow.querySelector('.bulk-count');
    els.footBulk = shadow.querySelector('[data-foot=bulk]');
    els.footFav = shadow.querySelector('[data-foot=fav]');
    els.tabs = shadow.querySelectorAll('.tab');
    els.wrap = wrap;
    els.minBtn = shadow.querySelector('[data-act=min]');
    els.favPlayBtn = shadow.querySelector('[data-act=favplay]');
    els.favLoopBtn = shadow.querySelector('[data-act=favloop]');
    els.dot = shadow.querySelector('.dot');
    if (els.dot) els.dot.addEventListener('click', () => setHudMini(false));
    els.blockBtn = shadow.querySelector('[data-act=block]');
    if (els.blockBtn) {
      els.blockBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isFacebook) hardBlockFacebookPage(false);
        else toggleBlockAuthor();
      });
    }
    els.footBlock = shadow.querySelector('[data-foot=block]');
    els.footFbBlock = shadow.querySelector('[data-foot=fbblock]');
    els.fbInput = shadow.querySelector('.fbin');
    if (els.fbInput) {
      els.fbInput.addEventListener('keydown', (e) => e.stopPropagation());
      els.fbInput.addEventListener('input', () => {
        fbBlockSearchQ = els.fbInput.value || '';
        if (activeTab === 'fbblock') renderFbBlock();
      });
    }
    els.searchWrap = shadow.querySelector('.psearch');
    els.favSearch = shadow.querySelector('.psearch input');
    if (els.favSearch) {
      // Không cho phím gõ trong ô tìm kiếm lọt ra trang (site bắt phím mũi tên…).
      els.favSearch.addEventListener('keydown', (e) => e.stopPropagation());
      els.favSearch.addEventListener('input', () => {
        favSearchQ = els.favSearch.value || '';
        if (activeTab === 'fav') renderFav();
      });
    }
    els.kwInput = shadow.querySelector('.kwin');
    if (els.kwInput) {
      els.kwInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { addBlockedKeyword(els.kwInput.value); els.kwInput.value = ''; }
      });
    }
    els.abBtn = shadow.querySelector('[data-act=ab]');
    els.favFolder = shadow.querySelector('.fsel');
    if (els.favFolder) {
      els.favFolder.addEventListener('keydown', (e) => e.stopPropagation());
      els.favFolder.addEventListener('change', () => {
        favFolderQ = els.favFolder.value || '';
        if (activeTab === 'fav') renderFav();
      });
    }

    shadow.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const a = btn.getAttribute('data-act');
        if (a === 'next') nextVideo();
        else if (a === 'download') downloadCurrent();
        else if (a === 'pip') togglePiP();
        else if (a === 'loop') toggleLoop();
        else if (a === 'speed') cycleSpeed(1);
        else if (a === 'vol') { const h = e && e.target && e.target.closest ? e.target.closest('.vh') : null; adjustVolume(h && h.getAttribute('data-vol') === 'down' ? -0.1 : 0.1); }
        else if (a === 'bulk') toggleBulkPanel();
        else if (a === 'fav') toggleFavorite();
        else if (a === 'marathon') toggleMarathon();
        else if (a === 'close') toggleBulkPanel(false);
        else if (a === 'dlall') downloadAllCollected();
        else if (a === 'clear') { collected.clear(); bulkSel.clear(); renderBulk(); updateBulkCount(); }
        else if (a === 'favexport') exportFavorites();
        else if (a === 'favimport') importFavorites();
        else if (a === 'favplay') { if (favQueue && favQueue.active) stopFavPlayback(); else startFavPlayback(); }
        else if (a === 'min') setHudMini(!hudMini);
        else if (a === 'block') {
          if (isFacebook) showBlockMenuFacebook();
          else toggleBlockAuthor();
        }
        else if (a === 'copy') copyCleanLink();
        else if (a === 'ab') cycleAbLoop();
        else if (a === 'favshuffle') { if (favQueue && favQueue.active) stopFavPlayback(true); startFavPlayback(true); }
        else if (a === 'favloop') toggleFavLoop();
        else if (a === 'kwadd') { if (els.kwInput) { addBlockedKeyword(els.kwInput.value); els.kwInput.value = ''; } }
        else if (a === 'blockunsel') unblockSelected();
        else if (a === 'blockexport') exportBlocklist();
        else if (a === 'blockimport') importBlocklist();
        else if (a === 'blocksync') syncRemoteBlocklist(true);
        else if (a === 'fbblocksync') syncFbBlockedAccounts(true);
        else if (a === 'blockfbpage') window.open('https://www.facebook.com/settings?tab=blocking', '_blank');
        else if (a === 'blockclear') { blockedAuthors = []; blockedKeywords = []; saveBlocked(); renderPanel(); refreshHud(); }
        else if (a === 'favclear') { favorites = []; favIdsSync = new Set(); saveFavorites(); renderPanel(); refreshHud(); }
      });
    });

    shadow.querySelectorAll('[data-tab]').forEach((tb) => {
      tb.addEventListener('click', () => setTab(tb.getAttribute('data-tab')));
    });

    makeDraggable(shadow.querySelector('.handle'), hudRoot);

    if (hudMini) setHudMini(true);
    if (settings.hudPos && typeof settings.hudPos.left === 'number') applyHudPos();
    else { hudRoot.style.right = '18px'; hudRoot.style.bottom = '104px'; }
    // Mở tạm khi di chuột vào nút tròn (điều khiển bằng JS để giữ nguyên TÂM, không bị lệch)
    els.wrap.addEventListener('mouseenter', () => { if (hudMini) setHudPeek(true); });
    els.wrap.addEventListener('mouseleave', () => { if (hudMini) setHudPeek(false); });
    refreshHud();
  }
  function refreshHud() {
    const show = isTop && settings.hud !== false && !settings.liteMode && siteEnabled() && pageRelevant();
    if (show) { buildHud(); if (hudRoot) hudRoot.style.display = 'block'; }
    else if (hudRoot) { hudRoot.style.display = 'none'; }
    if (els.speed) els.speed.textContent = (settings.playbackRate || 1) + 'x';
    if (els.loopBtn) els.loopBtn.classList.toggle('active', !!window.__anLoopHold);
    if (els.abBtn) {
      els.abBtn.classList.toggle('active', abOn || abA !== null);
      els.abBtn.textContent = abOn ? 'A–B' : (abA !== null ? 'A…' : 'AB');
    }
    if (els.favBtn) {
      const fav = isFavorited();
      els.favBtn.classList.toggle('active', fav);
      els.favBtn.title = fav ? 'Bỏ yêu thích (Alt+F)' : 'Yêu thích (Alt+F)';
    }
    // Hiện số clip đã lưu ngay trên tab ⭐ để không phải đoán.
    if (els.tabs) els.tabs.forEach((tb) => {
      if (tb.getAttribute('data-tab') === 'fav') tb.textContent = '⭐ Yêu thích' + (favorites.length ? ' (' + favorites.length + ')' : '');
    });
    if (els.marBtn) els.marBtn.classList.toggle('active', !!(window.__anMarathon && window.__anMarathon.author));
    if (els.favPlayBtn) els.favPlayBtn.textContent = (favQueue && favQueue.active) ? '\u25A0 Dừng phát' : '\u25B6 Phát tất cả';
    if (els.favLoopBtn) { els.favLoopBtn.classList.toggle('active', favLoop); els.favLoopBtn.title = favLoop ? 'Lặp vòng danh sách: Đang bật' : 'Lặp vòng danh sách (phát hết tự quay lại đầu)'; }
    if (els.blockBtn) els.blockBtn.classList.toggle('active', currentAuthorBlocked());
    updateBulkCount();
  }
  function updateBulkCount() { if (els.count) els.count.textContent = String(collected.size); }
  let hudMini = false;
  // Điểm neo của HUD là TÂM TAY NẮM ⠿ (khi đang bung) hoặc TÂM NÚT TRÒN (khi
  // đang thu gọn). Thu gọn/bung ra đều giữ nguyên đúng chỗ tay nắm — nút tròn
  // nằm ngay vị trí 6 dấu chấm, KHÔNG phải giữa thanh.
  function anchorPoint() {
    const cands = [els.dot, els.wrap ? els.wrap.querySelector('.handle') : null];
    for (const el of cands) {
      if (!el) continue;
      const t = el.getBoundingClientRect();
      if (t.width > 0 && t.height > 0) return { x: t.left + t.width / 2, y: t.top + t.height / 2 };
    }
    const r = hudRoot ? hudRoot.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: r.left + 15, y: r.top + 15 };
  }
  function recenterHud(apply) {
    if (!hudRoot || !hudRoot.style.left) { apply(); return; }
    const a0 = anchorPoint();
    apply();
    const a1 = anchorPoint();
    const r = hudRoot.getBoundingClientRect();
    let nl = Math.round(r.left + (a0.x - a1.x));
    let nt = Math.round(r.top + (a0.y - a1.y));
    nl = Math.max(4, Math.min(window.innerWidth - Math.max(44, r.width) - 4, nl));
    nt = Math.max(4, Math.min(window.innerHeight - 44, nt));
    hudRoot.style.left = nl + 'px';
    hudRoot.style.top = nt + 'px';
    hudRoot.style.right = 'auto';
    hudRoot.style.bottom = 'auto';
  }
  // Đặt vị trí đã lưu theo ĐIỂM NEO (ax/ay = tâm tay nắm / nút tròn) nếu có.
  function applyHudPos() {
    const pos = settings.hudPos;
    if (!hudRoot || !pos || typeof pos.left !== 'number') return;
    hudRoot.style.left = Math.max(4, pos.left) + 'px';
    hudRoot.style.top = Math.max(4, Math.min(window.innerHeight - 44, pos.top)) + 'px';
    hudRoot.style.right = 'auto';
    hudRoot.style.bottom = 'auto';
    if (typeof pos.ax === 'number' && typeof pos.ay === 'number') {
      const a = anchorPoint();
      const r = hudRoot.getBoundingClientRect();
      let nl = Math.round(r.left + (pos.ax - a.x));
      let nt = Math.round(r.top + (pos.ay - a.y));
      nl = Math.max(4, Math.min(window.innerWidth - Math.max(44, r.width) - 4, nl));
      nt = Math.max(4, Math.min(window.innerHeight - 44, nt));
      hudRoot.style.left = nl + 'px';
      hudRoot.style.top = nt + 'px';
    }
    updateHudOrient();
  }
  // HUD xoay dọc khi neo sát mép trái/phải màn hình — đỡ che video hơn.
  function updateHudOrient() {
    if (!els.wrap || !hudRoot || !hudRoot.style.left) return;
    // Xét theo ĐIỂM NEO (tay nắm/nút tròn) để thu gọn/bung ra không làm đổi hướng.
    const a = anchorPoint();
    const vert = (a.x < 70) || (a.x > window.innerWidth - 70);
    const right = a.x > window.innerWidth / 2;
    if (els.wrap.classList.contains('vert') !== vert) {
      recenterHud(() => els.wrap.classList.toggle('vert', vert));
    }
    els.wrap.classList.toggle('edge-right', vert && right);
    const r1 = hudRoot.getBoundingClientRect();
    if (r1.bottom > window.innerHeight - 4) {
      hudRoot.style.top = Math.max(4, window.innerHeight - r1.height - 4) + 'px';
      hudRoot.style.bottom = 'auto';
    }
  }
  function setHudPeek(on) {
    recenterHud(() => { if (els.wrap) els.wrap.classList.toggle('peek', !!on); });
  }
  function setHudMini(on) {
    hudMini = !!on;
    recenterHud(() => {
      if (els.wrap) { els.wrap.classList.toggle('mini', hudMini); if (!hudMini) els.wrap.classList.remove('peek'); }
    });
    if (els.minBtn) els.minBtn.title = hudMini ? 'Ghim lại thanh điều khiển' : 'Thu nhỏ thành nút tròn (di chuột vào để mở tạm)';
    if (hudMini) { panelOpen = false; if (els.panel) els.panel.style.display = 'none'; }
    try { chrome.storage?.local?.set({ hudMini }); } catch {}
  }
  function toggleBulkPanel(force, tab) {
    panelOpen = (force == null) ? !panelOpen : !!force;
    if (els.panel) els.panel.style.display = panelOpen ? 'flex' : 'none';
    if (tab) setTab(tab);
    else if (panelOpen) renderPanel();
  }
  function setTab(t) {
    activeTab = (t === 'fav' || t === 'block' || t === 'fbblock') ? t : 'bulk';
    if (els.tabs) els.tabs.forEach((tb) => tb.classList.toggle('active', tb.getAttribute('data-tab') === activeTab));
    if (els.footBulk) els.footBulk.style.display = activeTab === 'bulk' ? 'flex' : 'none';
    if (els.footFav) els.footFav.style.display = activeTab === 'fav' ? 'flex' : 'none';
    if (els.footBlock) els.footBlock.style.display = activeTab === 'block' ? 'flex' : 'none';
    if (els.footFbBlock) els.footFbBlock.style.display = activeTab === 'fbblock' ? 'flex' : 'none';
    if (els.searchWrap) els.searchWrap.style.display = activeTab === 'fav' ? 'flex' : 'none';
    renderPanel();
    if (activeTab === 'fbblock' && !fbBlockedAccounts.length) syncFbBlockedAccounts(false);
  }
  function renderPanel() {
    if (activeTab === 'fav') renderFav();
    else if (activeTab === 'block') renderBlock();
    else if (activeTab === 'fbblock') renderFbBlock();
    else renderBulk();
  }
  function renderBulk() {
    if (!els.list) return;
    // Dọn các lựa chọn không còn trong danh sách.
    for (const k of [...bulkSel]) if (!collected.has(k)) bulkSel.delete(k);
    const items = [...collected.entries()].sort((a, b) => b[1].ts - a[1].ts);
    els.list.textContent = '';
    const syncDlBtn = () => {
      const dlBtn = els.panel && els.panel.querySelector("[data-act='dlall']");
      if (dlBtn) dlBtn.textContent = bulkSel.size ? ('\u2B73 Tải ' + bulkSel.size + ' đã chọn') : '\u2B73 Tải tất cả';
    };
    syncDlBtn();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.append(
        'Chưa thu được link tải trực tiếp nào.',
        document.createElement('br'),
        'Hãy lướt qua vài clip để hệ thống thu thập, hoặc bấm nút Tải trên từng clip.'
      );
      els.list.appendChild(empty);
      return;
    }
    // Nhóm theo tác giả — tick ở đầu nhóm để chọn cả nhóm một lần.
    const groups = new Map();
    for (const en of items) {
      const g = ((en[1].author || '').trim()) || '__none__';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(en);
    }
    let idx = 0;
    for (const ge of groups) {
      const g = ge[0], arr = ge[1];
      if (g !== '__none__' || groups.size > 1) {
        const head = document.createElement('div');
        head.className = 'grp';
        const gck = document.createElement('input');
        gck.type = 'checkbox';
        gck.className = 'ck';
        gck.title = 'Chọn cả nhóm tác giả này';
        gck.checked = arr.every((en) => bulkSel.has(en[0]));
        gck.indeterminate = !gck.checked && arr.some((en) => bulkSel.has(en[0]));
        gck.addEventListener('change', () => {
          for (const en of arr) { if (gck.checked) bulkSel.add(en[0]); else bulkSel.delete(en[0]); }
          renderBulk();
        });
        const nm = document.createElement('span');
        nm.textContent = g === '__none__' ? 'Không rõ tác giả' : g;
        const cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = '· ' + arr.length + ' clip';
        head.append(gck, nm, cnt);
        els.list.appendChild(head);
      }
      for (const en of arr) {
        const i = idx++;
        const key = en[0], it = en[1];
        const row = document.createElement('div');
        row.className = 'row';
        const ck = document.createElement('input');
        ck.type = 'checkbox';
        ck.className = 'ck';
        ck.title = 'Chọn clip này để chỉ tải những clip đã chọn';
        ck.checked = bulkSel.has(key);
        ck.addEventListener('change', () => {
          if (ck.checked) bulkSel.add(key); else bulkSel.delete(key);
          renderBulk();
        });
        const ix = document.createElement('span');
        ix.className = 'ix';
        ix.textContent = String(i + 1);
        const ttl = document.createElement('span');
        ttl.className = 'ttl';
        ttl.textContent = (dlDone[key] ? '\u2713 ' : '') + (it.title || it.platform);
        if (dlDone[key]) ttl.title = 'Đã tải trước đó';
        const btn = document.createElement('button');
        btn.className = 'mini';
        btn.textContent = 'Tải';
        btn.addEventListener('click', async () => {
          btn.textContent = '…';
          let ok = false;
          const got = await fetchVerifiedBlob(it.url);
          if (got) {
            const h = await checkBlobHealth(got.objectUrl, it.dur || 0);
            if (h.ok) {
              anchorDownload(got.objectUrl, buildFileName(it, i + 1).split('/').pop());
              setTimeout(() => URL.revokeObjectURL(got.objectUrl), 30000);
              ok = true;
            } else { try { URL.revokeObjectURL(got.objectUrl); } catch {} }
          }
          if (!ok) ok = await downloadUrl(it.url, buildFileName(it, i + 1));
          if (ok) markDownloaded(key);
          btn.textContent = ok ? '\u2713' : '\u2717';
        });
        row.append(ck, ix, ttl, btn);
        els.list.appendChild(row);
      }
    }
  }
  let favSearchQ = '';
  let favFolderQ = '';
  let dragFavId = null;
  function renderFav() {
    if (!els.list) return;
    els.list.textContent = '';
    // Cập nhật ô lọc thư mục từ danh sách hiện có.
    if (els.favFolder) {
      const folders = [...new Set(favorites.map((f) => f.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      if (favFolderQ && !folders.includes(favFolderQ)) favFolderQ = '';
      els.favFolder.textContent = '';
      const all = document.createElement('option');
      all.value = '';
      all.textContent = '📁 Tất cả (' + favorites.length + ')';
      els.favFolder.appendChild(all);
      folders.forEach((fd) => {
        const op = document.createElement('option');
        op.value = fd;
        op.textContent = '📁 ' + fd;
        els.favFolder.appendChild(op);
      });
      els.favFolder.value = favFolderQ;
    }
    const q = favSearchQ.trim().toLowerCase();
    // Hiển thị theo thứ tự mảng đảo ngược (mới nhất trước); kéo-thả để đổi chỗ.
    let items = [...favorites].reverse();
    if (favFolderQ) items = items.filter((it) => (it.folder || '') === favFolderQ);
    if (q) items = items.filter((it) => ((it.title || '') + ' ' + (it.note || '') + ' ' + (it.folder || '') + ' ' + (it.platform || '')).toLowerCase().includes(q));
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      if (q || favFolderQ) {
        empty.textContent = favFolderQ && !q ? 'Thư mục này chưa có clip nào.' : 'Không có clip nào khớp bộ lọc.';
      } else {
        empty.append(
          'Chưa có clip yêu thích nào.',
          document.createElement('br'),
          'Bấm nút \u2606 trên thanh điều khiển (hoặc Alt+Shift+F) để lưu clip đang xem.'
        );
      }
      els.list.appendChild(empty);
      return;
    }
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      // Kéo-thả để sắp xếp lại thứ tự yêu thích.
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        dragFavId = it.id;
        row.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; } catch {}
      });
      row.addEventListener('dragend', () => { dragFavId = null; row.classList.remove('dragging'); });
      row.addEventListener('dragover', (e) => {
        if (!dragFavId || dragFavId === it.id) return;
        e.preventDefault();
        row.classList.add('dragover');
        try { e.dataTransfer.dropEffect = 'move'; } catch {}
      });
      row.addEventListener('dragleave', () => row.classList.remove('dragover'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('dragover');
        if (!dragFavId || dragFavId === it.id) return;
        const fromI = favorites.findIndex((f) => f.id === dragFavId);
        dragFavId = null;
        if (fromI < 0) return;
        const [moved] = favorites.splice(fromI, 1);
        const ti = favorites.findIndex((f) => f.id === it.id);
        if (ti < 0) { favorites.splice(fromI, 0, moved); return; }
        // Danh sách hiển thị là mảng đảo ngược nên "phía trên" = sau trong mảng.
        const r = row.getBoundingClientRect();
        const dropAbove = (e.clientY - r.top) < r.height / 2;
        favorites.splice(dropAbove ? ti + 1 : ti, 0, moved);
        saveFavorites();
        renderFav();
      });
      const ix = document.createElement('span');
      ix.className = 'ix';
      ix.textContent = String(i + 1);
      ix.title = 'Kéo hàng này để sắp xếp thứ tự';
      const col = document.createElement('div');
      col.className = 'col';
      const ttl = document.createElement('span');
      ttl.className = 'ttl link';
      ttl.textContent = it.title || it.platform;
      ttl.title = 'Mở lại clip này';
      ttl.addEventListener('click', () => { try { window.open(it.page, '_blank'); } catch {} });
      col.appendChild(ttl);
      if (it.note || it.folder) {
        const nt = document.createElement('span');
        nt.className = 'note';
        nt.textContent = (it.folder ? '📁 ' + it.folder + (it.note ? ' · ' : '') : '') + (it.note || '');
        nt.title = nt.textContent;
        col.appendChild(nt);
      }
      const fdBtn = document.createElement('button');
      fdBtn.className = 'mini';
      fdBtn.textContent = '📁';
      fdBtn.title = it.folder ? ('Thư mục: ' + it.folder + ' — bấm để đổi') : 'Xếp vào thư mục';
      fdBtn.addEventListener('click', () => {
        const n = prompt('Tên thư mục cho clip này (bỏ trống để đưa ra ngoài thư mục):', it.folder || '');
        if (n === null) return;
        const f = favorites.find((x) => x.id === it.id);
        if (f) {
          const val = n.trim().slice(0, 30);
          if (val) f.folder = val; else delete f.folder;
        }
        saveFavorites();
        renderFav();
      });
      const noteBtn = document.createElement('button');
      noteBtn.className = 'mini';
      noteBtn.textContent = '\uD83D\uDCDD';
      noteBtn.title = it.note ? 'Sửa ghi chú' : 'Thêm ghi chú';
      noteBtn.addEventListener('click', () => {
        const n = prompt('Ghi chú cho clip này:', it.note || '');
        if (n === null) return;
        const f = favorites.find((x) => x.id === it.id);
        if (f) {
          const val = n.trim().slice(0, 200);
          if (val) f.note = val; else delete f.note;
        }
        saveFavorites();
        renderFav();
      });
      const del = document.createElement('button');
      del.className = 'mini';
      del.textContent = '\u2715';
      del.title = 'Xoá khỏi Yêu thích';
      del.addEventListener('click', () => {
        favorites = favorites.filter((f) => f.id !== it.id);
        favIdsSync.delete(it.id);
        saveFavorites();
        renderFav();
        refreshHud();
      });
      row.append(ix, col, fdBtn, noteBtn, del);
      els.list.appendChild(row);
    });
  }
  function unblockSelected() {
    if (!blockSel.size) return;
    if (!confirm('Bạn có chắc muốn bỏ chặn ' + blockSel.size + ' mục đã chọn không?')) return;
    blockedAuthors = blockedAuthors.filter((b) => !blockSel.has(b.key));
    blockedKeywords = blockedKeywords.filter((k) => !blockSel.has('kw:' + k));
    blockSel.clear();
    saveBlocked();
    renderBlock();
    refreshHud();
    toast('Đã bỏ chặn các mục đã chọn');
  }

  function exportBlocklist() {
    if (!blockedAuthors.length && !blockedKeywords.length) {
      toast('Chưa có tác giả hay từ khóa nào trong danh sách chặn');
      return;
    }
    try {
      const data = {
        app: 'AutoNext',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        total: blockedAuthors.length + blockedKeywords.length,
        authors: blockedAuthors,
        keywords: blockedKeywords
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      anchorDownload(u, 'AutoNext_Blocklist_' + new Date().toISOString().slice(0, 10) + '.json');
      setTimeout(() => URL.revokeObjectURL(u), 15000);
      toast('Đã xuất danh sách chặn: ' + (blockedAuthors.length + blockedKeywords.length) + ' mục (JSON)');
    } catch {
      toast('Xuất danh sách thất bại');
    }
  }

  let blockFileInput = null;
  function importBlocklist() {
    if (!blockFileInput) {
      blockFileInput = document.createElement('input');
      blockFileInput.type = 'file';
      blockFileInput.accept = '.json,application/json';
      blockFileInput.style.display = 'none';
      document.documentElement.appendChild(blockFileInput);
      blockFileInput.addEventListener('change', () => {
        const f = blockFileInput.files && blockFileInput.files[0];
        blockFileInput.value = '';
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const data = JSON.parse(String(rd.result));
            let addedAuthors = 0;
            let addedKw = 0;

            const authorsArr = Array.isArray(data) ? data : (Array.isArray(data.authors) ? data.authors : []);
            for (const it of authorsArr) {
              if (!it || typeof it !== 'object') continue;
              const key = String(it.key || (authorKeyOf(it.author || '')));
              const author = String(it.author || key.slice(3) || '');
              if (!key || !author) continue;
              if (!blockedAuthors.some((b) => b.key === key)) {
                blockedAuthors.push({
                  key,
                  author,
                  platform: String(it.platform || platformOfKey(key)),
                  ts: Number(it.ts) || Date.now()
                });
                addedAuthors++;
              }
            }

            const kwArr = Array.isArray(data.keywords) ? data.keywords : [];
            for (const k of kwArr) {
              const cleanK = String(k || '').trim().toLowerCase().slice(0, 60);
              if (cleanK && !blockedKeywords.includes(cleanK)) {
                blockedKeywords.push(cleanK);
                addedKw++;
              }
            }

            saveBlocked();
            renderBlock();
            refreshHud();
            toast('Đã nạp thành công: +' + addedAuthors + ' tác giả, +' + addedKw + ' từ khóa mới!', 4000);
          } catch {
            toast('File không hợp lệ hoặc sai định dạng JSON');
          }
        };
        rd.readAsText(f);
      });
    }
    blockFileInput.click();
  }

  async function syncRemoteBlocklist(manual = false) {
    try {
      const stored = await chrome.storage.sync.get({ remoteBlocklistUrl: '' });
      let url = stored.remoteBlocklistUrl || '';
      if (!url) {
        if (!manual) return;
        const input = prompt('Nhập đường dẫn URL chứa danh sách chặn JSON (ví dụ link raw Gist/GitHub):', '');
        if (!input) return;
        url = input.trim();
        await chrome.storage.sync.set({ remoteBlocklistUrl: url });
      } else if (manual) {
        const choice = prompt('URL đồng bộ hiện tại:\n' + url + '\n\nBấm OK để đồng bộ ngay, hoặc dán URL mới (để trống nếu muốn hủy URL):', url);
        if (choice === null) return;
        const nextUrl = choice.trim();
        if (nextUrl !== url) {
          url = nextUrl;
          await chrome.storage.sync.set({ remoteBlocklistUrl: url });
          if (!url) {
            toast('Đã hủy liên kết URL đồng bộ online');
            return;
          }
        }
      }

      toast('Đang đồng bộ danh sách chặn online...');
      chrome.runtime.sendMessage({ type: 'AUTONEXT_FETCH_REMOTE_BLOCKLIST', url }, async (res) => {
        if (!res || !res.ok) {
          if (manual) toast('❌ Không thể tải: ' + (res?.error || 'Lỗi mạng'), 4000);
          return;
        }
        const data = res.data;
        if (!data || typeof data !== 'object') {
          if (manual) toast('❌ File từ URL không đúng định dạng JSON', 3500);
          return;
        }

        let addedAuthors = 0;
        let addedKw = 0;
        const authorsArr = Array.isArray(data) ? data : (Array.isArray(data.authors) ? data.authors : []);
        for (const it of authorsArr) {
          if (!it || typeof it !== 'object') continue;
          const key = String(it.key || (authorKeyOf(it.author || '')));
          const author = String(it.author || key.slice(3) || '');
          if (!key || !author) continue;
          if (!blockedAuthors.some((b) => b.key === key)) {
            blockedAuthors.push({
              key,
              author,
              platform: String(it.platform || platformOfKey(key)),
              ts: Number(it.ts) || Date.now()
            });
            addedAuthors++;
          }
        }

        const kwArr = Array.isArray(data.keywords) ? data.keywords : [];
        for (const k of kwArr) {
          const cleanK = String(k || '').trim().toLowerCase().slice(0, 60);
          if (cleanK && !blockedKeywords.includes(cleanK)) {
            blockedKeywords.push(cleanK);
            addedKw++;
          }
        }

        if (addedAuthors > 0 || addedKw > 0) {
          saveBlocked();
          renderBlock();
          refreshHud();
        }
        if (manual) {
          toast('✅ Đồng bộ online: +' + addedAuthors + ' tác giả, +' + addedKw + ' từ khóa mới!', 4000);
        }
      });
    } catch (err) {
      if (manual) toast('❌ Lỗi đồng bộ: ' + String(err), 3000);
    }
  }

  function renderBlock() {
    if (!els.list) return;
    els.list.textContent = '';
    const items = [...blockedAuthors].sort((a, b) => b.ts - a.ts);
    const totalCount = items.length + blockedKeywords.length;

    // Cập nhật nút Bỏ chặn đã chọn ở footer
    const unselBtn = shadow ? shadow.querySelector('[data-act=blockunsel]') : null;
    if (unselBtn) {
      if (blockSel.size > 0) {
        unselBtn.style.display = 'inline-block';
        unselBtn.textContent = 'Bỏ chọn (' + blockSel.size + ')';
      } else {
        unselBtn.style.display = 'none';
      }
    }

    if (!totalCount) {
      blockSel.clear();
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.append(
        'Chưa chặn tác giả hay từ khóa nào.',
        document.createElement('br'),
        'Bấm 🚫 (hoặc Alt+Shift+X) để chặn tác giả clip đang xem,',
        document.createElement('br'),
        'hoặc nhập từ khóa tiêu đề vào ô bên dưới.'
      );
      els.list.appendChild(empty);
      return;
    }

    // Header "Chọn tất cả"
    const headRow = document.createElement('div');
    headRow.className = 'row';
    headRow.style.cssText = 'background:rgba(255,255,255,0.05);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.12);padding:6px 8px;';
    const allCk = document.createElement('input');
    allCk.type = 'checkbox';
    allCk.style.marginRight = '8px';
    allCk.checked = totalCount > 0 && (blockSel.size === totalCount);
    allCk.indeterminate = blockSel.size > 0 && blockSel.size < totalCount;
    allCk.addEventListener('change', () => {
      if (allCk.checked) {
        blockedKeywords.forEach((k) => blockSel.add('kw:' + k));
        items.forEach((it) => blockSel.add(it.key));
      } else {
        blockSel.clear();
      }
      renderBlock();
    });
    const headLbl = document.createElement('span');
    headLbl.style.cssText = 'flex:1;font-size:12px;color:#9aa1ad;';
    headLbl.textContent = 'Chọn tất cả (' + totalCount + ' mục)';
    headRow.append(allCk, headLbl);
    els.list.appendChild(headRow);

    // Render Keywords
    blockedKeywords.forEach((kw, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      const ck = document.createElement('input');
      ck.type = 'checkbox';
      ck.style.marginRight = '8px';
      ck.checked = blockSel.has('kw:' + kw);
      ck.addEventListener('change', () => {
        if (ck.checked) blockSel.add('kw:' + kw);
        else blockSel.delete('kw:' + kw);
        renderBlock();
      });

      const ix = document.createElement('span');
      ix.className = 'ix';
      ix.textContent = String(i + 1);
      const col = document.createElement('div');
      col.className = 'col';
      const ttl = document.createElement('span');
      ttl.className = 'ttl';
      ttl.textContent = '“' + kw + '”';
      const nt = document.createElement('span');
      nt.className = 'note';
      nt.textContent = 'Từ khóa tiêu đề';
      col.append(ttl, nt);
      const un = document.createElement('button');
      un.className = 'mini';
      un.textContent = 'Bỏ chặn';
      un.addEventListener('click', () => {
        blockSel.delete('kw:' + kw);
        removeBlockedKeyword(kw);
      });
      row.append(ck, ix, col, un);
      els.list.appendChild(row);
    });

    // Render Authors
    const PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram', x: 'X (Twitter)', tiktok: 'TikTok', youtube: 'YouTube' };
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      const ck = document.createElement('input');
      ck.type = 'checkbox';
      ck.style.marginRight = '8px';
      ck.checked = blockSel.has(it.key);
      ck.addEventListener('change', () => {
        if (ck.checked) blockSel.add(it.key);
        else blockSel.delete(it.key);
        renderBlock();
      });

      const ix = document.createElement('span');
      ix.className = 'ix';
      ix.textContent = String(blockedKeywords.length + i + 1);
      const col = document.createElement('div');
      col.className = 'col';
      const ttl = document.createElement('span');
      ttl.className = 'ttl';
      ttl.textContent = it.author;
      const nt = document.createElement('span');
      nt.className = 'note';
      nt.textContent = PLATFORM_LABEL[it.platform] || it.platform || '';
      col.append(ttl, nt);
      const un = document.createElement('button');
      un.className = 'mini';
      un.textContent = 'Bỏ chặn';
      un.addEventListener('click', () => {
        blockSel.delete(it.key);
        blockedAuthors = blockedAuthors.filter((b) => b.key !== it.key);
        saveBlocked();
        renderBlock();
        refreshHud();
      });
      row.append(ck, ix, col, un);
      els.list.appendChild(row);
    });
  }

  // ---------- Quản lý danh sách chặn trên Facebook (Native Facebook Block Manager) ----------
  let fbBlockedAccounts = [];
  let fbBlockSearchQ = '';
  try {
    chrome.storage?.local?.get({ fbBlockedAccounts: [] }, (r) => {
      if (r && Array.isArray(r.fbBlockedAccounts)) fbBlockedAccounts = r.fbBlockedAccounts;
    });
  } catch {}

  function syncFbBlockedAccounts(manual = true) {
    if (manual) toast('Đang đồng bộ danh sách chặn từ Facebook...', 4000);
    chrome.runtime.sendMessage({ type: 'AUTONEXT_FB_SYNC_BLOCKS' }, (res) => {
      if (!res || !res.ok) {
        if (manual) toast('❌ Không thể đồng bộ: ' + (res?.error || 'Lỗi kết nối'), 4000);
        return;
      }
      fbBlockedAccounts = res.items || [];
      try {
        chrome.storage?.local?.set({ fbBlockedAccounts });
      } catch {}
      if (activeTab === 'fbblock') renderFbBlock();
      if (manual) toast('✅ Đã đồng bộ ' + fbBlockedAccounts.length + ' tài khoản từ Facebook!', 4000);
    });
  }

  function renderFbBlock() {
    if (!els.list) return;
    els.list.textContent = '';
    const q = fbBlockSearchQ.trim().toLowerCase();
    let items = [...fbBlockedAccounts];
    if (q) items = items.filter(it => (it.name || '').toLowerCase().includes(q) || (it.subtitle || '').toLowerCase().includes(q));

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      if (fbBlockedAccounts.length && q) {
        empty.textContent = 'Không tìm thấy tài khoản nào khớp với "' + q + '".';
      } else {
        empty.append(
          'Chưa có dữ liệu danh sách chặn từ Facebook.',
          document.createElement('br'),
          'Bấm nút 🔄 bên dưới để đồng bộ danh sách Trang/User bạn đang chặn trên Facebook.'
        );
      }
      els.list.appendChild(empty);
      return;
    }

    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'row';

      const ix = document.createElement('span');
      ix.className = 'ix';
      ix.textContent = String(i + 1);

      const col = document.createElement('div');
      col.className = 'col';
      const ttl = document.createElement('span');
      ttl.className = 'ttl';
      ttl.textContent = it.name;
      const nt = document.createElement('span');
      nt.className = 'note';
      nt.textContent = it.subtitle || 'Tài khoản Facebook';
      col.append(ttl, nt);

      const unBtn = document.createElement('button');
      unBtn.className = 'mini';
      unBtn.style.cssText = 'background:rgba(220,38,38,0.2);color:#ef4444;border:1px solid rgba(220,38,38,0.4);font-weight:600;padding:4px 8px;cursor:pointer;';
      unBtn.textContent = 'Bỏ chặn';
      unBtn.title = 'Bỏ chặn ' + it.name + ' trên tài khoản Facebook';
      unBtn.addEventListener('click', () => {
        if (!confirm('Bạn có chắc muốn BỎ CHẶN ' + it.name + ' trên tài khoản Facebook không?')) return;
        toast('Đang gửi lệnh bỏ chặn ' + it.name + ' lên Facebook...', 3500);
        chrome.runtime.sendMessage({ type: 'AUTONEXT_FB_UNBLOCK', name: it.name }, (res) => {
          if (res && res.ok) {
            fbBlockedAccounts = fbBlockedAccounts.filter(x => x.name !== it.name);
            try { chrome.storage?.local?.set({ fbBlockedAccounts }); } catch {}
            renderFbBlock();
            toast('✅ Đã bỏ chặn ' + it.name + ' trên Facebook!', 3500);
          } else {
            toast('❌ Lỗi khi bỏ chặn: ' + (res?.error || 'Không thực hiện được'), 4000);
          }
        });
      });

      row.append(ix, col, unBtn);
      els.list.appendChild(row);
    });
  }

  // ---------- tải hàng loạt thông minh ----------
  // Sổ ghi clip đã tải xong (chống tải trùng giữa các phiên).
  let dlDone = {};
  try { chrome.storage.local.get({ dlDone: {} }).then((st) => { if (st && st.dlDone && typeof st.dlDone === 'object') dlDone = st.dlDone; }); } catch {}
  function markDownloaded(key) {
    if (!key) return;
    dlDone[key] = Date.now();
    const ks = Object.keys(dlDone);
    if (ks.length > 500) ks.sort((a, b) => dlDone[a] - dlDone[b]).slice(0, ks.length - 500).forEach((k) => { delete dlDone[k]; });
    try { chrome.storage?.local?.set({ dlDone }); } catch {}
  }
  let bulkBusy = false;
  async function downloadAllCollected() {
    if (bulkBusy) { toast('Đang có phiên tải hàng loạt chạy — đợi xong đã nhé'); return; }
    let entries = [...collected.entries()];
    if (!entries.length) { toast('Chưa có link nào để tải'); return; }
    // Có clip được tick chọn → chỉ tải đúng những clip đó (kể cả đã tải trước đó).
    const useSel = bulkSel.size > 0;
    if (useSel) entries = entries.filter((en) => bulkSel.has(en[0]));
    const todo = useSel ? entries : entries.filter((en) => !dlDone[en[0]]);
    const skipped = useSel ? 0 : entries.length - todo.length;
    if (!todo.length) { toast('Cả ' + entries.length + ' clip đều đã tải trước đó — không tải trùng', 3200); return; }
    bulkBusy = true;
    alog('bulk', 'Bắt đầu tải ' + todo.length + ' clip' + (skipped ? ' (bỏ qua ' + skipped + ' đã tải)' : ''));
    let okN = 0, failN = 0;
    try {
      for (let i = 0; i < todo.length; i++) {
        const key = todo[i][0], it = todo[i][1];
        toast('⭳ Đang tải ' + (i + 1) + '/' + todo.length + '…');
        if (els.count) els.count.textContent = (i + 1) + '/' + todo.length;
        let ok = false;
        // Mỗi file thử tối đa 3 lượt: 2 lượt tải có kiểm chứng, lượt chót gửi thẳng.
        for (let at = 0; at < 3 && !ok; at++) {
          if (at) await sleep(900);
          if (at < 2) {
            const got = await fetchVerifiedBlob(it.url);
            if (got) {
              // Kiểm tra "sức khỏe" file: đọc thời lượng thật, file cụt → coi như lỗi để thử lại.
              const h = await checkBlobHealth(got.objectUrl, it.dur || 0);
              if (h.ok) {
                anchorDownload(got.objectUrl, buildFileName(it, i + 1).split('/').pop());
                setTimeout(() => URL.revokeObjectURL(got.objectUrl), 30000);
                ok = true;
              } else {
                try { URL.revokeObjectURL(got.objectUrl); } catch {}
                alog('dl', '⚠️ File cụt (' + (h.dur ? Math.round(h.dur) + 's' : 'lỗi đọc') + ') — thử lại lượt ' + (at + 2));
              }
            }
          } else {
            ok = await downloadUrl(it.url, buildFileName(it, i + 1));
          }
        }
        if (ok) { okN++; markDownloaded(key); alog('dl', '✅ ' + (i + 1) + '/' + todo.length + ': ' + (it.title || it.url).slice(0, 70)); }
        else { failN++; alog('dl', '❌ ' + (i + 1) + '/' + todo.length + ' lỗi: ' + (it.title || it.url).slice(0, 70)); }
        await sleep(500);
      }
    } finally {
      bulkBusy = false;
      bulkSel.clear();
      updateBulkCount();
      if (panelOpen && activeTab === 'bulk') renderBulk();
    }
    const sum = 'Hoàn tất: ✅ ' + okN + ' thành công' + (failN ? ' · ⚠️ ' + failN + ' lỗi' : '') + (skipped ? ' · ⏭ ' + skipped + ' đã có từ trước' : '');
    alog('bulk', sum);
    toast(sum, 4200);
  }
  function makeDraggable(handle, target) {
    if (!handle) return;
    let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
    handle.addEventListener('pointerdown', (e) => {
      drag = true;
      const r = target.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      target.style.left = ox + 'px'; target.style.top = oy + 'px';
      target.style.right = 'auto'; target.style.bottom = 'auto';
      try { handle.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      let nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      nx = Math.max(4, Math.min(window.innerWidth - 44, nx));
      ny = Math.max(4, Math.min(window.innerHeight - 44, ny));
      target.style.left = nx + 'px'; target.style.top = ny + 'px';
    });
    handle.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = false;
      updateHudOrient();
      const r = target.getBoundingClientRect();
      const ap = anchorPoint();
      settings.hudPos = { left: Math.round(r.left), top: Math.round(r.top), ax: Math.round(ap.x), ay: Math.round(ap.y) };
      try { chrome.storage?.local?.set({ [HUD_POS_KEY]: settings.hudPos }); } catch {}
    });
  }

  // ---------- keyboard shortcuts ----------
  function onKey(e) {
    if (!settings.shortcuts) return;
    if (!siteEnabled() || !pageRelevant()) return;
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const tag = ((t && t.tagName) || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    const k = (e.key || '').toLowerCase();
    let handled = true;
    if (k === 'd') downloadCurrent();
    else if (k === 'p') togglePiP();
    else if (k === 'l') toggleLoop();
    else if (k === 'n') nextVideo();
    else if (k === 'b') toggleBulkPanel();
    else if (k === 's') cycleSpeed(1);
    else if (k === 'f') toggleFavorite();
    else if (k === 'm') toggleMarathon();
    else if (k === 'x') toggleBlockAuthor();
    else if (k === 'c') copyCleanLink();
    else if (k === 'a') cycleAbLoop();
    else if (k === 'h') {
      settings.hud = !settings.hud;
      try { chrome.storage?.sync?.set({ hud: settings.hud }); } catch {}
      refreshHud();
      toast(settings.hud ? 'Hiện điều khiển nổi' : 'Ẩn điều khiển nổi');
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  document.addEventListener('keydown', onKey, true);

  // ---------- popup messages ----------
  try {
    chrome.runtime?.onMessage?.addListener((m, _s, resp) => {
      if (m && m.type === 'VIP_ACTION') {
        const a = m.action;
        if (a === 'download') downloadCurrent();
        else if (a === 'pip') togglePiP();
        else if (a === 'bulk') toggleBulkPanel(true);
        else if (a === 'favlist') { buildHud(); if (hudRoot) hudRoot.style.display = 'block'; toggleBulkPanel(true, 'fav'); }
        else if (a === 'fav') toggleFavorite();
        else if (a === 'next') nextVideo();
        else if (a === 'speed') cycleSpeed(1);
        try { resp && resp({ ok: true }); } catch {}
        return true;
      }
      return false;
    });
  } catch {}

  // ---------- main loop ----------
  setInterval(() => {
    if (!siteEnabled() || !pageRelevant()) {
      if (hudRoot && hudRoot.style.display !== 'none') hudRoot.style.display = 'none';
      return;
    }
    // Chế độ siêu nhẹ: tắt mọi việc phụ (HUD, thu thập link, chuẩn hoá âm lượng…),
    // chỉ giữ lõi tự chuyển clip + Phát nền + phím tắt + auto-PiP.
    if (settings.liteMode) {
      if (document.hidden) tryAutoPip(); else exitAutoPip();
      return;
    }
    // Tiết kiệm CPU/pin: tab ẩn mà video không phát (không dùng Phát nền) →
    // nghỉ nhịp này, chỉ giữ auto-PiP hoạt động.
    if (document.hidden) {
      const v0 = getActiveVideo();
      if (!v0 || v0.paused) { tryAutoPip(); return; }
    }
    enforceRate();
    enforceVolume();
    applyVolumeNormalize();
    assertMediaKeys();
    // Fallback cho auto-PiP: khi bật Phát nền, sự kiện visibilitychange bị
    // nuốt ở tầng trang, nhưng isolated world vẫn đọc được document.hidden thật.
    if (document.hidden) tryAutoPip(); else exitAutoPip();
    pipTick();
    favPlaybackTick();
    recordMedia(getActiveVideo());
    refreshHud();
  }, 800);

  // react to SPA url changes
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      window.__anLoopHold = false;
      // Đổi clip thì bỏ đoạn lặp A–B cũ.
      abA = abB = null; abOn = false;
      panelOpen = false;
      if (els.panel) els.panel.style.display = 'none';
      // Phát yêu thích: cập nhật tr���ng thái khi URL đổi kiểu SPA (không reload).
      favAdvancing = false;
      if (favQueue && favQueue.active) {
        if (favQueueMatchesHere(favQueue)) window.__anFavPlayback = true;
        else if (window.__anFavPlayback) stopFavPlayback();
      }
      refreshHud();
    }
  }, 600);

  refreshHud();
})();
