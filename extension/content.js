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

  console.log('LinkedIn Auto-Connect: Injecting buttons for cards:', cards);

  cards.forEach(card => {
    const profileInfo = extractProfileInfo(card);
    if (!profileInfo || processedProfiles.has(profileInfo.profileUrl)) {
      console.log('LinkedIn Auto-Connect: Skipping profile:', profileInfo.profileUrl);
      return;
    }

    processedProfiles.add(profileInfo.profileUrl);

    // Find the actions area (where Connect/Message buttons are)
    // Use data-view-name attributes which are more stable than obfuscated classes
    const actionsContainer = card.querySelector('[data-view-name="relationship-building-button"]')
      || card.querySelector('[data-view-name="edge-creation-connect-action"]');

    if (!actionsContainer) {
      console.log('LinkedIn Auto-Connect: No actions container found for card:', card);
      return;
    }

    const button = createQueueButton(profileInfo);
    // Insert before the connect button container
    actionsContainer.parentElement.insertBefore(button, actionsContainer);
  });
}

// Run on page load
injectButtons();

// Re-run when new results load (infinite scroll)
const observer = new MutationObserver((mutations) => {
  let shouldInject = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldInject = true;
      break;
    }
  }
  if (shouldInject) {
    setTimeout(injectButtons, 500);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('LinkedIn Auto-Connect: Content script loaded');
