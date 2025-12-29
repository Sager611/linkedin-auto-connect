// LinkedIn Auto-Connect Content Script
// Injects "Queue Connect" buttons on search results

const SERVER_URL = 'http://localhost:3847';

// Track which profiles already have buttons
const processedProfiles = new Set();

function extractProfileInfo(card) {
  // Get profile link using data-view-name attribute
  const linkEl = card.querySelector('a[data-view-name="search-result-lockup-title"]');
  if (!linkEl) return null;

  const profileUrl = linkEl.href.split('?')[0]; // Remove query params

  // Get name from the link text
  const name = linkEl.textContent.trim() || 'Unknown';

  // Get headline - it's in a paragraph after the name section
  // Look for the paragraph containing job title info
  const paragraphs = card.querySelectorAll('p');
  let headline = '';
  for (const p of paragraphs) {
    const text = p.textContent.trim();
    // Skip the name paragraph and connection degree indicators
    if (text && !text.includes('1st') && !text.includes('2nd') && !text.includes('3rd') && text !== name) {
      headline = text;
      break;
    }
  }

  return { profileUrl, name, headline };
}

function createQueueButton(profileInfo) {
  const button = document.createElement('button');
  button.className = 'queue-connect-btn';
  button.textContent = '+ Queue';
  button.title = 'Add to auto-connect queue';
  
  console.log('LinkedIn Auto-Connect: Creating queue button for profile:', profileInfo);

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    button.disabled = true;
    button.textContent = 'Adding...';

    try {
      const response = await fetch(`${SERVER_URL}/api/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileInfo)
      });

      if (response.ok) {
        button.textContent = '✓ Queued';
        button.classList.add('queued');
      } else {
        const data = await response.json();
        button.textContent = data.error || 'Error';
        button.disabled = false;
      }
    } catch (err) {
      button.textContent = 'Server offline';
      button.disabled = false;
      console.error('LinkedIn Auto-Connect: Failed to add to queue:', err);
    }
  });

  return button;
}

function injectButtons() {
  // Find all search result cards
  const cards = document.querySelectorAll('[data-view-name="people-search-result"]');

  console.log('LinkedIn Auto-Connect: Found', cards.length, 'cards');

  cards.forEach(card => {
    // Skip if already has our button
    if (card.querySelector('.queue-connect-btn')) return;

    const profileInfo = extractProfileInfo(card);
    if (!profileInfo) {
      console.log('LinkedIn Auto-Connect: Could not extract profile info');
      return;
    }

    if (processedProfiles.has(profileInfo.profileUrl)) return;

    // Find the Connect button by aria-label (most reliable)
    const connectBtn = card.querySelector('a[aria-label*="connect" i], button[aria-label*="connect" i]');

    if (!connectBtn) {
      console.log('LinkedIn Auto-Connect: No connect button found for:', profileInfo.name);
      return;
    }

    processedProfiles.add(profileInfo.profileUrl);

    const button = createQueueButton(profileInfo);

    // Create a wrapper div for proper positioning
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: inline-block; margin-right: 8px;';
    wrapper.appendChild(button);

    // Insert before the connect button's container
    const connectContainer = connectBtn.closest('[data-view-name]') || connectBtn.parentElement;
    connectContainer.parentElement.insertBefore(wrapper, connectContainer);

    console.log('LinkedIn Auto-Connect: Added button for:', profileInfo.name);
  });
}

// Run on page load with retries (content loads async)
function initWithRetry(attempts = 0) {
  injectButtons();

  // Retry a few times as content loads asynchronously
  if (attempts < 5) {
    setTimeout(() => initWithRetry(attempts + 1), 1000);
  }
}

// Wait for initial page load
setTimeout(initWithRetry, 1000);

// Re-run when new results load (infinite scroll)
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(injectButtons, 500);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('LinkedIn Auto-Connect: Content script loaded');
