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
  introSkip: 0,
  endOffset: -0.5,
  bulkLimit: 100,
  fileTemplate: '',
  remoteBlocklistUrl: '',
  copyrightMutedSkip: false,
  showSkipBadge: true,
  debug: false
};

const SUPPORTED_TAB_PATTERNS = [
  'https://www.facebook.com/*',
  'https://m.facebook.com/*',
  'https://facebook.com/*',
  'https://www.instagram.com/*',
  'https://www.tiktok.com/*',
  'https://m.tiktok.com/*',
  'https://www.youtube.com/*',
  'https://m.youtube.com/*',
  'https://x.com/*',
  'https://twitter.com/*'
];

const tabState = new Map();

let debugEnabled = false;
chrome.storage.sync.get({ debug: false }, (s) => { debugEnabled = !!s.debug; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.debug) debugEnabled = !!changes.debug.newValue;
  // Keep the badge in sync when the master switch is toggled from the popup.
  if (changes.enabled) {
    chrome.tabs.query({ url: SUPPORTED_TAB_PATTERNS }, (tabs) => {
      void chrome.runtime.lastError;
      for (const tab of tabs || []) {
        if (typeof tab.id === 'number' && isSupportedUrl(tab.url || '')) refreshBadge(tab.id);
      }
    });
  }
});
function log(...args) {
  if (debugEnabled) console.log('[AutoNext]', ...args);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function isAllowedDownloadUrl(raw) {
  try {
    const u = new URL(String(raw || ''));
    if (u.protocol !== 'https:') return false;
    return /(^|\.)(fbcdn\.net|facebook\.com|cdninstagram\.com|instagram\.com|tiktokcdn[\w-]*\.com|tiktokv\.com|tiktok\.com|ttwstatic\.com|googlevideo\.com|ytimg\.com|youtube\.com|twimg\.com|x\.com|twitter\.com)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

// Runs in the page's MAIN world (injected via chrome.scripting). While ON it
// makes the page believe the tab is always visible, so the site doesn't pause
// the video when you switch tabs. Extension content scripts are unaffected
// because isolated worlds keep their own prototypes.
function setBackgroundPlayInPage(on) {
  const w = window;
  w.__anBgPlayOn = !!on;
  if (w.__anBgPlayInstalled || !on) return;
  w.__anBgPlayInstalled = true;
  const visDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  const hidDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  if (visDesc && visDesc.get) {
    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true,
      get() {
        return w.__anBgPlayOn ? 'visible' : visDesc.get.call(this);
      }
    });
  }
  if (hidDesc && hidDesc.get) {
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get() {
        return w.__anBgPlayOn ? false : hidDesc.get.call(this);
      }
    });
  }
  const swallow = (e) => {
    if (w.__anBgPlayOn) e.stopImmediatePropagation();
  };
  window.addEventListener('visibilitychange', swallow, true);
  window.addEventListener('webkitvisibilitychange', swallow, true);
  window.addEventListener('blur', swallow, true);
  window.addEventListener('pagehide', swallow, true);
}

function isSupportedUrl(url = '') {
  return /https?:\/\/(www\.|m\.)?(facebook\.com\/reel|facebook\.com\/reels|instagram\.com\/(reels?|p)|tiktok\.com\/|youtube\.com\/shorts|(x|twitter)\.com\/(i\/videos|.*\/status))/i.test(url);
}

function ensureState(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, {
      enabled: true,
      url: '',
      lastPing: 0,
      lastActionAt: 0,
      injectedAt: 0,
      reconnects: 0
    });
  }
  return tabState.get(tabId);
}

async function refreshBadge(tabId) {
  const settings = await getSettings();
  const enabled = !!settings.enabled;
  await chrome.action.setBadgeText({ tabId, text: enabled ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? '#16a34a' : '#6b7280' });
}

async function injectIntoTab(tabId) {
  const settings = await getSettings();
  if (!settings.enabled) return;
  const state = ensureState(tabId);
  if (!state.url || !isSupportedUrl(state.url)) return;
  const now = Date.now();
  if (now - state.injectedAt < 1500) return;
  state.injectedAt = now;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'AUTONEXT_CONFIG', settings });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        files: ['content.js', 'features.js']
      });
    } catch (err) {
      log('inject failed', err);
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // Clean up settings from older versions that are no longer used.
  await chrome.storage.sync
    .remove(['smartDelayMs', 'nextButtonPollMs', 'cooldownMs', 'maxRetries', 'retryIntervalMs'])
    .catch(() => {});
  const stored = await chrome.storage.sync.get(null);
  if (Object.keys(stored).length === 0) {
    await chrome.storage.sync.set(DEFAULTS);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const state = ensureState(tabId);
  if (tab?.url) state.url = tab.url;
  if (changeInfo.url) state.url = changeInfo.url;
  if (state.url && isSupportedUrl(state.url)) {
    await refreshBadge(tabId);
    await injectIntoTab(tabId);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return;
  const state = ensureState(tabId);
  state.url = tab.url;
  if (isSupportedUrl(tab.url)) {
    await refreshBadge(tabId);
    await injectIntoTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'AUTONEXT_PING') {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        const state = ensureState(tabId);
        state.lastPing = Date.now();
        if (sender.tab?.url) state.url = sender.tab.url;
        await refreshBadge(tabId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AUTONEXT_GOTO_NEXT') {
      const tabId = sender.tab?.id;
      const state = typeof tabId === 'number' ? ensureState(tabId) : null;
      const now = Date.now();
      if (state && now - state.lastActionAt < 800) {
        sendResponse({ ok: true, skipped: true });
        return;
      }
      if (state) state.lastActionAt = now;
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AUTONEXT_LOG') {
      log(message.payload);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AUTONEXT_BGPLAY') {
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false });
        return;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: setBackgroundPlayInPage,
          args: [!!message.on]
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }

    if (message?.type === 'AUTONEXT_DOWNLOAD') {
      if (!isAllowedDownloadUrl(message.url)) {
        sendResponse({ ok: false, error: 'blocked-url' });
        return;
      }
      try {
        chrome.downloads.download(
          { url: message.url, filename: message.filename || undefined, saveAs: false },
          (id) => {
            const err = chrome.runtime.lastError;
            sendResponse({ ok: !err && typeof id === 'number', id, error: err && err.message });
          }
        );
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return;
    }

    async function waitTabComplete(tabId, timeoutMs = 9000) {
      await new Promise((resolve) => {
        let timer = null;
        const listener = (tid, info) => {
          if (tid === tabId && info.status === 'complete') {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        timer = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, timeoutMs);
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    if (message?.type === 'AUTONEXT_FETCH_REMOTE_BLOCKLIST') {
      try {
        const u = new URL(message.url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
          sendResponse({ ok: false, error: 'Chỉ chấp nhận link HTTP/HTTPS' });
          return;
        }
        const resp = await fetch(u.toString(), { cache: 'no-cache' });
        if (!resp.ok) {
          sendResponse({ ok: false, error: 'HTTP ' + resp.status });
          return;
        }
        const text = await resp.text();
        const data = JSON.parse(text);
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
      return;
    }

    if (message?.type === 'AUTONEXT_FB_SYNC_BLOCKS') {
      let tabId = null;
      try {
        const tab = await chrome.tabs.create({ url: 'https://www.facebook.com/settings?tab=blocking', active: false });
        tabId = tab.id;
        await waitTabComplete(tabId, 9000);
        await new Promise(r => setTimeout(r, 1600));

        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const list = [];
            const dialog = document.querySelector('div[role="dialog"]') || document.body;
            const unblockBtns = Array.from(dialog.querySelectorAll('div[role="button"], button')).filter(b => {
              const t = (b.textContent || '').trim().toLowerCase();
              const a = (b.getAttribute('aria-label') || '').trim().toLowerCase();
              return t === 'bỏ chặn' || t === 'unblock' || a === 'bỏ chặn' || a === 'unblock';
            });

            for (const btn of unblockBtns) {
              let row = btn.parentElement;
              for (let i = 0; i < 4 && row && row !== dialog; i++) {
                const textNodes = Array.from(row.querySelectorAll('span[dir="auto"], div[dir="auto"]')).map(s => (s.textContent || '').trim()).filter(Boolean);
                if (textNodes.length >= 1) {
                  const name = textNodes[0];
                  if (name && name.toLowerCase() !== 'bỏ chặn' && !name.toLowerCase().includes('danh sách') && !name.toLowerCase().includes('chặn')) {
                    const subtitle = textNodes.length > 1 ? textNodes[1] : '';
                    const img = row.querySelector('image, img');
                    const avatar = img ? (img.getAttribute('xlink:href') || img.getAttribute('src') || '') : '';
                    if (!list.some(x => x.name === name)) {
                      list.push({ name, subtitle, avatar });
                    }
                    break;
                  }
                }
                if (row.getAttribute('role') === 'listitem') break;
                row = row.parentElement;
              }
            }

            return list;
          }
        });

        const items = (results && results[0] && results[0].result) || [];
        sendResponse({ ok: true, items });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      } finally {
        if (tabId) {
          try { chrome.tabs.remove(tabId); } catch {}
        }
      }
      return;
    }

    if (message?.type === 'AUTONEXT_FB_UNBLOCK') {
      let tabId = null;
      try {
        const targetName = (message.name || '').trim().toLowerCase();
        if (!targetName) {
          sendResponse({ ok: false, error: 'Thiếu tên tài khoản cần bỏ chặn' });
          return;
        }

        const tab = await chrome.tabs.create({ url: 'https://www.facebook.com/settings?tab=blocking', active: false });
        tabId = tab.id;
        await waitTabComplete(tabId, 9000);
        await new Promise(r => setTimeout(r, 1600));

        const res = await chrome.scripting.executeScript({
          target: { tabId },
          args: [targetName],
          func: async (nameToUnblock) => {
            const dialog = document.querySelector('div[role="dialog"]') || document.body;
            const unblockBtns = Array.from(dialog.querySelectorAll('div[role="button"], button')).filter(b => {
              const t = (b.textContent || '').trim().toLowerCase();
              const a = (b.getAttribute('aria-label') || '').trim().toLowerCase();
              return t === 'bỏ chặn' || t === 'unblock' || a === 'bỏ chặn' || a === 'unblock';
            });

            let targetBtn = null;
            for (const btn of unblockBtns) {
              let row = btn.parentElement;
              for (let i = 0; i < 4 && row && row !== dialog; i++) {
                const textNodes = Array.from(row.querySelectorAll('span[dir="auto"], div[dir="auto"]')).map(s => (s.textContent || '').trim().toLowerCase());
                if (textNodes.some(n => n === nameToUnblock || (nameToUnblock.length >= 4 && n.includes(nameToUnblock)))) {
                  targetBtn = btn;
                  break;
                }
                if (row.getAttribute('role') === 'listitem') break;
                row = row.parentElement;
              }
              if (targetBtn) break;
            }

            if (!targetBtn) return { ok: false, error: 'Không tìm thấy nút Bỏ chặn cho ' + nameToUnblock };

            targetBtn.click();
            let confirmed = false;
            for (let w = 0; w < 15; w++) {
              await new Promise(r => setTimeout(r, 100));
              const confirmDlgs = Array.from(document.querySelectorAll('div[role="dialog"]'));
              for (const dlg of confirmDlgs) {
                const cBtns = Array.from(dlg.querySelectorAll('div[role="button"], button'));
                for (const cb of cBtns) {
                  const t = (cb.textContent || '').trim().toLowerCase();
                  const a = (cb.getAttribute('aria-label') || '').trim().toLowerCase();
                  if (t === 'xác nhận' || t === 'confirm' || a === 'xác nhận' || a === 'confirm') {
                    cb.click();
                    confirmed = true;
                    await new Promise(r => setTimeout(r, 600));
                    return { ok: true };
                  }
                }
              }
            }
            return { ok: confirmed, error: confirmed ? null : 'Không tìm thấy nút Xác nhận bỏ chặn của Facebook' };
          }
        });

        const outcome = res && res[0] && res[0].result;
        sendResponse(outcome || { ok: false, error: 'Thao tác không thành công' });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      } finally {
        if (tabId) {
          try { chrome.tabs.remove(tabId); } catch {}
        }
      }
      return;
    }

    sendResponse({ ok: false });
  })();
  return true;
});
