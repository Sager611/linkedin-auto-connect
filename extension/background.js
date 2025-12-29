// Background service worker
// Manages the connection queue and schedules auto-connect

const ALARM_NAME = 'processQueue';
const DEFAULT_MIN_DELAY = 1; // 1 minute minimum
const DEFAULT_MAX_DELAY = 3; // 3 minutes maximum

// Get settings from storage
async function getSettings() {
  const { settings = { minDelay: DEFAULT_MIN_DELAY, maxDelay: DEFAULT_MAX_DELAY } } =
    await chrome.storage.local.get('settings');
  return settings;
}

// Save settings to storage
async function saveSettings(newSettings) {
  await chrome.storage.local.set({ settings: newSettings });
}

// Get queue from storage
async function getQueue() {
  const { queue = [] } = await chrome.storage.local.get('queue');
  return queue;
}

// Save queue to storage
async function saveQueue(queue) {
  await chrome.storage.local.set({ queue });
}

// Get processing state
async function getState() {
  const { isProcessing = false } = await chrome.storage.local.get('isProcessing');
  return isProcessing;
}

// Set processing state
async function setState(isProcessing) {
  await chrome.storage.local.set({ isProcessing });
}

// Add profile to queue
async function addToQueue(profile) {
  const queue = await getQueue();

  // Check for duplicates
  if (queue.some(item => item.profileUrl === profile.profileUrl)) {
    return { success: false, error: 'Already in queue' };
  }

  queue.push({
    ...profile,
    id: Date.now().toString(),
    status: 'pending',
    addedAt: new Date().toISOString()
  });

  await saveQueue(queue);
  return { success: true };
}

// Schedule next connection attempt
async function scheduleNext() {
  const isProcessing = await getState();
  if (!isProcessing) return;

  const queue = await getQueue();
  const pending = queue.filter(item => item.status === 'pending');

  if (pending.length === 0) {
    console.log('Queue empty, stopping');
    await setState(false);
    return;
  }

  // Get settings and calculate random delay
  const settings = await getSettings();
  const minDelay = settings.minDelay || DEFAULT_MIN_DELAY;
  const maxDelay = settings.maxDelay || DEFAULT_MAX_DELAY;
  const delayMinutes = minDelay + Math.random() * (maxDelay - minDelay);
  console.log(`Next connection in ${delayMinutes.toFixed(1)} minutes`);

  chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes });
}

// Process immediately (for manual trigger)
async function processNow() {
  const queue = await getQueue();
  const nextItem = queue.find(item => item.status === 'pending');

  if (!nextItem) {
    return { success: false, error: 'No pending items' };
  }

  // Clear any pending alarm
  chrome.alarms.clear(ALARM_NAME);

  // Process the item
  await processItem(nextItem);
  return { success: true };
}

// Process the next item in queue (called by alarm or start)
async function processNext() {
  const isProcessing = await getState();
  if (!isProcessing) return;

  const queue = await getQueue();
  const nextItem = queue.find(item => item.status === 'pending');

  if (!nextItem) {
    await setState(false);
    return;
  }

  await processItem(nextItem);
}

// Process a specific item
async function processItem(nextItem) {
  console.log('Processing:', nextItem.name);

  // Update status to processing
  let queue = await getQueue();
  const itemToUpdate = queue.find(i => i.id === nextItem.id);
  if (itemToUpdate) {
    itemToUpdate.status = 'processing';
    await saveQueue(queue);
  }

  try {
    // Open the profile in a new tab
    const tab = await chrome.tabs.create({
      url: nextItem.profileUrl,
      active: false // Open in background
    });

    // Wait for page to load, then inject the connect script
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);

        // Inject and execute the connect script
        setTimeout(async () => {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: clickConnectButton
            });

            const result = results[0]?.result;

            // Update queue status
            const queue = await getQueue();
            const item = queue.find(i => i.id === nextItem.id);
            if (item) {
              if (result?.success) {
                item.status = 'completed';
                item.completedAt = new Date().toISOString();
                console.log('Connected:', item.name);
              } else {
                item.status = 'failed';
                item.error = result?.error || 'Unknown error';
                console.log('Failed:', item.name, item.error);
              }
              await saveQueue(queue);
            }

            // Close the tab after a delay
            setTimeout(() => chrome.tabs.remove(tab.id), 2000);

            // Schedule next if processing is active
            const isProcessing = await getState();
            if (isProcessing) {
              scheduleNext();
            }
          } catch (err) {
            console.error('Script execution error:', err);
            const queue = await getQueue();
            const item = queue.find(i => i.id === nextItem.id);
            if (item) {
              item.status = 'failed';
              item.error = err.message;
              await saveQueue(queue);
            }
            const isProcessing = await getState();
            if (isProcessing) {
              scheduleNext();
            }
          }
        }, 3000); // Wait 3 seconds for page to fully render
      }
    });
  } catch (err) {
    console.error('Failed to open tab:', err);
    const queue = await getQueue();
    const item = queue.find(i => i.id === nextItem.id);
    if (item) {
      item.status = 'failed';
      item.error = err.message;
      await saveQueue(queue);
    }
    const isProcessing = await getState();
    if (isProcessing) {
      scheduleNext();
    }
  }
}

// This function runs in the context of the LinkedIn profile page
function clickConnectButton() {
  try {
    // Look for Connect button with various selectors
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i], ' +
      'a[aria-label*="connect" i], ' +
      'button:has(span:contains("Connect")), ' +
      'div[data-view-name="profile-component-entity"] button[aria-label*="connect" i]'
    );

    if (connectBtn) {
      connectBtn.click();

      // Wait for modal and click "Send without a note"
      setTimeout(() => {
        const sendBtn = document.querySelector(
          'button[aria-label*="Send without a note" i], ' +
          'button[aria-label*="Send now" i], ' +
          'button.artdeco-button--primary'
        );
        if (sendBtn) {
          sendBtn.click();
        }
      }, 1000);

      return { success: true };
    }

    // Check for "More" button that might contain Connect
    const moreBtn = document.querySelector('button[aria-label="More actions"]');
    if (moreBtn) {
      moreBtn.click();

      setTimeout(() => {
        const connectInMenu = document.querySelector('div[role="menu"] span:has-text("Connect")');
        if (connectInMenu) {
          connectInMenu.click();
          setTimeout(() => {
            const sendBtn = document.querySelector('button[aria-label*="Send" i]');
            if (sendBtn) sendBtn.click();
          }, 1000);
        }
      }, 500);

      return { success: true, note: 'Used More menu' };
    }

    // Check if already connected
    const messageBtn = document.querySelector('button[aria-label="Message"], a[aria-label="Message"]');
    if (messageBtn) {
      return { success: false, error: 'Already connected or Message only' };
    }

    return { success: false, error: 'Connect button not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    processNext();
  }
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request.action) {
      case 'addToQueue':
        const result = await addToQueue(request.profile);
        sendResponse(result);
        break;

      case 'getStatus':
        const queue = await getQueue();
        const isProcessing = await getState();
        sendResponse({
          queue,
          isProcessing,
          pending: queue.filter(i => i.status === 'pending').length,
          completed: queue.filter(i => i.status === 'completed').length,
          failed: queue.filter(i => i.status === 'failed').length
        });
        break;

      case 'getSettings':
        const settings = await getSettings();
        sendResponse(settings);
        break;

      case 'setSettings':
        await saveSettings(request.settings);
        sendResponse({ success: true });
        break;

      case 'start':
        await setState(true);
        processNext();
        sendResponse({ success: true });
        break;

      case 'pause':
        await setState(false);
        chrome.alarms.clear(ALARM_NAME);
        sendResponse({ success: true });
        break;

      case 'connectNow':
        const nowResult = await processNow();
        sendResponse(nowResult);
        break;

      case 'removeFromQueue':
        const queueToFilter = await getQueue();
        const filteredQueue = queueToFilter.filter(item => item.id !== request.id);
        await saveQueue(filteredQueue);
        sendResponse({ success: true });
        break;

      case 'removeByUrl':
        const queueByUrl = await getQueue();
        const filteredByUrl = queueByUrl.filter(item => item.profileUrl !== request.profileUrl);
        await saveQueue(filteredByUrl);
        sendResponse({ success: true });
        break;

      case 'isInQueue':
        const checkQueue = await getQueue();
        const inQueue = checkQueue.some(item => item.profileUrl === request.profileUrl && item.status === 'pending');
        sendResponse({ inQueue });
        break;

      case 'clear':
        const currentQueue = await getQueue();
        const filtered = currentQueue.filter(item => item.status !== 'pending');
        await saveQueue(filtered);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  return true; // Keep channel open for async response
});

console.log('LinkedIn Auto-Connect: Background script loaded');
