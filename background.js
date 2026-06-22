chrome.action.onClicked.addListener((inventoryTab) => {
  if (!inventoryTab.id) {
      console.error("Không thể lấy ID của tab hiện tại.");
      return;
  }

  const appUrl = chrome.runtime.getURL('index.html');

  chrome.storage.local.set({ targetTabId: inventoryTab.id }, () => {
      chrome.tabs.query({ url: appUrl }, (foundTabs) => {
          if (foundTabs.length > 0) {
              const existingTab = foundTabs[0];
              chrome.windows.update(existingTab.windowId, { focused: true });
              chrome.tabs.update(existingTab.id, { active: true });
          } else {
              chrome.tabs.create({ url: 'index.html' });
          }
      });
  });
});
