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
