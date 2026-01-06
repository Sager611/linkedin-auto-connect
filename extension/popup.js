// Popup script - communicates with background service worker

async function getStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getStatus' }, resolve);
  });
}

async function getCurrentUser() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getUser' }, resolve);
  });
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, resolve);
  });
}

async function loadSettings() {
  const settings = await getSettings();
  document.getElementById('min-delay').value = settings.minDelay;
  document.getElementById('max-delay').value = settings.maxDelay;
  document.getElementById('check-interval').value = settings.checkInterval || 5;
}

async function saveSettings() {
  const minDelay = parseFloat(document.getElementById('min-delay').value) || 1;
  const maxDelay = parseFloat(document.getElementById('max-delay').value) || 3;
  const checkInterval = parseInt(document.getElementById('check-interval').value) || 5;

  chrome.runtime.sendMessage({
    action: 'setSettings',
    settings: { minDelay, maxDelay, checkInterval }
  });
}

let messageTemplates = [{ name: '1', content: '' }];
let activeTemplateIndex = 0;
let currentFilter = 'all';

async function loadMessageTemplates() {
  const data = await chrome.storage.local.get(['messageTemplates', 'activeTemplateIndex']);
  let loaded = data.messageTemplates || [{ name: '1', content: '' }];

  // Migrate old format (array of strings) to new format (array of objects)
  if (loaded.length > 0 && typeof loaded[0] === 'string') {
    loaded = loaded.map((content, i) => ({ name: String(i + 1), content }));
  }

  messageTemplates = loaded;
  activeTemplateIndex = data.activeTemplateIndex || 0;

  // Ensure activeTemplateIndex is valid
  if (activeTemplateIndex >= messageTemplates.length) {
    activeTemplateIndex = 0;
  }

  document.getElementById('message-template').value = messageTemplates[activeTemplateIndex]?.content || '';
  renderMessageTabs();
}

async function saveMessageTemplates() {
  await chrome.storage.local.set({ messageTemplates, activeTemplateIndex });
}

function renderMessageTabs() {
  const tabsContainer = document.getElementById('message-tabs');
  tabsContainer.innerHTML = messageTemplates
    .map((template, index) => `
      <button class="message-tab ${index === activeTemplateIndex ? 'active' : ''}" data-index="${index}">
        <span class="message-tab-name">${escapeHtml(template.name)}</span>${messageTemplates.length > 1 ? `<span class="message-tab-remove" data-index="${index}">×</span>` : ''}
      </button>
    `)
    .join('') + '<button class="message-tab message-tab-add">+</button>';

  // Tab click handlers
  tabsContainer.querySelectorAll('.message-tab:not(.message-tab-add)').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('message-tab-remove')) {
        return; // Let remove handler handle it
      }
      const index = parseInt(tab.dataset.index);
      switchToTab(index);
    });

    // Double-click to rename
    tab.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('message-tab-remove')) {
        return;
      }
      const index = parseInt(tab.dataset.index);
      renameTab(index, tab);
    });
  });

  // Remove button handlers
  tabsContainer.querySelectorAll('.message-tab-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      removeTab(index);
    });
  });

  // Add button handler
  tabsContainer.querySelector('.message-tab-add').addEventListener('click', addTab);
}

function renameTab(index, tabElement) {
  const nameSpan = tabElement.querySelector('.message-tab-name');
  const currentName = messageTemplates[index].name;

  // Create input field
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'message-tab-input';
  input.style.cssText = 'width: 50px; font-size: 12px; padding: 2px 4px; border: 1px solid #0a66c2; border-radius: 2px;';

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  function finishRename() {
    const newName = input.value.trim() || String(index + 1);
    messageTemplates[index].name = newName;
    saveMessageTemplates();
    renderMessageTabs();
  }

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });

  // Prevent click from bubbling and switching tabs
  input.addEventListener('click', (e) => e.stopPropagation());
}

function switchToTab(index) {
  // Save current template before switching
  messageTemplates[activeTemplateIndex].content = document.getElementById('message-template').value;

  activeTemplateIndex = index;
  document.getElementById('message-template').value = messageTemplates[activeTemplateIndex]?.content || '';
  saveMessageTemplates();
  renderMessageTabs();
}

function addTab() {
  // Save current template
  messageTemplates[activeTemplateIndex].content = document.getElementById('message-template').value;

  const newIndex = messageTemplates.length + 1;
  messageTemplates.push({ name: String(newIndex), content: '' });
  activeTemplateIndex = messageTemplates.length - 1;
  document.getElementById('message-template').value = '';
  saveMessageTemplates();
  renderMessageTabs();
}

function removeTab(index) {
  if (messageTemplates.length <= 1) return;

  messageTemplates.splice(index, 1);

  // Adjust active index if needed
  if (activeTemplateIndex >= messageTemplates.length) {
    activeTemplateIndex = messageTemplates.length - 1;
  } else if (activeTemplateIndex > index) {
    activeTemplateIndex--;
  }

  document.getElementById('message-template').value = messageTemplates[activeTemplateIndex]?.content || '';
  saveMessageTemplates();
  renderMessageTabs();
}

function onTemplateInput() {
  messageTemplates[activeTemplateIndex].content = document.getElementById('message-template').value;
  saveMessageTemplates();
}

async function getAcceptedConnections() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getAcceptedConnections' }, resolve);
  });
}

async function updateUI() {
  const status = await getStatus();
  const userInfo = await getCurrentUser();
  const acceptedData = await getAcceptedConnections();

  const serverStatusEl = document.getElementById('server-status');
  const queueCountEl = document.getElementById('queue-count');
  const processingStatusEl = document.getElementById('processing-status');
  const queueListEl = document.getElementById('queue-list');
  const toggleBtn = document.getElementById('toggle-btn');
  const connectNowBtn = document.getElementById('connect-now-btn');
  const currentUserEl = document.getElementById('current-user');

  if (!status) {
    serverStatusEl.textContent = 'Error';
    serverStatusEl.className = 'status-value paused';
    return;
  }

  serverStatusEl.textContent = 'Ready';
  serverStatusEl.className = 'status-value active';
  toggleBtn.disabled = false;

  // Show current user
  if (currentUserEl) {
    currentUserEl.textContent = userInfo?.user || 'Not detected';
    currentUserEl.title = userInfo?.user ? `Queue for: ${userInfo.user}` : 'Visit LinkedIn to detect user';
  }

  queueCountEl.textContent = `${status.queue.length} total (${status.pending} pending)`;

  // Enable/disable connect now button based on queue
  connectNowBtn.disabled = status.pending === 0;

  if (status.isProcessing) {
    processingStatusEl.textContent = 'Active';
    processingStatusEl.className = 'status-value active';
    toggleBtn.textContent = 'Pause';
  } else {
    processingStatusEl.textContent = 'Paused';
    processingStatusEl.className = 'status-value paused';
    toggleBtn.textContent = 'Start';
  }

  // Display queue
  // acceptedData.connections now contains usernames, not full URLs
  const acceptedUsernames = new Set(acceptedData?.connections || []);

  // Extract username from LinkedIn URL
  const getUsername = (url) => {
    if (!url) return null;
    const match = url.match(/\/in\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  };

  // Apply filter to queue items
  const filteredQueue = status.queue.filter(item => {
    if (currentFilter === 'all') return true;
    const username = getUsername(item.profileUrl);
    const isAccepted = username && acceptedUsernames.has(username);
    const effectiveStatus = isAccepted ? 'connected' : item.status;
    return effectiveStatus === currentFilter;
  });

  if (status.queue.length === 0) {
    queueListEl.innerHTML = '<div style="color:#666;text-align:center;padding:20px;">Queue is empty</div>';
  } else if (filteredQueue.length === 0) {
    queueListEl.innerHTML = `<div style="color:#666;text-align:center;padding:20px;">No ${currentFilter} items</div>`;
  } else {
    queueListEl.innerHTML = filteredQueue
      .slice()
      .reverse()
      .map(item => {
        const username = getUsername(item.profileUrl);
        const isAccepted = username && acceptedUsernames.has(username);
        const displayStatus = isAccepted ? 'connected' : item.status;
        const statusText = isAccepted ? 'Connected' : (item.status + (item.status === 'failed' && item.error ? ': ' + escapeHtml(item.error) : ''));
        return `
        <div class="queue-item ${isAccepted ? 'accepted' : ''}" data-id="${item.id}">
          <button class="queue-item-message" data-id="${item.id}" data-url="${escapeHtml(item.profileUrl)}" data-name="${escapeHtml(item.name)}" title="Send message">✉</button>
          <div class="queue-item-info" data-url="${escapeHtml(item.profileUrl)}" title="Click to open profile">
            <div class="queue-item-name">${escapeHtml(item.name)}</div>
            <div class="queue-item-status ${displayStatus}">${statusText}</div>
          </div>
          ${item.status === 'failed' && !isAccepted ? `<button class="queue-item-retry" data-id="${item.id}" title="Retry">↻</button>` : ''}
          <button class="queue-item-remove" data-id="${item.id}" title="Remove">×</button>
        </div>
      `})
      .join('');

    // Add click handler to open profile
    queueListEl.querySelectorAll('.queue-item-info').forEach(info => {
      info.addEventListener('click', () => {
        const url = info.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
      // Middle-click to open in new tab
      info.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          const url = info.dataset.url;
          if (url) {
            chrome.tabs.create({ url, active: false });
          }
        }
      });
    });

    // Add retry button handlers
    queueListEl.querySelectorAll('.queue-item-retry').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        chrome.runtime.sendMessage({ action: 'retryItem', id }, () => {
          updateUI();
        });
      });
    });

    // Add remove button handlers
    queueListEl.querySelectorAll('.queue-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        chrome.runtime.sendMessage({ action: 'removeFromQueue', id }, () => {
          updateUI();
        });
      });
    });

    // Add message button handlers
    queueListEl.querySelectorAll('.queue-item-message').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const profileUrl = btn.dataset.url;
        const name = btn.dataset.name;
        const messageTemplate = document.getElementById('message-template').value;

        // Replace {name} placeholder with actual name (first name only)
        const firstName = name.split(' ')[0];
        const message = messageTemplate.replace(/\{name\}/gi, firstName);

        btn.disabled = true;
        btn.textContent = '...';

        chrome.runtime.sendMessage({
          action: 'sendMessage',
          profileUrl,
          message
        }, (result) => {
          btn.disabled = false;
          btn.textContent = '✉';
          if (!result?.success) {
            alert(result?.error || 'Failed to send message');
          }
        });
      });
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toggle start/pause
document.getElementById('toggle-btn').addEventListener('click', async () => {
  const status = await getStatus();
  const action = status.isProcessing ? 'pause' : 'start';

  chrome.runtime.sendMessage({ action }, () => {
    updateUI();
  });
});

// Clear queue
document.getElementById('clear-btn').addEventListener('click', async () => {
  if (confirm('Clear all pending items from the queue?')) {
    chrome.runtime.sendMessage({ action: 'clear' }, () => {
      updateUI();
    });
  }
});

// Connect now button
document.getElementById('connect-now-btn').addEventListener('click', () => {
  const btn = document.getElementById('connect-now-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';

  chrome.runtime.sendMessage({ action: 'connectNow' }, () => {
    setTimeout(() => {
      btn.textContent = 'Connect Next Now';
      updateUI();
    }, 1000);
  });
});

// Save settings when changed
document.getElementById('min-delay').addEventListener('change', saveSettings);
document.getElementById('max-delay').addEventListener('change', saveSettings);
document.getElementById('check-interval').addEventListener('change', saveSettings);

// Check accepted connections now
document.getElementById('check-now-btn').addEventListener('click', () => {
  const btn = document.getElementById('check-now-btn');
  btn.disabled = true;
  btn.textContent = '...';

  chrome.runtime.sendMessage({ action: 'checkConnectionsNow' }, () => {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '↻';
      updateUI();
    }, 1000);
  });
});

// Save message template when changed
document.getElementById('message-template').addEventListener('input', onTemplateInput);

// Queue filter dropdown
document.getElementById('queue-filter').addEventListener('change', (e) => {
  currentFilter = e.target.value;
  updateUI();
});

// Initialize
loadSettings();
loadMessageTemplates();
updateUI();
setInterval(updateUI, 2000);
