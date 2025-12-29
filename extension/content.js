// LinkedIn Auto-Connect Content Script
// Injects "Queue Connect" buttons on search results

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
  button.textContent = '+ Queue'; // Default state
  button.dataset.profileUrl = profileInfo.profileUrl;

  // Check if already in queue
  chrome.runtime.sendMessage(
    { action: 'isInQueue', profileUrl: profileInfo.profileUrl },
    (response) => {
      if (response?.inQueue) {
        setButtonState(button, 'queued');
      } else {
        setButtonState(button, 'add');
      }
    }
  );

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isQueued = button.classList.contains('queued');
    button.disabled = true;

    if (isQueued) {
      // Remove from queue
      button.textContent = 'Removing...';
      chrome.runtime.sendMessage(
        { action: 'removeByUrl', profileUrl: profileInfo.profileUrl },
        (response) => {
          if (response?.success) {
            setButtonState(button, 'add');
          }
          button.disabled = false;
        }
      );
    } else {
      // Add to queue
      button.textContent = 'Adding...';
      chrome.runtime.sendMessage(
        { action: 'addToQueue', profile: profileInfo },
        (response) => {
          if (response?.success) {
            setButtonState(button, 'queued');
          } else if (response?.error === 'Already in queue') {
            setButtonState(button, 'queued');
          } else {
            button.textContent = response?.error || 'Error';
          }
          button.disabled = false;
        }
      );
    }
  });

  return button;
}

function setButtonState(button, state) {
  if (state === 'queued') {
    button.textContent = '✓ Queued';
    button.title = 'Click to remove from queue';
    button.classList.add('queued');
  } else {
    button.textContent = '+ Queue';
    button.title = 'Add to auto-connect queue';
    button.classList.remove('queued');
  }
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

    // Find the action button area (Connect, Follow, or Message)
    const actionBtn = card.querySelector(
      'a[aria-label*="connect" i], button[aria-label*="connect" i], ' +
      'a[aria-label*="follow" i], button[aria-label*="follow" i], ' +
      'a[aria-label="Message" i], button[aria-label="Message" i]'
    );

    if (!actionBtn) {
      console.log('LinkedIn Auto-Connect: No action button found for:', profileInfo.name);
      return;
    }

    processedProfiles.add(profileInfo.profileUrl);

    const button = createQueueButton(profileInfo);

    // Check if this is a Message-only card (no Connect/Follow)
    const isMessageOnly = actionBtn.getAttribute('aria-label') === 'Message';
    if (isMessageOnly) {
      button.style.marginTop = '32px';
    }

    // Find the relationship-building-button container which holds all action buttons
    const relationshipContainer = card.querySelector('[data-view-name="relationship-building-button"]');

    if (relationshipContainer) {
      // Create wrapper and insert at the beginning of the container
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display: inline-flex; align-items: center; margin-right: 8px;';
      wrapper.setAttribute('data-view-name', 'queue-connect-action');
      wrapper.appendChild(button);

      // Insert as first child of the relationship container's inner div
      const innerContainer = relationshipContainer.firstElementChild;
      if (innerContainer) {
        innerContainer.insertBefore(wrapper, innerContainer.firstChild);
      } else {
        relationshipContainer.insertBefore(wrapper, relationshipContainer.firstChild);
      }
    } else {
      // Fallback: insert right after the action button
      button.style.marginLeft = '8px';
      actionBtn.parentElement.appendChild(button);
    }

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
