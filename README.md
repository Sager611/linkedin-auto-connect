# LinkedIn Auto-Connect

A Chrome extension that adds a "Queue" button to LinkedIn search results and automatically connects with people on a schedule.

## How It Works

1. **Search Results** - Adds "+ Queue" buttons next to each person in LinkedIn search
2. **Queue Management** - Click the button to add profiles to a connection queue
3. **Auto-Connect** - The extension automatically connects with queued profiles every 1-3 minutes

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
- Wait 1-3 minutes randomly before the next one
- Close the tab automatically

## Extension Popup

Click the extension icon to:
- See queue status (pending, completed, failed)
- Start/Pause auto-connecting
- Clear pending items from queue

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

Edit `extension/background.js` to change timing:
- `MIN_DELAY` - Minimum minutes between connections (default: 1)
- `MAX_DELAY` - Maximum minutes between connections (default: 3)

## Troubleshooting

**Button not appearing**
- Refresh the LinkedIn search page
- Make sure the extension is enabled in `chrome://extensions`

**Connect button not found on profile**
- Some profiles only show "Follow" or "Message"
- The extension will mark these as "failed" and move on

**Extension not working after Chrome restart**
- Open the extension popup and click "Start" to resume processing

## Disclaimer

Use responsibly. LinkedIn may restrict your account if you send too many connection requests. The random delays help but excessive use may still trigger limits.
