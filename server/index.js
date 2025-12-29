import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToProfile } from './automation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(__dirname, 'queue.json');
const PORT = 3847;

const app = express();
app.use(cors());
app.use(express.json());

// Queue state
let queue = [];
let isProcessing = false;
let processingTimeout = null;

// Load queue from file
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
      console.log(`Loaded ${queue.length} items from queue`);
    }
  } catch (err) {
    console.error('Failed to load queue:', err);
    queue = [];
  }
}

// Save queue to file
function saveQueue() {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  } catch (err) {
    console.error('Failed to save queue:', err);
  }
}

// Add profile to queue
app.post('/api/queue', (req, res) => {
  const { profileUrl, name, headline } = req.body;

  if (!profileUrl) {
    return res.status(400).json({ error: 'Missing profileUrl' });
  }

  // Check for duplicates
  if (queue.some(item => item.profileUrl === profileUrl)) {
    return res.status(400).json({ error: 'Already in queue' });
  }

  const item = {
    id: Date.now().toString(),
    profileUrl,
    name: name || 'Unknown',
    headline: headline || '',
    status: 'pending',
    addedAt: new Date().toISOString()
  };

  queue.push(item);
  saveQueue();

  console.log(`Added to queue: ${name} (${profileUrl})`);
  res.json({ success: true, item });
});

// Get queue status
app.get('/api/status', (req, res) => {
  res.json({
    isProcessing,
    total: queue.length,
    pending: queue.filter(i => i.status === 'pending').length,
    completed: queue.filter(i => i.status === 'completed').length,
    failed: queue.filter(i => i.status === 'failed').length,
    queue: queue.slice().reverse() // Most recent first
  });
});

// Start processing
app.post('/api/start', (req, res) => {
  if (!isProcessing) {
    isProcessing = true;
    console.log('Started processing queue');
    processNext();
  }
  res.json({ success: true, isProcessing: true });
});

// Pause processing
app.post('/api/pause', (req, res) => {
  isProcessing = false;
  if (processingTimeout) {
    clearTimeout(processingTimeout);
    processingTimeout = null;
  }
  console.log('Paused processing queue');
  res.json({ success: true, isProcessing: false });
});

// Clear pending items
app.post('/api/clear', (req, res) => {
  queue = queue.filter(item => item.status !== 'pending');
  saveQueue();
  console.log('Cleared pending items from queue');
  res.json({ success: true });
});

// Process next item in queue
async function processNext() {
  if (!isProcessing) return;

  const nextItem = queue.find(item => item.status === 'pending');
  if (!nextItem) {
    console.log('Queue empty, stopping');
    isProcessing = false;
    return;
  }

  console.log(`\nProcessing: ${nextItem.name}`);
  nextItem.status = 'processing';
  saveQueue();

  try {
    await connectToProfile(nextItem.profileUrl);
    nextItem.status = 'completed';
    nextItem.completedAt = new Date().toISOString();
    console.log(`Successfully connected: ${nextItem.name}`);
  } catch (err) {
    nextItem.status = 'failed';
    nextItem.error = err.message;
    console.error(`Failed to connect to ${nextItem.name}:`, err.message);
  }

  saveQueue();

  // Random delay 1-3 minutes before next
  const delay = Math.floor(Math.random() * 120000) + 60000; // 60-180 seconds
  console.log(`Waiting ${Math.round(delay / 1000)} seconds before next...`);

  processingTimeout = setTimeout(processNext, delay);
}

// Load queue and start server
loadQueue();

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   LinkedIn Auto-Connect Server             ║
║   Running on http://localhost:${PORT}        ║
╠════════════════════════════════════════════╣
║   Queue: ${queue.length.toString().padEnd(3)} items                        ║
║   Status: ${isProcessing ? 'Processing' : 'Paused    '}                     ║
╚════════════════════════════════════════════╝
  `);
});
