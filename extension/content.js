// LinkedIn Auto-Connect Content Script
// Shows floating "+ Queue" button on LinkedIn profile links

// Detect and set current LinkedIn user
function detectCurrentUser() {
  // Only detect on LinkedIn
  if (!window.location.hostname.includes('linkedin.com')) return;

  // Try to find current user's profile link in navigation
  // The "Me" dropdown or profile link usually contains the user's URL
  const selectors = [
    'a[href*="/in/"][data-control-name="identity_welcome_message"]',
    '.global-nav__me-photo',
    'a.ember-view[href*="/in/"].global-nav__primary-link',
    '.feed-identity-module__actor-meta a[href*="/in/"]',
    'a[href*="/in/"].profile-rail-card__actor-link'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const href = el.getAttribute('href') || el.closest('a')?.getAttribute('href');
      if (href) {
        const match = href.match(/\/in\/([^\/\?]+)/);
        if (match) {
          const username = match[1];
          chrome.runtime.sendMessage({ action: 'setUser', user: username });
          console.log('LinkedIn Auto-Connect: Detected user:', username);
          return;
        }
      }
    }
  }

  // Fallback: try to extract from any script tag containing the user's info
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data['@type'] === 'Person' && data.url) {
        const match = data.url.match(/\/in\/([^\/\?]+)/);
        if (match) {
          chrome.runtime.sendMessage({ action: 'setUser', user: match[1] });
          console.log('LinkedIn Auto-Connect: Detected user from JSON-LD:', match[1]);
          return;
        }
      }
    } catch (e) {}
  }
}

// Detect user on LinkedIn pages
if (window.location.hostname.includes('linkedin.com')) {
  // Try immediately and retry after page loads
  detectCurrentUser();
  setTimeout(detectCurrentUser, 2000);
  setTimeout(detectCurrentUser, 5000);
}

// Create floating button
const floatBtn = document.createElement('div');
floatBtn.className = 'queue-float-btn';
floatBtn.innerHTML = '<span class="queue-float-btn-icon">+</span><span class="queue-float-btn-text">Queue</span>';
document.body.appendChild(floatBtn);

let currentProfileLink = null;
let currentProfileInfo = null;
let hideTimeout = null;

function updateFloatButtonState(status) {
  floatBtn.classList.remove('queued', 'sent');
  if (status === 'completed') {
    floatBtn.innerHTML = '<span class="queue-float-btn-icon">✓</span><span class="queue-float-btn-text">Sent</span>';
    floatBtn.classList.add('sent');
  } else if (status === 'pending') {
    floatBtn.innerHTML = '<span class="queue-float-btn-icon">✓</span><span class="queue-float-btn-text">Queued</span>';
    floatBtn.classList.add('queued');
  } else {
    floatBtn.innerHTML = '<span class="queue-float-btn-icon">+</span><span class="queue-float-btn-text">Queue</span>';
  }
}

function extractName(link) {
  const fullText = link.textContent.trim();

  // Split by common separators first
  const separators = /\s*[•·]\s*|\s{2,}|\n/;
  const parts = fullText.split(separators);
  let name = parts[0]?.trim() || fullText;

  // Check for duplicated name pattern (e.g., "John SmithJohn Smith")
  // Try different lengths to find where the duplication starts
  for (let len = 3; len < name.length / 2 + 1; len++) {
    const firstPart = name.substring(0, len);
    const rest = name.substring(len);
    if (rest.startsWith(firstPart) && len >= 3) {
      // Found duplication, return just the first part
      name = firstPart.trim();
      break;
    }
  }

  // Remove common suffixes that might have slipped through
  name = name.replace(/\s*(Premium|1st|2nd|3rd|degree|connection).*$/i, '').trim();

  // If still too long, truncate at a reasonable point
  if (name.length > 40) {
    const words = name.split(/\s+/);
    name = words.slice(0, 3).join(' ');
  }

  return name || 'Unknown';
}

function showFloatButton(link, rect) {
  const profileUrl = link.href.split('?')[0];

  // Skip if it's the same link
  if (currentProfileLink === link) return;

  currentProfileLink = link;
  currentProfileInfo = {
    profileUrl,
    name: extractName(link),
    headline: ''
  };

  // Position button at top-right of the link
  floatBtn.style.top = (rect.top + window.scrollY - 8) + 'px';
  floatBtn.style.left = (rect.right + window.scrollX - 8) + 'px';

  // Check queue status
  chrome.runtime.sendMessage(
    { action: 'isInQueue', profileUrl },
    (response) => {
      updateFloatButtonState(response?.status);
    }
  );

  floatBtn.classList.add('visible');
}

function hideFloatButton() {
  hideTimeout = setTimeout(() => {
    floatBtn.classList.remove('visible');
    currentProfileLink = null;
    currentProfileInfo = null;
  }, 200);
}

// Handle mouse movement to detect profile links
document.addEventListener('mousemove', (e) => {
  // Check if mouse is over the float button itself
  const btnRect = floatBtn.getBoundingClientRect();
  if (e.clientX >= btnRect.left && e.clientX <= btnRect.right &&
      e.clientY >= btnRect.top && e.clientY <= btnRect.bottom) {
    clearTimeout(hideTimeout);
    return;
  }

  // Find profile link under cursor
  const element = document.elementFromPoint(e.clientX, e.clientY);
  if (!element) return;

  // Check if element or parent is a profile link
  const link = element.closest('a[href*="linkedin.com/in/"]');

  if (link && link.href.match(/linkedin\.com\/in\/[^\/\?]+/)) {
    clearTimeout(hideTimeout);
    const rect = link.getBoundingClientRect();
    showFloatButton(link, rect);
  } else if (currentProfileLink) {
    // Check if we're still close to the current link
    const rect = currentProfileLink.getBoundingClientRect();
    const distance = Math.sqrt(
      Math.pow(e.clientX - (rect.left + rect.width/2), 2) +
      Math.pow(e.clientY - (rect.top + rect.height/2), 2)
    );
    if (distance > 100) {
      hideFloatButton();
    }
  }
});

// Keep button visible when hovering over it
floatBtn.addEventListener('mouseenter', () => {
  clearTimeout(hideTimeout);
});

floatBtn.addEventListener('mouseleave', () => {
  hideFloatButton();
});

// Handle click on float button
floatBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!currentProfileInfo) return;

  const isQueued = floatBtn.classList.contains('queued');
  const isSent = floatBtn.classList.contains('sent');

  if (isSent) return;

  if (isQueued) {
    chrome.runtime.sendMessage(
      { action: 'removeByUrl', profileUrl: currentProfileInfo.profileUrl },
      (response) => {
        if (response?.success) {
          updateFloatButtonState(null);
        }
      }
    );
  } else {
    chrome.runtime.sendMessage(
      { action: 'addToQueue', profile: currentProfileInfo },
      (response) => {
        if (response?.success) {
          updateFloatButtonState('pending');
        }
      }
    );
  }
});

console.log('LinkedIn Auto-Connect: Content script loaded');
