// Background service worker
// Handles any background tasks if needed

chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Auto-Connect extension installed');
});
