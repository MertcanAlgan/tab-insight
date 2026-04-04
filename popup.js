/**
 * Tab Insight - popup.js
 */

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    tabsList: document.getElementById('tabsList'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    totalTabsCounter: document.getElementById('totalTabsCounter'),
    inactiveTabsBadge: document.getElementById('inactiveTabsBadge'),
    tabTemplate: document.getElementById('tabTemplate'),
    groupTemplate: document.getElementById('groupTemplate'),
    sortSelect: document.getElementById('sortSelect'),
    cleanupBtn: document.getElementById('cleanupBtn'),
    cleanupMenu: document.getElementById('cleanupMenu'),
    closeInactiveBtn: document.getElementById('closeInactiveBtn'),
    closeAllBtn: document.getElementById('closeAllBtn'),
    langEN: document.getElementById('langEN'),
    langTR: document.getElementById('langTR')
  };

  let allTabs = [];
  let creationTimes = {};
  let tabGroups = {};
  let currentSort = 'newest';
  let currentMessages = {};
  let currentLang = 'en';

  const CLEANUP_THRESHOLD_MS = 15 * 60 * 1000;
  const GROUP_COLORS = {
    grey: "#bdc1c6", blue: "#8ab4f8", red: "#f28b82", yellow: "#fdd663",
    green: "#81c995", pink: "#ff8bcb", purple: "#d7aefb", cyan: "#78d9eb", orange: "#fcad70"
  };

  const loadLanguage = async (lang) => {
    const code = lang.startsWith('tr') ? 'tr' : 'en';
    try {
      const resp = await fetch(chrome.runtime.getURL(`_locales/${code}/messages.json`));
      currentMessages = await resp.json();
      currentLang = code;
      elements.langEN.classList.toggle('active', code === 'en');
      elements.langTR.classList.toggle('active', code === 'tr');
      await chrome.storage.local.set({ userLang: code });
      localize();
      if (allTabs.length > 0) { renderTabs(allTabs); updateStats(allTabs); }
    } catch (e) { console.error(e); }
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

  const updateStats = (tabs) => {
    if (elements.totalTabsCounter) elements.totalTabsCounter.textContent = T('openTabs', [tabs.length.toString()]);
    
    const now = Date.now();
    const inactiveCount = tabs.filter(t => !t.active && (now - t.lastAccessed) > CLEANUP_THRESHOLD_MS).length;
    
    if (elements.inactiveTabsBadge) {
      if (inactiveCount > 0) {
        elements.inactiveTabsBadge.style.display = 'block';
        elements.inactiveTabsBadge.textContent = T('inactiveBadgeText', [inactiveCount.toString()]);
        if (elements.closeInactiveBtn) elements.closeInactiveBtn.disabled = false;
      } else {
        elements.inactiveTabsBadge.style.display = 'none';
        if (elements.closeInactiveBtn) elements.closeInactiveBtn.disabled = true;
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
    clone.querySelector('.tab-favicon').src = tab.favIconUrl || 'icons/icon16.png';
    clone.querySelector('.tab-favicon').onerror = (e) => e.target.src = 'icons/icon16.png';
    clone.querySelector('.tab-title').textContent = tab.title || 'Untitled';
    clone.querySelector('.tab-url').textContent = tab.url;
    const createdTs = creationTimes[`creationTime_${tab.id}`];
    clone.querySelector('.opened-time').textContent = createdTs ? formatExactTime(createdTs) : '--:--';
    clone.querySelector('.inactive-time').textContent = tab.active ? T('activeNow') : (tab.lastAccessed ? formatTimeAgo(tab.lastAccessed) : T('activeNow'));

    clone.querySelector('.focus-tab').addEventListener('click', () => {
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    });

    clone.querySelector('.close-tab').addEventListener('click', async () => {
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
      renderTabs(allTabs);
      updateStats(allTabs);
    } catch (e) {
      if (elements.tabsList) elements.tabsList.innerHTML = `<div class="error">${e.message}</div>`;
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
  elements.langEN.addEventListener('click', () => loadLanguage('en'));
  elements.langTR.addEventListener('click', () => loadLanguage('tr'));

  const saved = await chrome.storage.local.get('userLang');
  const initialLang = saved.userLang || chrome.i18n.getUILanguage() || 'en';
  await loadLanguage(initialLang);
  await init();
});
