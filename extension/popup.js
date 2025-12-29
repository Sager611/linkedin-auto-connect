const SERVER_URL = 'http://localhost:3847';

async function fetchStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/api/status`);
    if (!response.ok) throw new Error('Server error');
    return await response.json();
  } catch (err) {
    return null;
  }
}

async function updateUI() {
  const status = await fetchStatus();

  const serverStatusEl = document.getElementById('server-status');
  const queueCountEl = document.getElementById('queue-count');
  const processingStatusEl = document.getElementById('processing-status');
  const queueListEl = document.getElementById('queue-list');
  const toggleBtn = document.getElementById('toggle-btn');

  if (!status) {
    serverStatusEl.textContent = 'Offline';
    serverStatusEl.className = 'status-value paused';
    queueCountEl.textContent = '-';
    processingStatusEl.textContent = '-';
    queueListEl.innerHTML = '<div class="error">Server not running.<br>Run: npm start</div>';
    toggleBtn.disabled = true;
    return;
  }

  serverStatusEl.textContent = 'Online';
  serverStatusEl.className = 'status-value active';
  toggleBtn.disabled = false;

  queueCountEl.textContent = `${status.pending} pending`;

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
      .slice(0, 10)
      .map(item => `
        <div class="queue-item">
          <div class="queue-item-name">${escapeHtml(item.name)}</div>
          <div class="queue-item-status">${item.status}</div>
        </div>
      `)
      .join('');

    if (status.queue.length > 10) {
      queueListEl.innerHTML += `<div style="color:#666;text-align:center;padding:8px;">+${status.queue.length - 10} more</div>`;
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('toggle-btn').addEventListener('click', async () => {
  const status = await fetchStatus();
  if (!status) return;

  const endpoint = status.isProcessing ? '/api/pause' : '/api/start';
  await fetch(`${SERVER_URL}${endpoint}`, { method: 'POST' });
  updateUI();
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (confirm('Clear all pending items from the queue?')) {
    await fetch(`${SERVER_URL}/api/clear`, { method: 'POST' });
    updateUI();
  }
});

// Update UI on load and periodically
updateUI();
setInterval(updateUI, 2000);
