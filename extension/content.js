// LinkedIn Auto-Connect Content Script
// Shows floating "+ Queue" button on LinkedIn profile links

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

function showFloatButton(link, rect) {
  const profileUrl = link.href.split('?')[0];

  // Skip if it's the same link
  if (currentProfileLink === link) return;

  currentProfileLink = link;
  currentProfileInfo = {
    profileUrl,
    name: link.textContent.trim() || 'Unknown',
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
