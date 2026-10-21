(() => {
  if (window.__autoNextInjected) return;
  window.__autoNextInjected = true;

  const DEFAULTS = {
    enabled: true,
    facebook: true,
    instagram: true,
    x: true,
    tiktok: true,
    youtube: true,
    skipSeen: false,
    durFilter: false,
    durMin: 0,
    durMax: 0,
    // Tự lướt qua clip quảng cáo/được tài trợ.
    adSkip: true,
    // Tua qua N giây đầu mỗi clip (0 = tắt).
    introSkip: 0,
    // Tùy chỉnh thời điểm chuyển clip (giây): âm = chuyển sớm N giây trước
    // khi clip hết; dương = đợi thêm N giây sau khi clip hết; 0 = đúng lúc hết.
    endOffset: -0.5,
    // Fallback advance window (seconds) when the tab is hidden and the native
    // 'ended' event may be throttled.
    hiddenEndThresholdMs: 250,
    // In the foreground we wait for the true end so we never cut a clip short.
    visibleEndThresholdMs: 50,
    // Cooldown between two advances so overlapping signals can't double-skip.
    cooldownMs: 1600,
    // How long we wait to confirm a single strategy worked before trying the next.
    // 900ms tỏ ra quá ngắn trên máy/mạng chậm — điều hướng "về đích" trễ làm
    // extension bắn thêm chiến lược nữa → nhảy liền 2 clip.
    confirmWindowMs: 1300,
    confirmPollMs: 90,
    useKeyboardFallback: true,
    useButtonFallback: true,
    useSwipeFallback: true,
    copyrightMutedSkip: false,
    showSkipBadge: true,
    debug: false
  };

  let settings = { ...DEFAULTS };
  const seenVideos = new WeakSet();
  const endedGuard = new WeakMap();
  const lastTimeMap = new WeakMap();
  let lastAdvanceAt = 0;
  // Theo dõi 1 lần chuyển clip trọn vẹn + phát hiện lướt quá đà.
  let advanceFromId = null;   // ID clip lúc extension bắt đầu chuyển
  let advanceFiredAt = 0;     // thời điểm extension bắn điều hướng
  let lastLandId = null;      // ID clip vừa "hạ cánh" gần nhất
  let lastLandAt = 0;
  let lastRollbackAt = 0;
  let rollbackHoldUntil = 0;  // đang quay lại sau khi lướt quá đà — giữ yên
  let lastEntryAt = 0;        // thời điểm vào clip hiện tại
  let pendingEntryId = null;  // chống ID nhấp nháy lúc chuyển cảnh
  // Thao tác THẬT của người dùng (isTrusted) — để không nhầm người dùng tự
  // lướt nhanh với lỗi extension lướt quá đà.
  let lastUserInputAt = 0;
  for (const evName of ['wheel', 'keydown', 'pointerdown', 'touchstart']) {
    try {
      window.addEventListener(evName, (e) => { if (e.isTrusted) lastUserInputAt = Date.now(); }, { capture: true, passive: true });
    } catch {}
  }
  // GHI NHỚ CÁCH ĐIỀU HƯỚNG ĐÃ ĂN cho từng nền tảng: lần chuyển sau dùng
  // ngay cách đó thay vì dò lại từ đầu (nguyên nhân độ trễ ~10s: phải thử
  // + chờ hết từng cách không ăn trước khi tới cách hoạt động được).
  function siteKey() { return isFacebook ? 'fb' : isInstagram ? 'ig' : isX ? 'x' : isTikTok ? 'tt' : isYouTube ? 'yt' : 'other'; }
  let preferredStrat = null;
  try {
    chrome.storage?.local?.get('navStrat', (r) => {
      try { preferredStrat = (r && r.navStrat && r.navStrat[siteKey()]) || null; } catch {}
    });
  } catch {}
  function rememberStrat(name) {
    if (!name || preferredStrat === name) return;
    preferredStrat = name;
    try {
      chrome.storage?.local?.get('navStrat', (r) => {
        const m = (r && r.navStrat) || {};
        m[siteKey()] = name;
        try { chrome.storage?.local?.set({ navStrat: m }); } catch {}
      });
    } catch {}
  }
  let advancing = false;
  // Hẹn giờ "chuyển trễ + giây" (tùy chọn endOffset dương).
  let endDelayTimer = null;
  let endDelayKey = null;
  let currentUrl = location.href;

  const host = location.hostname;
  const isFacebook = /(^|\.)facebook\.com$/i.test(host);
  const isInstagram = /(^|\.)instagram\.com$/i.test(host);
  const isX = /(^|\.)(x|twitter)\.com$/i.test(host);
  const isTikTok = /(^|\.)tiktok\.com$/i.test(host);
  const isYouTube = /(^|\.)youtube\.com$/i.test(host);

  function log(...args) {
    if (settings.debug) console.log('[AutoNext]', ...args);
  }

  function siteEnabled() {
    if (!settings.enabled) return false;
    if (isFacebook) return settings.facebook !== false;
    if (isInstagram) return settings.instagram !== false;
    if (isX) return settings.x !== false;
    if (isTikTok) return settings.tiktok !== false;
    if (isYouTube) return settings.youtube !== false;
    return false;
  }

  function onFacebookReelPage() {
    return /\/reels?\//i.test(location.pathname);
  }

  function onInstagramReelPage() {
    return /\/(?:reels?|p)\//i.test(location.pathname);
  }

  function onXVideoPage() {
    return /\/(?:i\/videos|.*\/status)/i.test(location.pathname);
  }

  function onYouTubeShortsPage() {
    return /\/shorts\//i.test(location.pathname);
  }

  function pageIsRelevant() {
    if (isFacebook) return onFacebookReelPage();
    if (isInstagram) return onInstagramReelPage();
    if (isX) return onXVideoPage();
    if (isTikTok) return true;
    if (isYouTube) return onYouTubeShortsPage();
    return false;
  }

  chrome.storage?.sync?.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    log('settings loaded', settings);
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
    log('settings updated', settings);
  });

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'AUTONEXT_CONFIG' && message.settings) {
      settings = { ...settings, ...message.settings };
      sendResponse({ ok: true });
      return true;
    }
    if (message?.type === 'AUTONEXT_STATUS') {
      // Only the top frame answers, so iframes can't report a wrong status.
      if (window.top !== window) return false;
      sendResponse({
        ok: true,
        site: isFacebook ? 'facebook' : isInstagram ? 'instagram' : isX ? 'x' : isTikTok ? 'tiktok' : isYouTube ? 'youtube' : 'other',
        relevant: pageIsRelevant(),
        enabled: siteEnabled()
      });
      return true;
    }
    return false;
  });

  function safePing() {
    try {
      chrome.runtime?.sendMessage?.({ type: 'AUTONEXT_PING' }, () => void chrome.runtime.lastError);
    } catch {}
  }
  safePing();
  setInterval(safePing, 25000);

  // ---- seen-skip (bỏ qua clip đã xem) -----------------------------------
  // Clip IDs are remembered locally (per device). A clip counts as "seen"
  // only after the user stayed on it for a few seconds.
  const SEEN_LIMIT = 5000;
  const SEEN_MARK_AFTER_MS = 3000;
  let seenIds = new Set();
  let seenLoaded = false;
  let seenDirty = false;
  let seenMarkTimer = null;

  try {
    chrome.storage?.local?.get({ seenIds: [] }, (s) => {
      try { seenIds = new Set(Array.isArray(s?.seenIds) ? s.seenIds : []); } catch {}
      seenLoaded = true;
    });
  } catch { seenLoaded = true; }

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes.seenIds) return;
    try { seenIds = new Set(changes.seenIds.newValue || []); } catch {}
  });

  setInterval(() => {
    if (!seenDirty) return;
    seenDirty = false;
    try { chrome.storage?.local?.set({ seenIds: [...seenIds].slice(-SEEN_LIMIT) }); } catch {}
  }, 4000);

  function currentClipId() {
    const p = location.pathname;
    let m;
    if (isYouTube) return (m = p.match(/\/shorts\/([\w-]+)/i)) ? 'yt:' + m[1] : null;
    if (isTikTok) return (m = p.match(/\/(?:video|photo)\/(\d+)/i)) ? 'tt:' + m[1] : domClipId('tt');
    if (isFacebook) return (m = p.match(/\/reels?\/(\d+)/i)) ? 'fb:' + m[1] : domClipId('fb');
    if (isInstagram) return (m = p.match(/\/(?:reels?|p)\/([\w-]+)/i)) ? 'ig:' + m[1] : domClipId('ig');
    if (isX) return (m = p.match(/\/status\/(\d+)/i)) ? 'x:' + m[1] : domClipId('x');
    return null;
  }

  // Dự phòng khi URL không chứa ID clip (vd TikTok trang For You giữ nguyên
  // đường dẫn khi lướt): dò ID trong các link thuộc khối chứa video đang phát.
  // Trước đây trường hợp này ID rơi về location.href — giống nhau cho mọi clip
  // → Yêu thích/Đã xem nhận nhầm clip. Trả về null nếu không dò được (an toàn).
  let lastDomClip = { id: '', url: '' };
  function domClipId(kind) {
    try {
      const v = getActiveVideo();
      if (!v) return null;
      const vr = v.getBoundingClientRect();
      let el = v;
      for (let i = 0; i < 9 && el; i++, el = el.parentElement) {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        // Dừng khi trèo tới khung to cỡ cả trang/cả feed (chứa link của clip khác).
        if (r && (r.width > Math.max(vr.width + 560, innerWidth * 0.95) || r.height > vr.height * 2.5 + 240)) break;
        const links = el.querySelectorAll ? el.querySelectorAll('a[href*="/video/"], a[href*="/photo/"], a[href*="/reel"], a[href*="/p/"], a[href*="/status/"]') : [];
        for (const a of links) {
          const h = a.href || '';
          let mm;
          if (kind === 'tt' && (mm = h.match(/\/(?:video|photo)\/(\d+)/))) { lastDomClip = { id: 'tt:' + mm[1], url: h }; return lastDomClip.id; }
          if (kind === 'fb' && (mm = h.match(/\/reels?\/(\d+)/))) { lastDomClip = { id: 'fb:' + mm[1], url: h.split('?')[0] }; return lastDomClip.id; }
          if (kind === 'ig' && (mm = h.match(/\/(?:reels?|p)\/([\w-]+)/))) { lastDomClip = { id: 'ig:' + mm[1], url: h.split('?')[0] }; return lastDomClip.id; }
          if (kind === 'x' && (mm = h.match(/\/status\/(\d+)/))) { lastDomClip = { id: 'x:' + mm[1], url: h.split('?')[0] }; return lastDomClip.id; }
        }
      }
    } catch {}
    return null;
  }

  // URL chuẩn để mở lại clip (dùng cho Yêu thích): ưu tiên link vừa dò được
  // khi location.href không chứa ID clip.
  function currentClipUrl() {
    const id = currentClipId();
    if (id && lastDomClip.id === id && lastDomClip.url) return lastDomClip.url;
    return location.href;
  }

  function markSeen(id) {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    if (seenIds.size > SEEN_LIMIT + 500) seenIds = new Set([...seenIds].slice(-SEEN_LIMIT));
    seenDirty = true;
  }

  // ---- buffering guard (mạng chậm) ---------------------------------------
  // Video đang buffering nghĩa là clip chưa chắc đã tải xong — tạm hoãn
  // seen-skip / marathon-skip để không lướt nhầm, thử lại t����i đa ~5,6 giây.
  const bufferingSince = new WeakMap();
  function activeBuffering() {
    const v = getActiveVideo();
    if (!v || v.ended) return false;
    if (bufferingSince.has(v)) return true;
    return !v.paused && v.readyState < 3;
  }
  function deferWhileBuffering(fn, tries) {
    if (!activeBuffering() || (tries || 0) >= 8) { fn(); return; }
    log('video đang buffering — hoãn tự lướt');
    setTimeout(() => deferWhileBuffering(fn, (tries || 0) + 1), 700);
  }

  // ---- tạm ngưng khi đang gõ bình luận ------------------------------------
  // Người dùng đang focus vào ô nhập liệu (bình luận, chat, tìm kiếm...) thì
  // hoãn tự chuyển clip; rời ô nhập (gõ xong) mới chuyển tiếp. Ô bình luận
  // của Facebook/TikTok là contenteditable hoặc role=textbox nên kiểm tra cả
  // hai; đi sâu vào shadow root để bắt cả ô nhập trong shadow DOM.
  function isTyping() {
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
  let typingWait = false;
  let typingToastAt = 0;
  function deferWhileTyping(video, reason) {
    if (typingWait) return;
    typingWait = true;
    log('đang gõ — hoãn tự lướt (' + reason + ')');
    // Nhắc nhẹ tối đa 1 lần/15s để người dùng biết vì sao clip chưa chuyển.
    if (Date.now() - typingToastAt > 15000) {
      typingToastAt = Date.now();
      try { window.__anToast?.('\u2328\uFE0F Đang gõ — sẽ chuyển clip khi bạn gõ xong'); } catch {}
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      // Dừng chờ nếu đã sang clip khác / tắt site / quá 10 phút (an toàn).
      const stale = !siteEnabled() || !pageIsRelevant() || getActiveVideo() !== video || Date.now() - startedAt > 600000;
      if (stale) { typingWait = false; clearInterval(timer); return; }
      if (!isTyping()) {
        typingWait = false;
        clearInterval(timer);
        goNext(video, reason);
      }
    }, 700);
  }

  // ---- chặn tác giả (blacklist) -------------------------------------------
  // Danh sách do features.js quản lý (storage.local). Gặp clip của tác giả
  // bị chặn thì tự lướt qua (blocked-skip).
  let blockedKeys = new Set();
  let blockedKw = [];
  try {
    chrome.storage?.local?.get({ blockedAuthors: [], blockedKeywords: [] }, (s) => {
      try { blockedKeys = new Set((s?.blockedAuthors || []).map((b) => b && b.key).filter(Boolean)); } catch {}
      try { blockedKw = (Array.isArray(s?.blockedKeywords) ? s.blockedKeywords : []).map((k) => String(k).toLowerCase()).filter(Boolean); } catch {}
    });
  } catch {}
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.blockedAuthors) { try { blockedKeys = new Set((changes.blockedAuthors.newValue || []).map((b) => b && b.key).filter(Boolean)); } catch {} }
    if (changes.blockedKeywords) { try { blockedKw = (changes.blockedKeywords.newValue || []).map((k) => String(k).toLowerCase()).filter(Boolean); } catch {} }
  });
  function authorKey(a) { return (isTikTok ? 'tt:' : isYouTube ? 'yt:' : isInstagram ? 'ig:' : isX ? 'x:' : 'fb:') + a; }
  let blockTimer = null;
  function blockCheck() {
    if ((!blockedKeys.size && !blockedKw.length) || window.__anLoopHold || window.__anFavPlayback) return;
    const a = currentAuthor();
    const authorHit = !!(a && blockedKeys.has(authorKey(a)));
    // Chặn theo từ khóa tiêu đề: so với document.title (TikTok/YouTube đổi
    // title theo từng clip; Facebook Reels không có tiêu đề riêng từng clip).
    const ttl = (document.title || '').toLowerCase();
    const kwHit = !authorHit && blockedKw.some((k) => k && ttl.includes(k));
    if (!authorHit && !kwHit) return;
    log(authorHit ? 'blocked author, skipping' : 'blocked keyword, skipping');
    deferWhileBuffering(() => {
      const cur = currentAuthor();
      const t2 = (document.title || '').toLowerCase();
      if ((cur && blockedKeys.has(authorKey(cur))) || blockedKw.some((k) => k && t2.includes(k))) {
        goNext(getActiveVideo(), authorHit ? 'blocked-skip' : 'keyword-skip');
      }
    });
  }

  // ---- author detection (cho chế độ Marathon tác giả) --------------------
  // Các path hệ thống của Facebook — không phải trang cá nhân/fanpage.
  const FB_SYS_PATHS = new Set(['reel', 'reels', 'watch', 'video', 'videos', 'stories', 'groups', 'events', 'marketplace', 'gaming', 'games', 'live', 'friends', 'memories', 'saved', 'pages', 'bookmarks', 'notifications', 'messages', 'search', 'hashtag', 'help', 'settings', 'privacy', 'policies', 'login', 'sharer', 'share', 'photo', 'photos', 'me', 'ads', 'business', 'about', 'legal', 'terms', 'places', 'recover', 'reg', 'dialog', 'plugins', 'intl', 'browse', 'findfriends', 'fundraisers', 'jobs', 'news', 'payments', 'support', 'crisisresponse', 'offers', 'people', 'public', 'topic', 'media', 'mediaset', 'home']);
  function fbProfileKeyFromHref(href) {
    if (!href) return null;
    let u;
    try { u = new URL(href, location.origin); } catch { return null; }
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    // Dạng /profile.php?id=123 (tài khoản không có username)
    if (u.pathname === '/profile.php') {
      const id = u.searchParams.get('id') || '';
      return /^\d+$/.test(id) ? ('id:' + id) : null;
    }
    // Dạng /ten.nguoi.dung — đúng 1 đoạn path, tối thiểu 3 ký tự.
    const m = u.pathname.match(/^\/([A-Za-z0-9][A-Za-z0-9.\-_]{2,})\/?$/);
    if (!m) return null;
    const name = m[1].toLowerCase();
    if (FB_SYS_PATHS.has(name) || name.endsWith('.php')) return null;
    return name;
  }
  function currentAuthor() {
    try {
      if (isTikTok) {
        const m = location.pathname.match(/^\/(@[\w.-]+)(\/|$)/);
        if (m) return m[1].toLowerCase();
        const el = document.querySelector('[data-e2e="video-author-uniqueid"]');
        const t = el && el.textContent ? el.textContent.trim() : '';
        return t ? ('@' + t.replace(/^@/, '').toLowerCase()) : null;
      }
      if (isYouTube) {
        // Prefer the author link inside the ACTIVE short; fall back to any
        // handle link in the shorts player overlay.
        const scopes = [
          'ytd-reel-video-renderer[is-active] ',
          'yt-reel-metapanel-view-model ',
          'ytd-shorts '
        ];
        for (const s of scopes) {
          const el = document.querySelector(s + 'a[href^="/@"]');
          if (el) {
            const m = (el.getAttribute('href') || '').match(/^\/(@[^\/?#]+)/);
            if (m) return m[1].toLowerCase();
          }
        }
        return null;
      }
      if (isInstagram) {
        const el = document.querySelector('header a[role="link"][href^="/"], a[role="link"][href^="/"] span');
        const link = el ? (el.closest('a') || el) : null;
        if (link) {
          const m = (link.getAttribute('href') || '').match(/^\/([a-zA-Z0-9._]+)\/?/);
          if (m && !['explore', 'reels', 'direct', 'stories'].includes(m[1].toLowerCase())) return '@' + m[1].toLowerCase();
        }
        return null;
      }
      if (isX) {
        const m = location.pathname.match(/^\/([a-zA-Z0-9_]{1,20})\/status\//);
        if (m && !['i', 'home', 'explore', 'messages', 'notifications'].includes(m[1].toLowerCase())) {
          return '@' + m[1].toLowerCase();
        }
        const nameEl = document.querySelector('[data-testid="User-Name"] a[href^="/"]');
        if (nameEl) {
          const hm = (nameEl.getAttribute('href') || '').match(/^\/([a-zA-Z0-9_]{1,20})/);
          if (hm && !['i', 'home', 'explore'].includes(hm[1].toLowerCase())) return '@' + hm[1].toLowerCase();
        }
        return null;
      }
      // Facebook Reels: DOM bị làm rối, nhưng overlay của reel luôn có link
      // avatar/tên tác giả trỏ về trang cá nhân hoặc fanpage. Quét link trong
      // khối chứa video đang phát — không leo quá rộng để tránh dính link
      // trang cá nhân của chính mình ở thanh điều hướng bên trái.
      const v = getActiveVideo();
      if (!v) return null;
      const vr = v.getBoundingClientRect();
      let scope = v;
      for (let i = 0; i < 9 && scope.parentElement; i++) {
        const p = scope.parentElement;
        let r = null;
        try { r = p.getBoundingClientRect(); } catch {}
        // Dừng trước khi phạm vi phình to bằng cả trang (chừa chỗ cho panel
        // m�� tả/bình luận bên phải rộng ~560px của giao diện Reels).
        if (r && r.width > 0 && (r.width > vr.width + 560 || r.width >= (window.innerWidth || 1e9) * 0.95)) break;
        scope = p;
      }
      if (scope.querySelectorAll) {
        for (const l of scope.querySelectorAll('a[href]')) {
          const k = fbProfileKeyFromHref(l.getAttribute('href'));
          if (k) return k;
        }
      }
      // Dự phòng: mò chủ sở hữu reel trong dữ liệu JSON của trang, neo theo
      // id reel hiện tại để không nhầm với reel khác đã tải trước đó.
      const mid = location.pathname.match(/\/reels?\/(\d+)/);
      if (mid) {
        for (const sc of document.querySelectorAll('script')) {
          const txt = sc.textContent || '';
          const at = txt.indexOf(mid[1]);
          if (at === -1) continue;
          const near = txt.slice(Math.max(0, at - 20000), at + 20000);
          const mo = near.match(/"owner"\s*:\s*\{\s*"__typename"\s*:\s*"(?:User|Page)"\s*,\s*"id"\s*:\s*"(\d+)"/);
          if (mo) return 'id:' + mo[1];
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  let marathonTimer = null;
  function marathonCheck() {
    const mar = window.__anMarathon;
    if (!mar || !mar.author || window.__anLoopHold || window.__anFavPlayback) return;
    const a = currentAuthor();
    if (!a) return; // không xác định được — không đụng vào clip
    if (a === mar.author) { mar.skips = 0; return; }
    mar.skips = (mar.skips || 0) + 1;
    if (mar.skips > 12) {
      window.__anMarathon = null;
      try { window.__anToast?.('Marathon: không gặp clip của ' + mar.author + ' gần đây — đã tắt', 3400); } catch {}
      try { window.__anMarathonSync?.(); } catch {}
      return;
    }
    log('marathon skip (' + a + ' ≠ ' + mar.author + ')');
    deferWhileBuffering(() => {
      const m2 = window.__anMarathon;
      const cur = currentAuthor();
      if (m2 && cur && cur !== m2.author) goNext(getActiveVideo(), 'marathon-skip');
    });
  }

  // Called whenever we land on a clip (startup + every SPA url change).
  let lastEntryId = null;
  function handleClipEntry() {
    if (!siteEnabled() || !pageIsRelevant()) return;
    // URL đổi lặt vặt (thêm/bớt tham số, fbclid…) nhưng vẫn là CLIP ĐANG XEM:
    // không xử lý lại từ đầu. Trước đây sau ~3s clip bị đánh dấu "đã xem",
    // lần xử lý lại kế tiếp tưởng là clip mới-đã-xem và tự lướt qua CHÍNH
    // clip đang xem → cảm giác nhảy clip ngẫu nhiên/nhảy đúp.
    const entryId = currentClipId();
    if (entryId && entryId === lastEntryId) return;
    const prevEntryId = lastEntryId;
    lastEntryId = entryId;
    const nowT = Date.now();
    lastEntryAt = nowT;
    // PHÁT HIỆN LƯỚT QUÁ ĐÀ: ngay sau 1 lần chuyển của extension mà ID clip
    // đổi 2 lần sát nhau (~1,7s) và KHÔNG có thao tác thật của người dùng
    // → đã lỡ lướt qua mất clip kế tiếp. Tự bấm quay lại đúng 1 bước.
    if (
      entryId && prevEntryId && lastLandId &&
      entryId !== advanceFromId && lastLandId !== advanceFromId && lastLandId !== entryId &&
      nowT - advanceFiredAt < 3500 && nowT - lastLandAt < 1700 &&
      nowT - lastUserInputAt > 1500 && nowT - lastRollbackAt > 4000
    ) {
      lastRollbackAt = nowT;
      rollbackHoldUntil = nowT + 2500;
      lastAdvanceAt = nowT;
      lastLandId = entryId;
      lastLandAt = nowT;
      log('double-land detected — rolling back one clip');
      try { window.__anToast?.('\u21A9 Lỡ lướt quá 1 clip — đã tự quay lại'); } catch {}
      pressPrevKey();
      return;
    }
    lastLandId = entryId;
    lastLandAt = nowT;
    clearTimeout(marathonTimer);
    if (window.__anMarathon) {
      // Thông tin tác giả có thể render sau khi URL đổi (nhất là YouTube).
      marathonTimer = setTimeout(marathonCheck, isTikTok ? 150 : 700);
    }
    clearTimeout(blockTimer);
    if (blockedKeys.size || blockedKw.length) blockTimer = setTimeout(blockCheck, isTikTok ? 200 : 750);
    scheduleAdChecks();
    // Sang clip mới — hủy hẹn giờ "chuyển trễ + giây" còn treo của clip trước.
    clearTimeout(endDelayTimer);
    endDelayTimer = null;
    endDelayKey = null;
    const id = entryId;
    if (!id) return;
    clearTimeout(seenMarkTimer);
    if (settings.skipSeen && seenLoaded && seenIds.has(id) && !window.__anLoopHold && !window.__anFavPlayback) {
      log('already seen, skipping', id);
      // Đợi qua hẳn cooldown của lần chuyển clip vừa rồi + báo toast rõ ràng
      // — lướt "clip đã xem" giờ có chủ đích và nhìn thấy được, không còn
      // giống lỗi nhảy liền 2 clip nữa.
      const wait = Math.max(0, settings.cooldownMs - (Date.now() - lastAdvanceAt)) + 250;
      setTimeout(() => {
        if (currentClipId() !== id || window.__anLoopHold || window.__anFavPlayback) return;
        try { window.__anToast?.('\u23ED Clip đã xem — lướt qua'); } catch {}
        deferWhileBuffering(() => {
          if (currentClipId() === id && !window.__anFavPlayback) goNext(getActiveVideo(), 'seen-skip');
        });
      }, wait);
      return;
    }
    seenMarkTimer = setTimeout(() => {
      if (currentClipId() === id) markSeen(id);
    }, SEEN_MARK_AFTER_MS);
  }

  // ---- tự lướt clip quảng cáo ---------------------------------------------
  // Nhận diện nhãn "Được tài trợ"/"Sponsored"/"Quảng cáo" gần video đang phát
  // và tự chuyển clip. Chạy vài lần ngay sau khi vào clip (nhãn render trễ),
  // không chạy liên tục để tránh tốn CPU quét DOM.
  const AD_LABELS = ['được tài trợ', 'sponsored', 'quảng cáo', 'advertisement'];
  function adLabelVisible() {
    const v = getActiveVideo();
    if (!v) return false;
    // YouTube Shorts: khối quảng cáo riêng trong short đang active.
    if (isYouTube) {
      try { if (document.querySelector('ytd-reel-video-renderer[is-active] ytd-ad-slot-renderer')) return true; } catch {}
    }
    // Quét chữ quanh video (leo tối đa 8 cấp cha) — chỉ node lá, chữ ngắn,
    // phải TRÙNG KHỚP cả cụm để không nhầm với caption/bình luận chứa từ đó.
    let scope = v;
    for (let i = 0; i < 8 && scope.parentElement; i++) scope = scope.parentElement;
    let els;
    try { els = scope.querySelectorAll('span,div,a,p,strong,b'); } catch { return false; }
    for (const el of els) {
      if (el.childElementCount > 0) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t || t.length > 24 || !AD_LABELS.includes(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight)) return true;
    }
    return false;
  }
  let adTimers = [];
  let adToastAt = 0;
  function adCheck() {
    if (settings.adSkip === false || window.__anLoopHold || window.__anFavPlayback) return;
    if (!siteEnabled() || !pageIsRelevant()) return;
    if (!adLabelVisible()) return;
    log('sponsored clip — skipping');
    if (Date.now() - adToastAt > 3000) {
      adToastAt = Date.now();
      try { window.__anToast?.('\uD83D\uDCE2 Clip được tài trợ — lướt qua'); } catch {}
    }
    deferWhileBuffering(() => {
      if (adLabelVisible()) goNext(getActiveVideo(), 'ad-skip');
    });
  }
  function scheduleAdChecks() {
    adTimers.forEach(clearTimeout);
    adTimers = [600, 1600, 3200].map((ms) => setTimeout(adCheck, ms));
  }

  // ---- tự tua qua giây đầu clip -------------------------------------------
  // introSkip > 0: mỗi clip mới tua thẳng tới giây thứ N (bỏ đoạn intro chào
  // hỏi lặp đi lặp lại). Chỉ áp dụng 1 lần cho mỗi clip và khi clip dài ≥ 3×N
  // để không nuốt mất clip ngắn. Tự tua về đầu xem lại sẽ không bị tua tiếp.
  const introDone = new WeakMap();
  function introSkipCheck(video) {
    const s = Math.max(0, Number(settings.introSkip) || 0);
    if (!s || !video || window.__anLoopHold) return;
    if (video.paused || !isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration < s * 3) return;
    const key = video.currentSrc || video.src || '';
    if (introDone.get(video) === key) return;
    introDone.set(video, key);
    if (video.currentTime < s) {
      try { video.currentTime = s; log('intro skip →', s + 's'); } catch {}
    }
  }

  // ---- lọc theo thời lượng ------------------------------------------------
  // Tự lướt qua clip quá dài / quá ngắn (ngưỡng tính bằng giây, đặt trong
  // popup; 0 = không áp dụng). Chạy trong rescanTimer khi đã biết duration.
  function durationCheck(video) {
    if (!settings.durFilter || window.__anLoopHold || window.__anFavPlayback) return;
    if (!video || video.paused || !isFinite(video.duration) || video.duration <= 0) return;
    // Livestream không bị lọc theo thời lượng (duration của live không có nghĩa).
    if (isLiveVideo(video)) return;
    const min = Number(settings.durMin) || 0;
    const max = Number(settings.durMax) || 0;
    if ((max > 0 && video.duration > max) || (min > 0 && video.duration < min)) {
      log('duration skip', video.duration);
      goNext(video, 'duration-skip');
    }
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    return rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);
  }

  function visibleArea(el) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const w = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const h = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    return w * h;
  }

  function getActiveVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    const playing = videos
      .filter((v) => !v.paused && !v.ended && v.readyState >= 2)
      .sort((a, b) => visibleArea(b) - visibleArea(a));
    if (playing.length > 0) return playing[0];

    const visible = videos
      .filter((v) => isVisible(v))
      .sort((a, b) => visibleArea(b) - visibleArea(a));
    return visible[0] || videos[0] || null;
  }

  // ---- advance confirmation ---------------------------------------------
  // A robust snapshot of which clip is playing so we can tell whether an
  // advance really happened. TikTok/YouTube often REUSE the same <video>
  // element and only swap its src, so element identity alone is not enough.
  // Vị trí cuộn của khung chứa feed — dùng để nhận biết trang ĐANG trượt dở
  // tới clip kế (điều hướng đã bắn nhưng chưa "về đích").
  function scrollerOf(v) {
    let el = v ? v.parentElement : null;
    for (let i = 0; i < 12 && el; i++, el = el.parentElement) {
      try {
        if (el.scrollHeight > el.clientHeight + 120) {
          const st = getComputedStyle(el);
          if (/(auto|scroll)/.test(st.overflowY)) return el;
        }
      } catch {}
    }
    return null;
  }
  function scrollProbe(v) {
    const sc = scrollerOf(v);
    return (sc ? sc.scrollTop : 0) + (window.scrollY || 0);
  }
  function scrollInFlight(before) {
    const v = before.el && before.el.isConnected ? before.el : getActiveVideo();
    return Math.abs(scrollProbe(v) - before.scroll) > 40;
  }

  function snapshot() {
    const v = getActiveVideo();
    return {
      url: location.href,
      el: v,
      src: v ? (v.currentSrc || v.src || '') : '',
      t: v ? (v.currentTime || 0) : 0,
      scroll: scrollProbe(v)
    };
  }

  function advancedFrom(before) {
    if (!before) return false;
    if (location.href !== before.url) return true;
    const v = getActiveVideo();
    if (!v) return false;
    if (v !== before.el) return true;
    if ((v.currentSrc || v.src || '') !== before.src) return true;
    return false;
  }

  async function waitForAdvance(before, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await sleep(settings.confirmPollMs);
      if (advancedFrom(before)) return true;
    }
    return false;
  }

  // Clip CŨ đã PHÁT LẠI từ đầu (cùng thẻ, cùng nguồn, thời gian nhảy ngược
  // về đầu và đang chạy) — bằng chứng rõ ràng điều hướng vừa thử KHÔNG ăn
  // → khỏi chờ hết cửa sổ, thử ngay cách tiếp theo (giảm độ trễ ~10s).
  function replayingAtOrigin(before) {
    const v = getActiveVideo();
    return !!(
      v && v === before.el &&
      (v.currentSrc || v.src || '') === before.src &&
      !v.paused && !v.ended &&
      v.currentTime > 0.15 && v.currentTime < before.t - 0.75
    );
  }
  async function waitForAdvanceOrReplay(before, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await sleep(settings.confirmPollMs);
      if (advancedFrom(before)) return 'advanced';
      if (replayingAtOrigin(before)) return 'replaying';
    }
    return 'timeout';
  }

  // ---- single navigation actions (never fired two at a time) ------------
  function dispatchKeyOnce(key, code, keyCode) {
    const opts = {
      key,
      code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    // Dispatch to exactly ONE in-tree target. Because keyboard events bubble,
    // this single dispatch already reaches document and window listeners.
    // Dispatching to body + documentElement + window (as before) made a single
    // key press fire the site handler multiple times => skipping 2 clips.
    let target = document.activeElement;
    const tag = ((target && target.tagName) || '').toLowerCase();
    const isEditable =
      tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
    if (!target || isEditable || target === document.body || !target.isConnected) {
      // Never fire navigation keys into an input the user is typing in.
      target = getActiveVideo() || document.body || document.documentElement;
    }
    try {
      target.dispatchEvent(new KeyboardEvent('keydown', opts));
      target.dispatchEvent(new KeyboardEvent('keyup', opts));
    } catch {}
  }

  function pressNextKey() {
    dispatchKeyOnce('ArrowDown', 'ArrowDown', 40);
    log('pressed ArrowDown (single target)');
  }

  // Quay LẠI đúng 1 clip (dùng khi phát hiện lướt quá đà).
  function pressPrevKey() {
    dispatchKeyOnce('ArrowUp', 'ArrowUp', 38);
    log('pressed ArrowUp (rollback one clip)');
  }

  function realClick(el) {
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

  function findFacebookNextButton() {
    const labels = [
      'next card', 'next video', 'next reel', 'next',
      'thẻ tiếp theo', 'video tiếp theo', 'reel tiếp theo', 'tiếp theo', 'xem thẻ tiếp theo', 'xem video tiếp theo', 'thẻ sau',
      'card suivante', 'suivant', 'siguiente', 'weiter', '次へ', '다음'
    ];
    // Ưu tiên tìm trong container gần video đang phát trước
    try {
      const v = getActiveVideo();
      const scope = v ? (v.closest('[role="main"]') || v.closest('[role="feed"]') || v.parentElement?.parentElement) : null;
      if (scope) {
        const localCandidates = Array.from(scope.querySelectorAll('[aria-label], [role="button"][aria-label]'));
        for (const el of localCandidates) {
          const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          if (label && labels.some((l) => label === l || label.includes(l))) {
            if (isVisible(el) || el.getClientRects().length > 0) return el;
          }
        }
      }
    } catch {}
    const candidates = Array.from(
      document.querySelectorAll('[aria-label], [role="button"][aria-label]')
    );
    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!label) continue;
      if (labels.some((l) => label === l || label.includes(l))) {
        if (isVisible(el) || el.getClientRects().length > 0) return el;
      }
    }
    return null;
  }

  function findInstagramNextButton() {
    const labels = ['next', 'tiếp', 'tiếp theo', 'down', 'xuống'];
    const candidates = Array.from(
      document.querySelectorAll('button[aria-label], [role="button"][aria-label], svg[aria-label]')
    );
    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!label) continue;
      if (labels.some((l) => label === l || label.includes(l))) {
        const btn = el.closest('button, [role="button"]') || el;
        if (isVisible(btn) || btn.getClientRects().length > 0) return btn;
      }
    }
    return null;
  }

  function findTikTokNextButton() {
    const selectors = [
      'button[data-e2e="arrow-right"]',
      'button[data-e2e="video-switch-next"]',
      'button[data-e2e="feed-video-next"]',
      '[data-e2e="slideList"] button[aria-label]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && (isVisible(el) || el.getClientRects().length > 0)) return el;
    }
    const labels = ['next video', 'video tiếp theo', 'tiếp theo', 'next'];
    const candidates = Array.from(document.querySelectorAll('button[aria-label]'));
    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (labels.some((l) => label.includes(l))) return el;
    }
    return null;
  }

  function findYouTubeNextButton() {
    const selectors = [
      '#navigation-button-down button',
      '#navigation-button-down #button',
      'ytd-shorts #navigation-button-down button',
      'button[aria-label="Next video"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && (isVisible(el) || el.getClientRects().length > 0)) return el;
    }
    const labels = ['next video', 'next short', 'video tiếp theo', 'tiếp theo', 'next'];
    const candidates = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'));
    for (const el of candidates) {
      const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (labels.some((l) => label.includes(l)) && (isVisible(el) || el.getClientRects().length > 0)) return el;
    }
    return null;
  }

  function findScrollableAncestor(el) {
    let node = el?.parentElement || null;
    while (node) {
      const style = getComputedStyle(node);
      const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return null;
  }

  function scrollOnce(video) {
    try {
      const scroller =
        findScrollableAncestor(video) || document.scrollingElement || document.documentElement;
      scroller.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
      log('scroll action');
      return true;
    } catch {
      return false;
    }
  }

  function wheelOnce(video) {
    // Real mouse-wheel fallback: works on desktop where TouchEvent doesn't.
    try {
      const el = video || getActiveVideo() || document.body;
      const rect = el.getBoundingClientRect();
      const evt = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: 240,
        deltaMode: 0
      });
      el.dispatchEvent(evt);
      log('wheel action');
      return true;
    } catch {
      return false;
    }
  }

  function swipeOnce(video) {
    try {
      const target = video?.closest('div') || document.body;
      const rect = (video || document.body).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const startY = rect.top + rect.height * 0.7;
      const endY = rect.top + rect.height * 0.2;
      const mk = (type, y) =>
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target, clientX: cx, clientY: y })],
          changedTouches: [new Touch({ identifier: 1, target, clientX: cx, clientY: y })]
        });
      target.dispatchEvent(mk('touchstart', startY));
      target.dispatchEvent(mk('touchmove', (startY + endY) / 2));
      target.dispatchEvent(mk('touchend', endY));
      log('swipe action');
      return true;
    } catch {
      return false;
    }
  }

  function buildStrategies(video) {
    const list = [];
    if (isFacebook) {
      // On Facebook Reels a single ArrowDown advances exactly one reel.
      if (settings.useKeyboardFallback) list.push({ name: 'fb-key', run: () => pressNextKey() });
      if (settings.useButtonFallback) {
        list.push({
          name: 'fb-button',
          run: () => {
            const btn = findFacebookNextButton();
            return btn ? realClick(btn) : false;
          }
        });
      }
    } else if (isTikTok) {
      if (settings.useKeyboardFallback) list.push({ name: 'tt-key', run: () => pressNextKey() });
      if (settings.useButtonFallback) {
        list.push({
          name: 'tt-button',
          run: () => {
            const btn = findTikTokNextButton();
            return btn ? realClick(btn) : false;
          }
        });
      }
    } else if (isYouTube) {
      // On YouTube Shorts a single ArrowDown navigates to the next short.
      if (settings.useKeyboardFallback) list.push({ name: 'yt-key', run: () => pressNextKey() });
      if (settings.useButtonFallback) {
        list.push({
          name: 'yt-button',
          run: () => {
            const btn = findYouTubeNextButton();
            return btn ? realClick(btn) : false;
          }
        });
      }
    } else if (isInstagram) {
      if (settings.useKeyboardFallback) list.push({ name: 'ig-key', run: () => pressNextKey() });
      if (settings.useButtonFallback) {
        list.push({
          name: 'ig-button',
          run: () => {
            const btn = findInstagramNextButton();
            return btn ? realClick(btn) : false;
          }
        });
      }
    } else if (isX) {
      if (settings.useKeyboardFallback) list.push({ name: 'x-key', run: () => pressNextKey() });
    }
    list.push({ name: 'wheel', run: () => wheelOnce(video) });
    list.push({ name: 'scroll', run: () => scrollOnce(video) });
    if (settings.useSwipeFallback) list.push({ name: 'swipe', run: () => swipeOnce(video) });
    // Đưa cách đã ăn gần nhất lên đầu — chuyển clip gần như tức thì từ lần 2.
    if (preferredStrat) {
      const i = list.findIndex((s) => s.name === preferredStrat);
      if (i > 0) list.unshift(list.splice(i, 1)[0]);
    }
    return list;
  }

  function advancedRecently() {
    return Date.now() - lastAdvanceAt < settings.cooldownMs;
  }

  let badgeEl = null;
  let badgeTimer = null;
  function showSkipBadge(reason) {
    if (settings.showSkipBadge === false) return;
    const REASON_LABELS = {
      'blocked-skip': '🚫 Tự lướt: Kênh trong danh sách chặn',
      'keyword-skip': '🚫 Tự lướt: Tiêu đề chứa từ khóa bị chặn',
      'ad-skip': '📢 Tự lướt: Video quảng cáo',
      'watchdog-rescue': '⏱️ Tự lướt: Cứu hộ video bị đứng',
      'copyright-audio-skip': '🔇 Tự lướt: Nhạc bị tắt do bản quyền',
      'seen-skip': '👁️ Tự lướt: Video đã xem trước đó',
      'duration-skip': '⌛ Tự lướt: Thời lượng ngoài phạm vi',
      'marathon-skip': '🏃 Tự lướt: Không khớp tác giả Marathon',
      'error-skip': '⚠️ Tự lướt: Video gặp sự cố phát'
    };
    const label = REASON_LABELS[reason];
    if (!label) return;

    try {
      if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.className = 'an-skip-badge';
        badgeEl.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:rgba(17,24,39,0.88);color:#fff;padding:7px 16px;border-radius:999px;font-size:12.5px;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.4);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.18);pointer-events:none;z-index:2147483647;opacity:0;transition:opacity .2s ease, transform .2s ease;letter-spacing:0.2px;font-family:system-ui,-apple-system,sans-serif;';
        document.documentElement.appendChild(badgeEl);
      }
      badgeEl.textContent = label;
      badgeEl.style.opacity = '1';
      badgeEl.style.transform = 'translateX(-50%) translateY(0)';
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(() => {
        if (badgeEl) {
          badgeEl.style.opacity = '0';
          badgeEl.style.transform = 'translateX(-50%) translateY(-6px)';
        }
      }, 1800);
    } catch {}
  }

  // Try strategies ONE AT A TIME. After each single action we wait and confirm
  // the clip actually changed before trying the next one. This guarantees we
  // never fire two navigations for one clip end (the Facebook double-skip bug).
  async function goNext(video, reason) {
    if (!siteEnabled() || !pageIsRelevant()) return;
    if (reason !== 'manual' && window.__anLoopHold) return;
    // Đang phát lần lượt danh sách yêu thích — features.js tự điều hướng.
    if (reason !== 'manual' && window.__anFavPlayback) return;
    // Đang gõ bình luận/tin nhắn — hoãn chuyển clip đến khi gõ xong.
    if (reason !== 'manual' && isTyping()) { deferWhileTyping(video, reason); return; }
    if (advancing || (reason !== 'manual' && advancedRecently())) {
      log('skip advance (busy/cooldown)');
      return;
    }
    // Vừa tự quay lại sau khi lướt quá đà — giữ yên, không chuyển tiếp ngay.
    if (reason !== 'manual' && Date.now() < rollbackHoldUntil) {
      log('skip advance (rollback hold)');
      return;
    }
    advancing = true;
    lastAdvanceAt = Date.now();
    advanceFromId = currentClipId();
    advanceFiredAt = Date.now();
    log('advance start:', reason);
    showSkipBadge(reason);

    try {
      chrome.runtime?.sendMessage?.({ type: 'AUTONEXT_GOTO_NEXT' }, () => void chrome.runtime.lastError);
    } catch {}

    try {
      const strategies = buildStrategies(video);
      // MỐC SO SÁNH DUY NHẤT cho cả chuỗi chiến lược. Trước đây mỗi chiến
      // lược chụp snapshot riêng: nếu điều hướng của chiến lược 1 "về đích"
      // trễ hơn cửa sổ xác nhận, chiến lược 2 sẽ chụp snapshot MỚI (đã ở clip
      // kế) rồi bắn thêm 1 lần điều hướng nữa → nhảy liền 2 clip. Giữ nguyên
      // 1 mốc gốc thì mọi hiệu ứng tới muộn đều được nhận ra và dừng lại.
      const origin = snapshot();
      for (const strat of strategies) {
        if (advancedFrom(origin)) {
          log('advance landed late — stopping further strategies');
          lastAdvanceAt = Date.now();
          return;
        }
        let fired = false;
        try {
          fired = strat.run() !== false;
        } catch {
          fired = false;
        }
        if (!fired) {
          log('strategy no-op:', strat.name);
          continue;
        }
        const res = await waitForAdvanceOrReplay(origin, settings.confirmWindowMs);
        if (res === 'advanced') {
          log('advance confirmed via', strat.name);
          lastAdvanceAt = Date.now();
          rememberStrat(strat.name);
          try { window.__anNoteFeature && window.__anNoteFeature('nav', true); } catch {}
          return;
        }
        // Clip cũ đã phát lại từ đầu — cách này chắc chắn không ăn, thử ngay
        // cách kế tiếp, không chờ thêm vô ích.
        if (res === 'replaying') {
          log('origin clip replaying — strategy failed fast:', strat.name);
          continue;
        }
        // Trang đang TRƯỢT DỞ tới clip kế (điều hướng đã ăn nhưng về đích
        // trễ hơn cửa sổ xác nhận) — chỉ chờ nốt nếu thực sự đang có cuộn/trượt (scrollInFlight),
        // tránh việc chờ cứng 2200ms cho mọi chiến lược Facebook gây nghẽn 12-26s.
        if (scrollInFlight(origin)) {
          log('possible in-flight transition — waiting it out instead of next strategy');
          const late = await waitForAdvanceOrReplay(origin, 1000);
          if (late === 'advanced') {
            log('advance landed after extended wait');
            lastAdvanceAt = Date.now();
            rememberStrat(strat.name);
            try { window.__anNoteFeature && window.__anNoteFeature('nav', true); } catch {}
            return;
          }
          if (late === 'replaying') log('origin clip replaying — no transition in flight');
        }
        log('strategy did not advance:', strat.name);
      }
      // Chờ vớt lần cuối: hiệu ứng của chiến lược cuối cùng có thể tới muộn.
      if (await waitForAdvance(origin, 700)) {
        log('advance landed during grace wait');
        lastAdvanceAt = Date.now();
        return;
      }
      log('advance not confirmed after all strategies');
      const vNow = getActiveVideo();
      const diag = [
        'url:' + (location.href !== origin.url ? 'diff' : 'same'),
        'el:' + (vNow !== origin.el ? 'diff' : 'same'),
        'src:' + ((vNow?.currentSrc || vNow?.src || '') !== origin.src ? 'diff' : 'same')
      ].join(';');
      log('advance fail diagnostics:', diag);
      try {
        window.__anLog && window.__anLog('nav', '❌ Đã thử hết các cách nhưng không chuyển được clip (' + diag + ')');
        window.__anNoteFeature && window.__anNoteFeature('nav', false, 'Tự chuyển clip liên tục thất bại');
      } catch {}
    } finally {
      advancing = false;
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function forceNoLoop(video) {
    if (!siteEnabled() || !pageIsRelevant()) return;
    if (window.__anLoopHold) return;
    try {
      if (video.loop) {
        video.loop = false;
        video.removeAttribute('loop');
        log('forced loop off');
      }
    } catch {}
  }

  // ---------- livestream guard ----------
  // Không auto-next khi đang xem livestream: video live có duration = Infinity,
  // hoặc duration hữu hạn nhưng LỚN DẦN theo thời gian (kiểu Facebook Live).
  // Chỉ chặn chuyển TỰ ĐỘNG — bấm nút/phím tắt chuyển clip vẫn hoạt động.
  const liveDurMap = new WeakMap();
  function isLiveVideo(video) {
    if (!video) return false;
    const dur = video.duration;
    if (dur === Infinity) return true;
    const src = video.currentSrc || video.src || '';
    let st = liveDurMap.get(video);
    if (!st || st.src !== src) {
      st = { src, dur: isFinite(dur) ? dur : 0, grow: 0, live: false };
      liveDurMap.set(video, st);
      return false;
    }
    if (st.live) return true;
    if (isFinite(dur) && dur > st.dur + 1.5) st.grow++;
    if (isFinite(dur)) st.dur = Math.max(st.dur, dur);
    if (st.grow >= 2) {
      st.live = true;
      log('live video detected - auto-next paused');
      return true;
    }
    return false;
  }

  function nearEndCheck(video) {
    if (!video || !isFinite(video.duration) || video.duration <= 0) return;
    // Đang xem livestream — không tự lướt (đồng thời cập nhật bộ theo dõi live).
    if (isLiveVideo(video)) return;
    // Video đang tạm dừng giữa chừng (ví dụ người dùng dừng ở giây cuối để
    // đọc chữ) — không tự lướt. Clip hết thật sự đã có sự kiện 'ended' lo.
    if (video.paused && !video.ended) return;
    const remaining = video.duration - video.currentTime;
    const hidden = document.visibilityState === 'hidden';
    // Foreground: wait for the true end (tiny threshold) so we never cut a clip
    // short (the TikTok jumps-early bug). The real 'ended' event does the work.
    // Hidden tab: allow a slightly larger threshold as a safety net for throttling.
    let thresholdSec = (hidden ? settings.hiddenEndThresholdMs : settings.visibleEndThresholdMs) / 1000;
    // Tùy chọn ± giây: âm = chuyển sớm N giây trước khi hết clip. Chặn trần
    // ở 50% thời lượng để clip ngắn không bị lướt ngay khi vừa vào.
    const off = Number(settings.endOffset) || 0;
    if (off < 0) thresholdSec = Math.max(thresholdSec, Math.min(-off, video.duration * 0.5));
    if (remaining <= thresholdSec) {
      triggerEnded(video, hidden ? 'near-end-hidden' : 'near-end');
    }
  }

  // Detects a loop wrap: the clip played to (near) the end and then jumped
  // back to the start while still playing. That means the clip FINISHED but the
  // site re-looped it instead of firing 'ended'. This is what caused Facebook
  // Reels to replay for a few seconds before advancing. We advance immediately.
  function loopWrapCheck(video) {
    const dur = video.duration;
    const src = video.currentSrc || video.src || '';
    const prev = lastTimeMap.get(video);
    const now = video.currentTime;
    lastTimeMap.set(video, { src, t: now });
    // TikTok/Facebook tái dùng cùng thẻ <video> và chỉ đổi src khi sang clip
    // mới: currentTime nhảy từ cuối clip cũ về 0 trông HỆT như loop-wrap.
    // So sánh src để không skip oan clip mới (lỗi "chưa hết đã lướt").
    if (!prev || typeof prev !== 'object' || prev.src !== src) return;
    if (!isFinite(dur) || dur <= 1.2) return; // too short to judge reliably
    if (video.paused) return;
    const wasNearEnd = prev.t > dur - 0.6;
    const jumpedToStart = now < Math.min(0.6, dur * 0.3);
    const bigBackJump = prev.t - now > 0.6;
    if (wasNearEnd && jumpedToStart && bigBackJump) {
      triggerEnded(video, 'loop-wrap');
    }
  }

  function triggerEnded(video, reason) {
    // Chỉ clip ĐANG XEM mới được phép kéo cả trang sang clip kh��c — video
    // preview/chạy nền nhỏ kết thúc không được tính (lỗi "chưa hết đã lướt").
    if (video !== getActiveVideo()) return;
    // Đang xem livestream — không tự chuyển đi đâu cả.
    if (isLiveVideo(video)) return;
    // Sự kiện 'ended' LẠC: trang tái dùng thẻ <video> và đổi src khi sang
    // clip mới — lúc chuyển tiếp có thể bắn 'ended' dù clip MỚI đang phát.
    // Chỉ tin khi trạng thái video.ended thật sự là true.
    if (reason === 'ended' && !video.ended) return;
    // Clip VỪA vào (dưới ~0,9s) không thể "hết" ngay — near-end/loop-wrap lúc
    // này là tàn dư của clip trước trên thẻ <video> tái dùng → bỏ qua.
    if (reason !== 'ended' && Date.now() - lastEntryAt < 900) return;
    // Đang quay lại sau khi lướt quá đà — không chuyển tiếp.
    if (Date.now() < rollbackHoldUntil) return;
    const key = `${Math.floor(video.duration || 0)}:${video.currentSrc || video.src || 'na'}`;
    const last = endedGuard.get(video);
    if (last === key && advancedRecently()) return;
    endedGuard.set(video, key);
    // Tùy chọn ± giây: dương = đợi thêm N giây sau khi clip hết rồi mới chuyển.
    const off = Number(settings.endOffset) || 0;
    if (off > 0) {
      if (endDelayTimer && endDelayKey === key) return; // đã hẹn giờ cho clip này
      clearTimeout(endDelayTimer);
      endDelayKey = key;
      endDelayTimer = setTimeout(() => {
        endDelayTimer = null;
        endDelayKey = null;
        if (advancedRecently() || !siteEnabled() || !pageIsRelevant()) return;
        const v = getActiveVideo();
        goNext(v || video, reason);
      }, Math.min(off, 30) * 1000);
      return;
    }
    goNext(video, reason);
  }

  function watchVideo(video) {
    if (!video || seenVideos.has(video)) return;
    seenVideos.add(video);
    log('watching video', video);

    const noLoop = () => forceNoLoop(video);
    noLoop();
    video.addEventListener('loadedmetadata', noLoop, { passive: true });
    video.addEventListener('play', noLoop, { passive: true });
    video.addEventListener('playing', noLoop, { passive: true });

    // Primary, precise trigger: the real end of the clip (works once loop is off).
    video.addEventListener('ended', () => triggerEnded(video, 'ended'), { passive: true });

    // Clip lỗi (nguồn hỏng/không tải được) — chờ 2,5s cho trang tự thử lại,
    // vẫn lỗi thì tự lướt qua thay vì đứng im.
    video.addEventListener('error', () => {
      if (!siteEnabled() || !pageIsRelevant()) return;
      if (window.__anLoopHold || window.__anFavPlayback) return;
      setTimeout(() => {
        if (!video.error || getActiveVideo() !== video) return;
        log('video error, skipping');
        goNext(video, 'error-skip');
      }, 2500);
    }, { passive: true });

    // Theo dõi buffering cho cơ chế hoãn tự lướt khi mạng chậm.
    video.addEventListener('waiting', () => bufferingSince.set(video, Date.now()), { passive: true });
    video.addEventListener('stalled', () => bufferingSince.set(video, Date.now()), { passive: true });
    video.addEventListener('playing', () => bufferingSince.delete(video), { passive: true });
    video.addEventListener('canplaythrough', () => bufferingSince.delete(video), { passive: true });

    video.addEventListener(
      'timeupdate',
      () => {
        if (!siteEnabled() || !pageIsRelevant()) return;
        noLoop();
        loopWrapCheck(video);
        nearEndCheck(video);
      },
      { passive: true }
    );
  }

  function scanVideos() {
    document.querySelectorAll('video').forEach(watchVideo);
  }

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) scanVideos();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  function urlTick() {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      log('url changed', currentUrl);
      scanVideos();
      handleClipEntry();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scanVideos();
      // Quay lại tab → về ngay nhịp nhanh, không đợi hết nhịp tiết kiệm pin.
      clearTimeout(tickTimer);
      scheduleTick();
    }
  });

  window.addEventListener('pageshow', scanVideos);
  scanVideos();
  handleClipEntry();

  function rescanTick() {
    if (!siteEnabled() || !pageIsRelevant()) return;
    scanVideos();
    // TikTok trang For You có lúc KHÔNG đổi URL khi sang clip mới — dò theo
    // ID clip để các bước vào-clip (seen/marathon/chặn/quảng cáo) vẫn chạy
    // đúng từng clip. Đã có chốt chặn lastEntryId nên không xử lý trùng.
    const cid = currentClipId();
    if (cid !== lastEntryId) {
      // Chống ID "nhấp nháy" lúc chuyển cảnh (2 video cùng phát, DOM đang
      // thay thẻ): chỉ nhận clip mới khi ID đứng yên qua 2 nhịp quét liên tiếp.
      if (cid && cid === pendingEntryId) { pendingEntryId = null; handleClipEntry(); }
      else pendingEntryId = cid;
    } else {
      pendingEntryId = null;
    }
    const video = getActiveVideo();
    if (video) {
      forceNoLoop(video);
      introSkipCheck(video);
      durationCheck(video);
      blockCheck();
      nearEndCheck(video);
      watchdogCheck(video);
      copyrightSkipCheck(video);
    }
  }

  // Tự động lướt qua video bị tắt tiếng do bản quyền (Copyright Muted Skip)
  function isCopyrightMuted() {
    if (!settings.copyrightMutedSkip) return false;
    try {
      if (isTikTok) {
        const soundEl = document.querySelector('[data-e2e="video-sound-desc"], [class*="DivMusicText"]');
        if (soundEl) {
          const txt = (soundEl.textContent || '').toLowerCase();
          if (txt.includes('not available') || txt.includes('không khả dụng') || txt.includes('copyright') || txt.includes('bản quyền') || txt.includes('sound removed') || txt.includes('đã bị tắt tiếng')) {
            return true;
          }
        }
        const warnBanner = document.querySelector('[class*="DivMuteIconContainer"], [data-e2e="video-music-mute-notice"]');
        if (warnBanner) return true;
      } else if (isFacebook) {
        const overlays = Array.from(document.querySelectorAll('div[data-pagelet*="Reel"] span[dir="auto"], [role="main"] span[dir="auto"]'));
        for (const el of overlays) {
          const txt = (el.textContent || '').toLowerCase();
          if (txt.includes('âm thanh này không khả dụng') || txt.includes('audio is no longer available') || txt.includes('tắt tiếng do bản quyền') || txt.includes('muted due to copyright')) {
            return true;
          }
        }
      } else if (isInstagram) {
        const audioNotes = Array.from(document.querySelectorAll('span, div[role="button"] span'));
        for (const el of audioNotes) {
          const txt = (el.textContent || '').toLowerCase();
          if (txt.includes('âm thanh này hiện không khả dụng') || txt.includes('audio unavailable') || txt.includes('song is currently unavailable')) {
            return true;
          }
        }
      }
    } catch {}
    return false;
  }

  let lastCopyrightSkipAt = 0;
  function copyrightSkipCheck(video) {
    if (!settings.copyrightMutedSkip || advancing || window.__anLoopHold || window.__anFavPlayback) return;
    if (Date.now() - lastCopyrightSkipAt < 4000) return;
    if (video && !video.paused && video.currentTime >= 0.8 && isCopyrightMuted()) {
      lastCopyrightSkipAt = Date.now();
      goNext(video, 'copyright-audio-skip');
    }
  }

  // Watchdog Timer chống kẹt video (Video Buffering / Stalled / Freeze Rescue)
  let watchdogLastTime = 0;
  let watchdogLastSrc = '';
  let watchdogStuckSince = 0;

  function watchdogCheck(v) {
    if (!settings.enabled || !siteEnabled() || !pageIsRelevant()) return;
    if (advancing || window.__anLoopHold || window.__anFavPlayback || isTyping()) {
      watchdogStuckSince = 0;
      return;
    }
    if (!v || v.paused || v.ended || isLiveVideo(v)) {
      watchdogStuckSince = 0;
      return;
    }

    const src = v.currentSrc || v.src || '';
    const nowT = v.currentTime;
    const nowReal = Date.now();

    // Nếu chuyển sang video mới hoặc src đổi, hoặc currentTime có tiến triển thì reset mốc
    if (src !== watchdogLastSrc || Math.abs(nowT - watchdogLastTime) > 0.4) {
      watchdogLastSrc = src;
      watchdogLastTime = nowT;
      watchdogStuckSince = 0;
      return;
    }

    // Video đang unpaused nhưng currentTime không nhích trong hơn 10 giây
    if (!watchdogStuckSince) {
      watchdogStuckSince = nowReal;
      return;
    }

    if (nowReal - watchdogStuckSince >= 10000) {
      log('watchdog: video stuck for 10s — rescuing');
      watchdogStuckSince = 0;
      try {
        window.__anLog && window.__anLog('warn', '⚠️ Video bị đứng/quay vòng quá 10s — tự động chuyển tiếp cứu hộ');
      } catch {}
      goNext(v, 'watchdog-rescue');
    }
  }
  // Bộ lập lịch hợp nhất (tiết kiệm CPU/pin): gộp dò URL (trước: 500ms) và
  // quét định kỳ (trước: 700ms) vào MỘT nhịp 600ms. Tab ẩn mà video không
  // phát (không dùng Phát nền) thì giãn xuống 2000ms — máy nhẹ hơn mà không
  // ảnh hưởng tính năng, vì mọi kiểm tra đều gắn với video đang phát.
  let tickTimer = 0;
  function scheduleTick() {
    let idle = false;
    if (document.hidden) {
      const v = getActiveVideo();
      idle = !v || v.paused;
    }
    tickTimer = setTimeout(() => {
      try {
        urlTick();
        if (!idle || !document.hidden) rescanTick();
      } catch {}
      scheduleTick();
    }, idle ? 4000 : 600);
  }
  scheduleTick();

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    clearTimeout(tickTimer);
  });

  window.__autoNextApi = {
    getActiveVideo,
    next: () => goNext(getActiveVideo(), 'manual'),
    setLoopHold: (on) => { window.__anLoopHold = !!on; },
    isTyping,
    visibleArea,
    realClick,
    clipId: currentClipId,
    clipUrl: currentClipUrl,
    author: currentAuthor
  };

  log('content script ready on', host);
})();
