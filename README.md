# LinkedIn Auto-Connect

A Chrome extension that adds a "Queue" button to LinkedIn search results and automatically connects with people on a schedule.

## How It Works

1. **Search Results** - Adds "+ Queue" buttons next to each person in LinkedIn search
2. **Queue Management** - Click the button to add profiles to a connection queue
3. **Auto-Connect** - The extension automatically connects with queued profiles at configurable intervals

Everything runs entirely in the browser - no server, no external dependencies.

## Setup

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder from this project

That's it!

## Usage

1. **Go to LinkedIn** - Search for people: `linkedin.com/search/results/people/`
2. **Queue profiles** - Click "+ Queue" button on profiles you want to connect with
3. **Start processing** - Click the extension icon and press "Start"

The extension will:
- Open each profile in a background tab
- Click the Connect button
- Send connection without a note
- Wait randomly between min/max delay before the next one
- Close the tab automatically
- Detect weekly invitation limits and stop gracefully

## Extension Popup

Click the extension icon to:
- See queue status (total count, pending, completed, failed)
- Configure min/max delay between connections
- **Connect Next Now** - Skip the timer and connect immediately
- **Start/Pause** - Control auto-connecting
- **Clear Queue** - Remove all pending items
- **Click on a person** - Opens their LinkedIn profile in a new tab
- **Retry failed items** - Click ↻ to re-queue failed connections
- **View failure reasons** - See why a connection failed (e.g., "Weekly invitation limit reached")

## Files

```
linkedin-autoconnect/
└── extension/
    ├── manifest.json    # Extension configuration
    ├── background.js    # Queue management & scheduling
    ├── content.js       # Injects buttons on search page
    ├── content.css      # Button styling
    ├── popup.html       # Extension popup UI
    └── popup.js         # Popup logic
```

## Configuration

Adjust timing directly in the popup:
- **Min delay** - Minimum minutes between connections (default: 1)
- **Max delay** - Maximum minutes between connections (default: 3)

## Troubleshooting

**Button not appearing**
- Refresh the LinkedIn search page
- Make sure the extension is enabled in `chrome://extensions`

**Connect button not found on profile**
- Some profiles only show "Follow" or "Message"
- The extension will mark these as "failed" and move on
- Click ↻ to retry if needed

**Weekly invitation limit reached**
- LinkedIn limits how many invitations you can send per week
- The extension detects this and marks the connection as failed
- Wait until next week and retry the failed items

**Extension not working after Chrome restart**
- Open the extension popup and click "Start" to resume processing

## Disclaimer

Use responsibly. LinkedIn may restrict your account if you send too many connection requests. The random delays help but excessive use may still trigger limits.
