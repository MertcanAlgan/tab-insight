// Track when tabs are created
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) {
    const timestamp = Date.now();
    chrome.storage.local.set({ [`creationTime_${tab.id}`]: timestamp });
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`creationTime_${tabId}`);
});

// On installation, track existing tabs
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const initialData = {};
  const now = Date.now();
  tabs.forEach(tab => {
    if (tab.id) {
      initialData[`creationTime_${tab.id}`] = now; // Best guess since we don't have past creation time
    }
  });
  chrome.storage.local.set(initialData);
});

let preferSidePanelCached = false;

const syncPreferSidePanelCache = async () => {
  try {
    const s = await chrome.storage.local.get('preferSidePanel');
    preferSidePanelCached = !!s.preferSidePanel;
  } catch (_) {
    preferSidePanelCached = false;
  }
};

// Initial cache fill
syncPreferSidePanelCache();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (Object.prototype.hasOwnProperty.call(changes, 'preferSidePanel')) {
    preferSidePanelCached = !!changes.preferSidePanel.newValue;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'preferSidePanelUpdated') {
    preferSidePanelCached = !!msg.value;
  }
});

// When popup is disabled, clicking the extension icon triggers onClicked
// (this is a user gesture, required by sidePanel.open()).
chrome.action.onClicked.addListener((tab) => {
  if (!preferSidePanelCached) return;
  if (!chrome.sidePanel || !tab?.id) return;

  // IMPORTANT: sidePanel.open requires a direct user gesture.
  // Avoid async gaps (await) before calling open().
  try {
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true
    });
    chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn('Failed to open side panel from action click', e);
  }
});
