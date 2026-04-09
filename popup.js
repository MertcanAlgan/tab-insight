/**
 * Tab Insight - popup.js
 */

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    tabsList: document.getElementById('tabsList'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    mediaPanel: document.getElementById('mediaPanel'),
    mediaList: document.getElementById('mediaList'),
    mediaEmpty: document.getElementById('mediaEmpty'),
    mediaSubtitle: document.getElementById('mediaSubtitle'),
    totalTabsCounter: document.getElementById('totalTabsCounter'),
    inactiveTabsBadge: document.getElementById('inactiveTabsBadge'),
    tabTemplate: document.getElementById('tabTemplate'),
    groupTemplate: document.getElementById('groupTemplate'),
    sortSelect: document.getElementById('sortSelect'),
    cleanupBtn: document.getElementById('cleanupBtn'),
    cleanupMenu: document.getElementById('cleanupMenu'),
    closeInactiveBtn: document.getElementById('closeInactiveBtn'),
    closeAllBtn: document.getElementById('closeAllBtn'),
    suspendInactiveBtn: document.getElementById('suspendInactiveBtn'),
    closeDuplicatesBtn: document.getElementById('closeDuplicatesBtn'),
    autoGroupBtn: document.getElementById('autoGroupBtn'),
    saveSnapshotBtn: document.getElementById('saveSnapshotBtn'),
    restoreSnapshotBtn: document.getElementById('restoreSnapshotBtn'),
    toggleSidePanelModeBtn: document.getElementById('toggleSidePanelModeBtn'),
    sidePanelModeLabel: document.getElementById('sidePanelModeLabel'),
    langMenuBtn: document.getElementById('langMenuBtn'),
    langMenu: document.getElementById('langMenu'),
    currentLangLabel: document.getElementById('currentLangLabel')
  };

  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'zh', name: '简体中文' },
    { code: 'es', name: 'Español' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'fr', name: 'Français' },
    { code: 'ar', name: 'العربية' },
    { code: 'bn', name: 'বাংলা' },
    { code: 'pt', name: 'Português' },
    { code: 'ru', name: 'Русский' },
    { code: 'ur', name: 'اردو' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ja', name: '日本語' },
    { code: 'mr', name: 'मराठी' },
    { code: 'te', name: 'తెలుగు' },
    { code: 'ta', name: 'தமிழ்' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'tl', name: 'Filipino' },
    { code: 'ko', name: '한국어' },
    { code: 'it', name: 'Italiano' }
  ];

  let allTabs = [];
  let creationTimes = {};
  let tabGroups = {};
  let whitelist = [];
  let currentSort = 'newest';
  let currentMessages = {};
  let currentLang = 'en';

  const CLEANUP_THRESHOLD_MS = 15 * 60 * 1000;
  const GROUP_COLORS = {
    grey: "#bdc1c6", blue: "#8ab4f8", red: "#f28b82", yellow: "#fdd663",
    green: "#81c995", pink: "#ff8bcb", purple: "#d7aefb", cyan: "#78d9eb", orange: "#fcad70"
  };

  const formatExecuteScriptError = (e) => {
    try {
      if (!e) return 'Unknown error';
      if (typeof e === 'string') return e;
      if (e instanceof Error) return e.message || String(e);
      if (typeof e.message === 'string') return e.message;
      return JSON.stringify(e);
    } catch (_) {
      return String(e);
    }
  };

  const safeExecuteInTab = async (tabId, func, args = []) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
      });
      return true;
    } catch (e) {
      console.warn('executeScript failed', {
        tabId,
        error: formatExecuteScriptError(e),
        raw: e
      });
      return false;
    }
  };

  const executeInTabResult = async (tabId, func, args = []) => {
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
      });
      return res?.[0]?.result ?? null;
    } catch (e) {
      console.warn('executeScript failed', {
        tabId,
        error: formatExecuteScriptError(e),
        raw: e
      });
      return null;
    }
  };

  const mediaTogglePlayPauseInPage = () => {
    const els = Array.from(document.querySelectorAll('audio, video'));
    let acted = false;
    for (const el of els) {
      if (!el) continue;
      try {
        if (el.paused) {
          const p = el.play?.();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else {
          el.pause?.();
        }
        acted = true;
      } catch (_) {}
    }
    return acted;
  };

  const mediaSetVolumeInPage = (volume01) => {
    const v = Math.max(0, Math.min(1, Number(volume01)));
    const els = Array.from(document.querySelectorAll('audio, video'));
    let acted = false;
    for (const el of els) {
      if (!el) continue;
      try {
        el.volume = v;
        acted = true;
      } catch (_) {}
    }
    return acted;
  };

  const mediaGetVolumeInPage = () => {
    const el = document.querySelector('audio, video');
    const v = el && typeof el.volume === 'number' ? el.volume : null;
    return v;
  };

  const mediaHasPlayingInPage = () => {
    const els = Array.from(document.querySelectorAll('audio, video'));
    for (const el of els) {
      try {
        if (!el) continue;
        // Heuristic: playing if not paused and has data
        if (!el.paused && !el.ended && (el.readyState || 0) >= 2) return true;
      } catch (_) {}
    }
    return false;
  };

  const renderMediaTabs = async () => {
    if (!elements.mediaList || !elements.mediaEmpty) return;
    try {
      // Note: `audible` is the best signal, but can miss tabs (muted or some players).
      // We augment it by probing for actively playing <audio>/<video>.
      const all = await chrome.tabs.query({});
      const candidates = all.filter(t =>
        typeof t.id === 'number' &&
        t.url &&
        !t.url.startsWith('chrome://') &&
        !t.url.startsWith('chrome-extension://')
      );

      const audibleTabs = candidates.filter(t => t.audible);
      const maybePlayingTabs = candidates.filter(t => !t.audible);

      // Probe non-audible tabs for HTML media playback (best effort).
      const playingResults = await Promise.all(
        maybePlayingTabs.map(async (t) => ({
          tab: t,
          playing: await executeInTabResult(t.id, mediaHasPlayingInPage, [])
        }))
      );

      const playingTabs = playingResults
        .filter(r => r.playing === true)
        .map(r => r.tab);

      const dedup = new Map();
      [...audibleTabs, ...playingTabs].forEach(t => dedup.set(t.id, t));
      const mediaTabs = Array.from(dedup.values())
        .sort((a, b) => (creationTimes[`creationTime_${b.id}`] || 0) - (creationTimes[`creationTime_${a.id}`] || 0));

      elements.mediaList.innerHTML = '';

      if (mediaTabs.length === 0) {
        // Hide the entire panel when nothing is playing
        if (elements.mediaPanel) elements.mediaPanel.style.display = 'none';
        return;
      }
      if (elements.mediaPanel) elements.mediaPanel.style.display = 'block';
      elements.mediaEmpty.style.display = 'none';
      if (elements.mediaSubtitle) {
        elements.mediaSubtitle.textContent = `${mediaTabs.length} tab`;
      }

      for (const tab of mediaTabs) {
        const item = document.createElement('div');
        item.className = 'media-item';

        const btnClose = document.createElement('button');
        btnClose.className = 'media-close-btn';
        btnClose.title = 'Close tab';
        btnClose.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        btnClose.addEventListener('click', async (e) => {
          e.stopPropagation();
          await ensureOneTabExists(1);
          await chrome.tabs.remove(tab.id);
          await renderMediaTabs();
          await init();
        });

        const left = document.createElement('div');
        left.className = 'media-left';

        const fav = document.createElement('img');
        fav.className = 'media-favicon';
        fav.src = tab.favIconUrl || 'icons/icon16.png';
        fav.alt = '';
        fav.onerror = (e) => (e.target.src = 'icons/icon16.png');

        const title = document.createElement('div');
        title.className = 'media-tab-title';
        title.textContent = tab.title || 'Untitled';
        title.title = tab.url || tab.title || '';
        title.addEventListener('click', async () => {
          await chrome.tabs.update(tab.id, { active: true });
          await chrome.windows.update(tab.windowId, { focused: true });
        });

        left.appendChild(fav);
        left.appendChild(title);

        const muted = !!tab.mutedInfo?.muted;
        const mutedChip = document.createElement('div');
        mutedChip.className = 'media-muted-indicator';
        mutedChip.textContent = muted ? 'MUTED' : 'LIVE';

        const flashChip = (text) => {
          const prev = mutedChip.textContent;
          mutedChip.textContent = text;
          setTimeout(() => {
            // Keep in sync if tab state changed meanwhile
            mutedChip.textContent = muted ? 'MUTED' : 'LIVE';
          }, 1200);
        };

        // Volume (0-100). Try to read from page; fallback to stored per-tab or 100.
        let initialVol = 100;
        try {
          const key = `mediaVol_${tab.id}`;
          const stored = await chrome.storage.local.get(key);
          if (typeof stored[key] === 'number') initialVol = stored[key];
          const v01 = await executeInTabResult(tab.id, mediaGetVolumeInPage, []);
          if (typeof v01 === 'number' && Number.isFinite(v01)) {
            initialVol = Math.round(Math.max(0, Math.min(1, v01)) * 100);
          }
        } catch (_) {
          // ignore; keep fallback
        }

        const volWrap = document.createElement('div');
        volWrap.className = 'media-volume';
        volWrap.title = 'Volume';
        volWrap.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
        `;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '1';
        slider.value = String(initialVol);
        slider.setAttribute('aria-label', 'Volume');
        slider.addEventListener('input', async (e) => {
          e.stopPropagation();
          const v = Number(slider.value);
          const key = `mediaVol_${tab.id}`;
          await chrome.storage.local.set({ [key]: v });
          const acted = await executeInTabResult(tab.id, mediaSetVolumeInPage, [v / 100]);
          if (acted === false) {
            // Page has no HTMLMediaElement audio/video, or it blocked access
            flashChip('NO MEDIA');
          } else if (acted === null) {
            // injection failed (restricted page, permissions, etc.)
            flashChip('BLOCKED');
          }
        });
        volWrap.appendChild(slider);

        const controls = document.createElement('div');
        controls.className = 'media-controls';

        const muteWrap = document.createElement('div');
        muteWrap.className = 'media-mute-wrap';

        const btnMute = document.createElement('button');
        btnMute.className = 'media-btn';
        btnMute.title = muted ? 'Unmute tab' : 'Mute tab';
        btnMute.innerHTML = muted
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M23 9l-6 6"></path><path d="M17 9l6 6"></path></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
        btnMute.addEventListener('click', async (e) => {
          e.stopPropagation();
          await chrome.tabs.update(tab.id, { muted: !muted });
          await renderMediaTabs();
        });

        // Show volume only on hover/focus of mute button area
        muteWrap.appendChild(btnMute);
        muteWrap.appendChild(volWrap);

        // Some popup environments are flaky with pure :hover; mirror it with JS.
        muteWrap.addEventListener('mouseenter', () => muteWrap.classList.add('show-volume'));
        muteWrap.addEventListener('mouseleave', () => muteWrap.classList.remove('show-volume'));
        muteWrap.addEventListener('focusin', () => muteWrap.classList.add('show-volume'));
        muteWrap.addEventListener('focusout', () => muteWrap.classList.remove('show-volume'));

        const btnToggle = document.createElement('button');
        btnToggle.className = 'media-btn';
        btnToggle.title = 'Play/Pause';
        btnToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
        btnToggle.addEventListener('click', async (e) => {
          e.stopPropagation();
          await safeExecuteInTab(tab.id, mediaTogglePlayPauseInPage, []);
        });

        controls.appendChild(muteWrap);
        controls.appendChild(btnToggle);

        item.appendChild(btnClose);
        item.appendChild(left);
        item.appendChild(mutedChip);
        item.appendChild(controls);

        elements.mediaList.appendChild(item);
      }
    } catch (e) {
      console.warn('Failed to render media tabs', e);
      elements.mediaList.innerHTML = '';
      elements.mediaEmpty.style.display = 'block';
      elements.mediaEmpty.textContent = 'Media panel unavailable';
    }
  };

  const populateLangMenu = () => {
    if (!elements.langMenu) return;
    elements.langMenu.innerHTML = '';
    LANGUAGES.forEach(lang => {
      const btn = document.createElement('button');
      btn.className = `menu-item lang-item ${currentLang === lang.code ? 'active' : ''}`;
      btn.innerHTML = `
        <span>${lang.name}</span>
        <span class="lang-code">${lang.code}</span>
      `;
      btn.addEventListener('click', () => {
        loadLanguage(lang.code);
        elements.langMenu.classList.remove('show');
      });
      elements.langMenu.appendChild(btn);
    });
  };

  const loadLanguage = async (lang) => {
    // Try to find the closest match or fallback to 'en'
    let code = LANGUAGES.find(l => lang.startsWith(l.code))?.code || 'en';
    try {
      const resp = await fetch(chrome.runtime.getURL(`_locales/${code}/messages.json`));
      currentMessages = await resp.json();
      currentLang = code;
      
      if (elements.currentLangLabel) {
        elements.currentLangLabel.textContent = code.toUpperCase();
      }
      
      await chrome.storage.local.set({ userLang: code });
      localize();
      populateLangMenu();
      if (allTabs.length > 0) { renderTabs(allTabs); updateStats(allTabs); }
    } catch (e) { 
      console.error(`Failed to load language: ${code}`, e);
      if (code !== 'en') loadLanguage('en');
    }
  };

  const T = (key, placeholders = []) => {
    const entry = currentMessages[key];
    if (!entry) return key;
    let msg = entry.message;
    placeholders.forEach((val, i) => {
      msg = msg.replace(`$${i + 1}`, val);
      msg = msg.replace(`$count$`, val);
    });
    return msg;
  };

  const localize = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = T(el.getAttribute('data-i18n'));
      if (val) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const val = T(el.getAttribute('data-i18n-placeholder'));
      if (val) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const val = T(el.getAttribute('data-i18n-title'));
      if (val) el.title = val;
    });
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '--:--';
    const s = Math.floor((Date.now() - timestamp) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const formatExactTime = (timestamp) => {
    if (!timestamp) return '--:--';
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getHostname = (url) => {
    try {
      if (!url) return '';
      if (!url.startsWith('http')) return url.split('/')[0] || '';
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  };

  const updateStats = (tabs) => {
    if (elements.totalTabsCounter) elements.totalTabsCounter.textContent = T('openTabs', [tabs.length.toString()]);
    
    const now = Date.now();
    const inactiveCount = tabs.filter(t => !t.active && (now - t.lastAccessed) > CLEANUP_THRESHOLD_MS).length;
    
    if (elements.inactiveTabsBadge) {
      if (inactiveCount > 0) {
        elements.inactiveTabsBadge.style.display = 'block';
        elements.inactiveTabsBadge.textContent = T('inactiveBadgeText', [inactiveCount.toString()]);
        if (elements.closeInactiveBtn) elements.closeInactiveBtn.disabled = false;
        if (elements.suspendInactiveBtn) elements.suspendInactiveBtn.disabled = false;
      } else {
        elements.inactiveTabsBadge.style.display = 'none';
        if (elements.closeInactiveBtn) elements.closeInactiveBtn.disabled = true;
        if (elements.suspendInactiveBtn) elements.suspendInactiveBtn.disabled = true;
      }
    }
  };

  const ensureOneTabExists = async (tabsAboutToCloseCount) => {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    if (currentTabs.length <= tabsAboutToCloseCount) {
      await chrome.tabs.create({ active: false });
    }
  };

  const createTabElement = (tab) => {
    const clone = elements.tabTemplate.content.cloneNode(true);
    const tabCard = clone.querySelector('.tab-item');
    const tabMain = clone.querySelector('.tab-main');
    const domain = getHostname(tab.url);
    const isWhitelisted = whitelist.includes(tab.url) || (domain && whitelist.includes(domain));
    const isDuplicate = allTabs.filter(t => t.url === tab.url).length > 1;

    if (isWhitelisted) tabCard.classList.add('whitelisted');
    if (tab.discarded) tabCard.classList.add('is-suspended');

    clone.querySelector('.tab-favicon').src = tab.favIconUrl || 'icons/icon16.png';
    clone.querySelector('.tab-favicon').onerror = (e) => e.target.src = 'icons/icon16.png';
    clone.querySelector('.tab-title').textContent = tab.title || 'Untitled';
    clone.querySelector('.tab-url').textContent = tab.url;
    
    if (tab.discarded) clone.querySelector('.suspended-badge').style.display = 'block';
    if (isDuplicate) clone.querySelector('.duplicate-badge').style.display = 'block';

    const createdTs = creationTimes[`creationTime_${tab.id}`];
    clone.querySelector('.opened-time').textContent = createdTs ? formatExactTime(createdTs) : '--:--';
    clone.querySelector('.inactive-time').textContent = tab.active ? T('activeNow') : (tab.lastAccessed ? formatTimeAgo(tab.lastAccessed) : T('activeNow'));

    const wBtn = clone.querySelector('.whitelist-tab');
    if (isWhitelisted) wBtn.classList.add('active');
    wBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = getHostname(tab.url);
      if (!domain) return;
      if (whitelist.includes(domain)) {
        whitelist = whitelist.filter(i => i !== domain);
      } else {
        whitelist.push(domain);
      }
      await chrome.storage.local.set({ whitelist });
      renderTabs(allTabs);
    });

    // Focus tab by clicking the row (except action buttons which stopPropagation)
    const focus = () => {
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    };
    if (tabMain) tabMain.addEventListener('click', focus);
    else tabCard.addEventListener('click', focus);

    clone.querySelector('.close-tab').addEventListener('click', async (e) => {
      e.stopPropagation();
      await ensureOneTabExists(1);
      chrome.tabs.remove(tab.id);
      tabCard.style.opacity = '0';
      tabCard.style.transform = 'scale(0.9)';
      setTimeout(() => {
        tabCard.remove();
        allTabs = allTabs.filter(t => t.id !== tab.id);
        updateStats(allTabs);
      }, 200);
    });
    return clone;
  };

  const renderTabs = async (tabsToRender) => {
    if (!elements.tabsList) return;
    elements.tabsList.innerHTML = '';
    if (tabsToRender.length === 0) {
      elements.tabsList.innerHTML = `<div class="loading"><p>${T('noTabs')}</p></div>`;
      return;
    }
    const sorted = [...tabsToRender].sort((a, b) => {
      const aC = creationTimes[`creationTime_${a.id}`] || 0;
      const bC = creationTimes[`creationTime_${b.id}`] || 0;
      switch (currentSort) {
        case 'newest': return bC - aC;
        case 'oldest': return aC - bC;
        case 'inactive':
          if (a.active) return 1; if (b.active) return -1;
          return (a.lastAccessed || 0) - (b.lastAccessed || 0);
        default: return 0;
      }
    });

    const groups = new Map();
    const ungrouped = [];
    sorted.forEach(t => {
      if (t.groupId !== -1 && tabGroups[t.groupId]) {
        if (!groups.has(t.groupId)) groups.set(t.groupId, []);
        groups.get(t.groupId).push(t);
      } else ungrouped.push(t);
    });

    groups.forEach((gTabs, gId) => {
      const gInfo = tabGroups[gId];
      const gClone = elements.groupTemplate.content.cloneNode(true);
      const gList = gClone.querySelector('.group-tabs-list');
      gClone.querySelector('.group-dot').style.backgroundColor = GROUP_COLORS[gInfo.color] || gInfo.color;
      gClone.querySelector('.group-title').textContent = gInfo.title || T('untitledGroup');
      gClone.querySelector('.group-count').textContent = T('tabsCount', [gTabs.length.toString()]);
      gTabs.forEach(t => gList.appendChild(createTabElement(t)));
      const header = gClone.querySelector('.group-header');
      header.addEventListener('click', () => {
        const collapsed = gList.style.display === 'none';
        gList.style.display = collapsed ? 'block' : 'none';
        header.querySelector('.collapse-group svg').style.transform = collapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
      });
      elements.tabsList.appendChild(gClone);
    });

    if (ungrouped.length > 0) {
      if (groups.size > 0) {
        const div = document.createElement('div');
        div.className = 'group-header';
        div.innerHTML = `<h2 class="group-title" style="opacity:0.5; font-size:0.75rem">${T('ungrouped')}</h2>`;
        elements.tabsList.appendChild(div);
      }
      ungrouped.forEach(t => elements.tabsList.appendChild(createTabElement(t)));
    }
  };

  const init = async () => {
    if (elements.tabsList) elements.tabsList.innerHTML = `<div class="loading"><div class="spinner"></div><p>${T('syncing')}</p></div>`;
    try {
      const pmGroups = chrome.tabGroups ? chrome.tabGroups.query({}) : Promise.resolve([]);
      const [tabs, grps] = await Promise.all([chrome.tabs.query({}), pmGroups]);
      allTabs = tabs;
      tabGroups = {};
      grps.forEach(g => tabGroups[g.id] = g);
      const storage = await chrome.storage.local.get(null);
      creationTimes = storage;
      whitelist = storage.whitelist || [];
      renderTabs(allTabs);
      updateStats(allTabs);
      await renderMediaTabs();
    } catch (e) {
      if (elements.tabsList) elements.tabsList.innerHTML = `<div class="error">${e.message}</div>`;
    }
  };

  const getPreferSidePanel = async () => {
    const s = await chrome.storage.local.get('preferSidePanel');
    return !!s.preferSidePanel;
  };

  const setPreferSidePanel = async (val) => {
    await chrome.storage.local.set({ preferSidePanel: !!val });
    // Help background cache update immediately (avoids timing issues on next click).
    try {
      chrome.runtime.sendMessage({ type: 'preferSidePanelUpdated', value: !!val });
    } catch (_) {}
  };

  const updateSidePanelModeLabel = async () => {
    if (!elements.sidePanelModeLabel) return;
    const enabled = await getPreferSidePanel();
    elements.sidePanelModeLabel.textContent = enabled ? 'Open as popup' : 'Open as side panel';
  };

  const openSidePanel = async () => {
    try {
      if (!chrome.sidePanel) {
        alert('Side panel not supported in this browser.');
        return;
      }
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        alert('Could not determine active tab.');
        return;
      }

      // Note: setOptions does NOT accept windowId; it is per-tab (or global) depending on Chrome version.
      await chrome.sidePanel.setOptions({
        tabId: activeTab.id,
        path: 'sidepanel.html',
        enabled: true
      });

      // Opening is also scoped; use tabId for best compatibility.
      await chrome.sidePanel.open({ tabId: activeTab.id });
    } catch (e) {
      console.warn('Failed to open side panel', e);
      alert('Could not open side panel.');
    }
  };

  const setActionPopupMode = async (preferSidePanel) => {
    // If preferSidePanel: disable popup so icon click becomes a user gesture
    // handled by chrome.action.onClicked in background.
    try {
      await chrome.action.setPopup({ popup: preferSidePanel ? '' : 'popup.html' });
    } catch (e) {
      console.warn('Failed to set action popup', e);
    }
  };

  elements.cleanupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.cleanupMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    elements.cleanupMenu.classList.remove('show');
  });

  elements.closeInactiveBtn.addEventListener('click', async () => {
    const now = Date.now();
    const toClose = allTabs.filter(t => !t.active && (now - t.lastAccessed) > CLEANUP_THRESHOLD_MS);
    if (toClose.length > 0 && confirm(T('cleanupConfirm', [toClose.length.toString()]))) {
      await ensureOneTabExists(toClose.length);
      const ids = toClose.map(t => t.id);
      await chrome.tabs.remove(ids);
      init();
    }
  });

  elements.closeAllBtn.addEventListener('click', async () => {
    if (confirm(T('closeAllConfirm'))) {
      await ensureOneTabExists(allTabs.length);
      const ids = allTabs.map(t => t.id);
      await chrome.tabs.remove(ids);
      init();
    }
  });

  elements.suspendInactiveBtn.addEventListener('click', async () => {
    const now = Date.now();
    const toSuspend = allTabs.filter(t => {
      if (t.active || t.discarded) return false;
      const domain = getHostname(t.url);
      if (domain && whitelist.includes(domain)) return false;
      return (now - t.lastAccessed) > CLEANUP_THRESHOLD_MS;
    });

    if (toSuspend.length > 0 && confirm(T('suspendConfirm', [toSuspend.length.toString()]))) {
      for (const t of toSuspend) {
        await chrome.tabs.discard(t.id);
      }
      init();
    }
  });

  elements.closeDuplicatesBtn.addEventListener('click', async () => {
    const seen = new Set();
    const toClose = [];
    allTabs.forEach(t => {
      const domain = getHostname(t.url);
      if (seen.has(t.url) && (!domain || !whitelist.includes(domain))) {
        toClose.push(t.id);
      } else {
        seen.add(t.url);
      }
    });

    if (toClose.length > 0 && confirm(T('cleanupConfirm', [toClose.length.toString()]))) {
      await chrome.tabs.remove(toClose);
      init();
    }
  });

  elements.autoGroupBtn.addEventListener('click', async () => {
    const domainGroups = {};
    allTabs.forEach(t => {
      const domain = getHostname(t.url);
      if (domain) {
        if (!domainGroups[domain]) domainGroups[domain] = [];
        domainGroups[domain].push(t.id);
      }
    });

    for (const [domain, ids] of Object.entries(domainGroups)) {
      if (ids.length > 1) {
        const groupId = await chrome.tabs.group({ tabIds: ids });
        await chrome.tabGroups.update(groupId, { title: domain });
      }
    }
    init();
    alert(T('groupsDone'));
  });

  elements.saveSnapshotBtn.addEventListener('click', async () => {
    const snapshot = allTabs.map(t => ({ url: t.url, pinned: t.pinned }));
    await chrome.storage.local.set({ lastSnapshot: snapshot });
    alert(T('snapshotSaved'));
  });

  elements.restoreSnapshotBtn.addEventListener('click', async () => {
    const storage = await chrome.storage.local.get('lastSnapshot');
    if (storage.lastSnapshot && storage.lastSnapshot.length > 0) {
      for (const item of storage.lastSnapshot) {
        await chrome.tabs.create({ url: item.url, pinned: item.pinned, active: false });
      }
      init();
    }
  });

  if (elements.toggleSidePanelModeBtn) {
    elements.toggleSidePanelModeBtn.addEventListener('click', async () => {
      elements.cleanupMenu.classList.remove('show');
      const current = await getPreferSidePanel();
      await setPreferSidePanel(!current);
      await updateSidePanelModeLabel();
      await setActionPopupMode(!current);
      // If user just enabled it, open side panel now too.
      if (!current) {
        await openSidePanel();
        window.close();
      }
    });
  }

  elements.sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderTabs(allTabs);
  });

  elements.searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const f = allTabs.filter(t => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
    renderTabs(f);
  });

  elements.refreshBtn.addEventListener('click', init);
  
  elements.langMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.langMenu.classList.toggle('show');
    elements.cleanupMenu.classList.remove('show');
  });

  document.addEventListener('click', () => {
    elements.langMenu.classList.remove('show');
  });

  const saved = await chrome.storage.local.get('userLang');
  const initialLang = saved.userLang || chrome.i18n.getUILanguage() || 'en';
  await loadLanguage(initialLang);
  await updateSidePanelModeLabel();
  await init();
});
