// Popup script - communicates with background service worker

async function getStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getStatus' }, resolve);
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
}

async function saveSettings() {
  const minDelay = parseFloat(document.getElementById('min-delay').value) || 1;
  const maxDelay = parseFloat(document.getElementById('max-delay').value) || 3;

  chrome.runtime.sendMessage({
    action: 'setSettings',
    settings: { minDelay, maxDelay }
  });
}

async function updateUI() {
  const status = await getStatus();

  const serverStatusEl = document.getElementById('server-status');
  const queueCountEl = document.getElementById('queue-count');
  const processingStatusEl = document.getElementById('processing-status');
  const queueListEl = document.getElementById('queue-list');
  const toggleBtn = document.getElementById('toggle-btn');
  const connectNowBtn = document.getElementById('connect-now-btn');

  if (!status) {
    serverStatusEl.textContent = 'Error';
    serverStatusEl.className = 'status-value paused';
    return;
  }

  serverStatusEl.textContent = 'Ready';
  serverStatusEl.className = 'status-value active';
  toggleBtn.disabled = false;

  queueCountEl.textContent = `${status.pending} pending`;

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
  if (status.queue.length === 0) {
    queueListEl.innerHTML = '<div style="color:#666;text-align:center;padding:20px;">Queue is empty</div>';
  } else {
    queueListEl.innerHTML = status.queue
      .slice()
      .reverse()
      .slice(0, 10)
      .map(item => `
        <div class="queue-item" data-id="${item.id}">
          <div class="queue-item-info">
            <div class="queue-item-name">${escapeHtml(item.name)}</div>
            <div class="queue-item-status ${item.status}">${item.status}</div>
          </div>
          <button class="queue-item-remove" data-id="${item.id}" title="Remove">×</button>
        </div>
      `)
      .join('');

    if (status.queue.length > 10) {
      queueListEl.innerHTML += `<div style="color:#666;text-align:center;padding:8px;">+${status.queue.length - 10} more</div>`;
    }

    // Add remove button handlers
    queueListEl.querySelectorAll('.queue-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        chrome.runtime.sendMessage({ action: 'removeFromQueue', id }, () => {
          updateUI();
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

// Initialize
loadSettings();
updateUI();
setInterval(updateUI, 2000);
