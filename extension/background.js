// Background service worker
// Manages the connection queue and schedules auto-connect

const ALARM_NAME = 'processQueue';
const CHECK_CONNECTIONS_ALARM = 'checkConnections';
const DEFAULT_MIN_DELAY = 1; // 1 minute minimum
const DEFAULT_MAX_DELAY = 3; // 3 minutes maximum
const DEFAULT_CHECK_INTERVAL = 5; // 5 minutes

// Current LinkedIn user (set from content script or popup)
let currentLinkedInUser = null;

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

// Get queue from storage for current user
async function getQueue(user = currentLinkedInUser) {
  if (!user) {
    // Fallback to legacy queue if no user
    const { queue = [] } = await chrome.storage.local.get('queue');
    return queue;
  }
  const { queues = {} } = await chrome.storage.local.get('queues');
  return queues[user] || [];
}

// Save queue to storage for current user
async function saveQueue(queue, user = currentLinkedInUser) {
  if (!user) {
    // Fallback to legacy queue if no user
    await chrome.storage.local.set({ queue });
    return;
  }
  const { queues = {} } = await chrome.storage.local.get('queues');
  queues[user] = queue;
  await chrome.storage.local.set({ queues });
}

// Set current user
function setCurrentUser(user) {
  currentLinkedInUser = user;
  console.log('LinkedIn Auto-Connect: Current user set to:', user);
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

            // Close the tab after a delay (5 seconds to allow viewing logs)
            setTimeout(() => chrome.tabs.remove(tab.id), 5000);

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

// Function to parse connections from the LinkedIn connections page
function parseConnectionsPage() {
  const connections = [];

  // New LinkedIn structure uses data-view-name="connections-profile" for profile links
  const profileLinks = document.querySelectorAll('a[data-view-name="connections-profile"]');

  const seenUrls = new Set();
  profileLinks.forEach(link => {
    const href = link.href;
    if (href && href.includes('/in/')) {
      // Normalize the URL (remove query params and trailing slash)
      const url = new URL(href);
      const profileUrl = url.origin + url.pathname.replace(/\/$/, '');

      // Avoid duplicates (each connection has multiple links)
      if (!seenUrls.has(profileUrl)) {
        seenUrls.add(profileUrl);
        connections.push(profileUrl);
      }
    }
  });

  return connections;
}

// Check connections page and update stored connections
async function checkConnections() {
  console.log('LinkedIn Auto-Connect: Checking connections...');

  try {
    const tab = await chrome.tabs.create({
      url: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
      active: false
    });

    // Wait for page to load
    return new Promise((resolve) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);

          // Wait for content to load
          setTimeout(async () => {
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: parseConnectionsPage
              });

              const connectionUrls = results[0]?.result || [];

              // Extract username from LinkedIn URL
              const getUsername = (url) => {
                if (!url) return null;
                const match = url.match(/\/in\/([^/?#]+)/);
                return match ? match[1].toLowerCase() : null;
              };

              // Convert to usernames only
              const connectedUsernames = connectionUrls.map(getUsername).filter(Boolean);
              console.log('LinkedIn Auto-Connect: Found', connectedUsernames.length, 'connections:', connectedUsernames);

              // Store usernames
              await chrome.storage.local.set({
                acceptedConnections: connectedUsernames,
                lastConnectionCheck: new Date().toISOString()
              });

              // Build a set for quick lookup
              const connectedUsernamesSet = new Set(connectedUsernames);

              const { queues = {} } = await chrome.storage.local.get('queues');
              const { queue: legacyQueue = [] } = await chrome.storage.local.get('queue');

              // Update all user queues
              let anyUpdated = false;
              for (const user of Object.keys(queues)) {
                let updated = false;
                for (const item of queues[user]) {
                  const username = getUsername(item.profileUrl);
                  if (username && connectedUsernamesSet.has(username) && item.status !== 'connected') {
                    item.status = 'connected';
                    item.connectedAt = new Date().toISOString();
                    updated = true;
                    console.log('LinkedIn Auto-Connect: Marked as connected:', item.name, '(user:', user, ')');
                  }
                }
                if (updated) anyUpdated = true;
              }

              // Also update legacy queue
              for (const item of legacyQueue) {
                const username = getUsername(item.profileUrl);
                if (username && connectedUsernamesSet.has(username) && item.status !== 'connected') {
                  item.status = 'connected';
                  item.connectedAt = new Date().toISOString();
                  anyUpdated = true;
                  console.log('LinkedIn Auto-Connect: Marked as connected:', item.name, '(legacy queue)');
                }
              }

              if (anyUpdated) {
                await chrome.storage.local.set({ queues, queue: legacyQueue });
              }

              // Close the tab
              chrome.tabs.remove(tab.id);
              resolve({ success: true, count: connections.length });
            } catch (err) {
              console.error('LinkedIn Auto-Connect: Error parsing connections:', err);
              chrome.tabs.remove(tab.id);
              resolve({ success: false, error: err.message });
            }
          }, 3000);
        }
      });
    });
  } catch (err) {
    console.error('LinkedIn Auto-Connect: Error checking connections:', err);
    return { success: false, error: err.message };
  }
}

// Schedule connection check
async function scheduleConnectionCheck() {
  const settings = await getSettings();
  const checkInterval = settings.checkInterval || DEFAULT_CHECK_INTERVAL;

  chrome.alarms.create(CHECK_CONNECTIONS_ALARM, { periodInMinutes: checkInterval });
  console.log('LinkedIn Auto-Connect: Scheduled connection check every', checkInterval, 'minutes');
}

// This function runs in the context of the LinkedIn profile page to send a message
function clickMessageButton(message) {
  return new Promise((resolve) => {
    try {
      console.log('LinkedIn Auto-Connect: Looking for Message button...');

      const allButtons = document.querySelectorAll('button, a');
      let messageBtn = null;

      for (const btn of allButtons) {
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (ariaLabel === 'message' || ariaLabel.startsWith('message ')) {
          messageBtn = btn;
          break;
        }
      }

      if (!messageBtn) {
        console.log('LinkedIn Auto-Connect: Message button not found - may not be connected');
        resolve({ success: false, error: 'Message button not found - you may not be connected to this person' });
        return;
      }

      console.log('LinkedIn Auto-Connect: Clicking message button');
      messageBtn.click();

      // Wait for message modal to open
      setTimeout(() => {
        // Find the message input area
        const messageInput = document.querySelector('.msg-form__contenteditable, div[contenteditable="true"][role="textbox"]');

        if (!messageInput) {
          console.log('LinkedIn Auto-Connect: Message input not found');
          resolve({ success: false, error: 'Message input not found' });
          return;
        }

        console.log('LinkedIn Auto-Connect: Pasting message');

        // Clear existing content and paste the message
        messageInput.innerHTML = '';
        messageInput.focus();

        // Insert the message text
        const p = document.createElement('p');
        p.textContent = message;
        messageInput.appendChild(p);

        // Trigger input event to enable send button
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));

        console.log('LinkedIn Auto-Connect: Message pasted, ready to send');
        resolve({ success: true });
      }, 1500);

    } catch (err) {
      console.error('LinkedIn Auto-Connect: Error:', err);
      resolve({ success: false, error: err.message });
    }
  });
}

// This function runs in the context of the LinkedIn profile page
function clickConnectButton() {
  return new Promise((resolve) => {
    // Find and click Connect button directly on the profile page
    function findAndClickConnectButton() {
      const allButtons = document.querySelectorAll('button, a');

      console.log('LinkedIn Auto-Connect: Looking for Connect button on page...');

      let connectBtn = null;
      for (const btn of allButtons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        if (ariaLabel.toLowerCase().includes('connect') && !ariaLabel.toLowerCase().includes('disconnect')) {
          connectBtn = btn;
          break;
        }
      }

      console.log('LinkedIn Auto-Connect: Connect button found:', connectBtn?.getAttribute('aria-label'));

      if (connectBtn) {
        console.log('LinkedIn Auto-Connect: Clicking connect button');
        connectBtn.click();

        // Wait for modal and click "Send without a note" or "Send"
        setTimeout(() => {
          console.log('LinkedIn Auto-Connect: Looking for Send button in modal...');

          // Find Send button in modal
          const modalButtons = document.querySelectorAll('button');
          let sendBtn = null;

          for (const btn of modalButtons) {
            const text = btn.textContent.trim().toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

            if (text.includes('send') || ariaLabel.includes('send')) {
              // Prefer "Send without a note" over just "Send"
              if (ariaLabel.includes('without a note') || text.includes('without')) {
                sendBtn = btn;
                break;
              }
              if (!sendBtn) {
                sendBtn = btn;
              }
            }
          }

          if (sendBtn) {
            console.log('LinkedIn Auto-Connect: Clicking send button:', sendBtn.textContent.trim());
            sendBtn.click();

            // Wait and check for weekly invitation limit modal
            setTimeout(() => {
              const limitModal = document.querySelector('.ip-fuse-limit-alert');
              if (limitModal) {
                console.log('LinkedIn Auto-Connect: Weekly invitation limit reached!');
                const gotItBtn = limitModal.querySelector('button[aria-label="Got it"]');
                if (gotItBtn) gotItBtn.click();
                resolve({ success: false, error: 'Weekly invitation limit reached' });
              } else {
                resolve({ success: true });
              }
            }, 1500);
          } else {
            console.log('LinkedIn Auto-Connect: No send button found');
            resolve({ success: false, error: 'Send button not found' });
          }
        }, 1500);

        return true; // Found and clicked
      }

      // Check if already connected (shows Message button but no Connect)
      for (const btn of allButtons) {
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (ariaLabel === 'message' || ariaLabel.startsWith('message ')) {
          console.log('LinkedIn Auto-Connect: Found Message button - may already be connected');
          resolve({ success: false, error: 'Already connected or no Connect option' });
          return true; // Handled (even though failed)
        }
      }

      return false; // Not found
    }

    try {
      console.log('LinkedIn Auto-Connect: Looking for More button first...');

      const allButtons = document.querySelectorAll('button, a');
      let moreBtn = null;

      // Check for "More" button that might contain Connect FIRST
      for (const btn of allButtons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const text = btn.textContent.trim().toLowerCase();
        if (ariaLabel.toLowerCase() === 'more actions' || text === 'more') {
          moreBtn = btn;
          break;
        }
      }

      if (moreBtn) {
        console.log('LinkedIn Auto-Connect: Clicking More button');
        moreBtn.click();

        // Wait for dropdown to open
        setTimeout(() => {
          // Look for Connect in dropdown menu
          const menuItems = document.querySelectorAll('.artdeco-dropdown__item[role="button"], .artdeco-dropdown__item');
          console.log('LinkedIn Auto-Connect: Found', menuItems.length, 'menu items');

          let foundConnect = false;
          for (const item of menuItems) {
            const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();

            // Look for "invite ... to connect"
            if (ariaLabel.includes('to connect')) {
              foundConnect = true;
              console.log('LinkedIn Auto-Connect: Clicking Connect in menu:', ariaLabel);
              item.click();

              // Wait for modal to appear
              setTimeout(() => {
                // Check for weekly limit first
                const limitModal = document.querySelector('.ip-fuse-limit-alert');
                if (limitModal) {
                  console.log('LinkedIn Auto-Connect: Weekly invitation limit reached!');
                  const gotItBtn = limitModal.querySelector('button[aria-label="Got it"]');
                  if (gotItBtn) gotItBtn.click();
                  resolve({ success: false, error: 'Weekly invitation limit reached' });
                  return;
                }

                // Check if there's a Send button (modal appeared)
                const buttons = document.querySelectorAll('button');
                let sendBtn = null;
                for (const btn of buttons) {
                  const btnText = btn.textContent.toLowerCase();
                  if (btnText.includes('send')) {
                    sendBtn = btn;
                    break;
                  }
                }

                if (sendBtn) {
                  console.log('LinkedIn Auto-Connect: Clicking Send button');
                  sendBtn.click();

                  // Check for weekly limit after clicking send
                  setTimeout(() => {
                    const limitModal = document.querySelector('.ip-fuse-limit-alert');
                    if (limitModal) {
                      console.log('LinkedIn Auto-Connect: Weekly invitation limit reached!');
                      const gotItBtn = limitModal.querySelector('button[aria-label="Got it"]');
                      if (gotItBtn) gotItBtn.click();
                      resolve({ success: false, error: 'Weekly invitation limit reached' });
                    } else {
                      resolve({ success: true, note: 'Used More menu' });
                    }
                  }, 1500);
                } else {
                  // No Send button - connection was sent directly
                  console.log('LinkedIn Auto-Connect: Connection sent directly (no modal)');
                  resolve({ success: true, note: 'Used More menu, sent directly' });
                }
              }, 1000);
              break;
            }
          }

          // If Connect not found in More menu, fallback to direct Connect button
          if (!foundConnect) {
            console.log('LinkedIn Auto-Connect: Connect not in More menu, trying direct button...');

            setTimeout(() => {
              const found = findAndClickConnectButton();
              if (!found) {
                console.log('LinkedIn Auto-Connect: No Connect button found');
                resolve({ success: false, error: 'Connect button not found' });
              }
            }, 300);
          }
        }, 500);

        return; // Don't resolve yet, wait for setTimeout
      }

      // If no More button, fallback to direct Connect button
      const found = findAndClickConnectButton();
      if (!found) {
        console.log('LinkedIn Auto-Connect: No Connect button found');
        resolve({ success: false, error: 'Connect button not found' });
      }
    } catch (err) {
      console.error('LinkedIn Auto-Connect: Error:', err);
      resolve({ success: false, error: err.message });
    }
  });
}

// Handle alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    processNext();
  } else if (alarm.name === CHECK_CONNECTIONS_ALARM) {
    checkConnections();
  }
});

// Start connection check alarm on startup
scheduleConnectionCheck();

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
        // Reschedule connection check with new interval
        await scheduleConnectionCheck();
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

      case 'retryItem':
        const queueToRetry = await getQueue();
        const itemToRetry = queueToRetry.find(item => item.id === request.id);
        if (itemToRetry) {
          itemToRetry.status = 'pending';
          delete itemToRetry.error;
          delete itemToRetry.completedAt;
          await saveQueue(queueToRetry);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Item not found' });
        }
        break;

      case 'removeByUrl':
        const queueByUrl = await getQueue();
        const filteredByUrl = queueByUrl.filter(item => item.profileUrl !== request.profileUrl);
        await saveQueue(filteredByUrl);
        sendResponse({ success: true });
        break;

      case 'isInQueue':
        const checkQueue = await getQueue();
        const queueItem = checkQueue.find(item => item.profileUrl === request.profileUrl);
        sendResponse({
          inQueue: queueItem?.status === 'pending',
          status: queueItem?.status || null
        });
        break;

      case 'clear':
        const currentQueue = await getQueue();
        const filtered = currentQueue.filter(item => item.status !== 'pending');
        await saveQueue(filtered);
        sendResponse({ success: true });
        break;

      case 'setUser':
        setCurrentUser(request.user);
        sendResponse({ success: true, user: request.user });
        break;

      case 'getUser':
        sendResponse({ user: currentLinkedInUser });
        break;

      case 'getAcceptedConnections':
        const { acceptedConnections = [], lastConnectionCheck } = await chrome.storage.local.get(['acceptedConnections', 'lastConnectionCheck']);
        sendResponse({ connections: acceptedConnections, lastCheck: lastConnectionCheck });
        break;

      case 'checkConnectionsNow':
        const checkResult = await checkConnections();
        // Reschedule the alarm with current settings
        await scheduleConnectionCheck();
        sendResponse(checkResult);
        break;

      case 'sendMessage':
        // Open profile and send message
        try {
          const tab = await chrome.tabs.create({
            url: request.profileUrl,
            active: true // Open in foreground so user can see and send
          });

          // Wait for page to load, then inject the message script
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);

              // Wait for page to fully render
              setTimeout(async () => {
                try {
                  const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: clickMessageButton,
                    args: [request.message]
                  });

                  const result = results[0]?.result;
                  sendResponse(result);
                } catch (err) {
                  console.error('Script execution error:', err);
                  sendResponse({ success: false, error: err.message });
                }
              }, 2000);
            }
          });
        } catch (err) {
          console.error('Failed to open tab:', err);
          sendResponse({ success: false, error: err.message });
        }
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  return true; // Keep channel open for async response
});

console.log('LinkedIn Auto-Connect: Background script loaded');
