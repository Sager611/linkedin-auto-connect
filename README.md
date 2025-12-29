# LinkedIn Auto-Connect

A purely local automation tool that adds a "Queue" button to LinkedIn search results and automatically sends connection requests.

## How It Works

1. **Chrome Extension** - Adds "+ Queue" buttons to LinkedIn search results
2. **Local Server** - Manages the queue of profiles to connect with
3. **Playwright Automation** - Opens profiles and sends connection requests

## Setup

### 1. Install Dependencies

```bash
cd linkedin-autoconnect
npm install
npx playwright install chromium
```

### 2. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder from this project

### 3. Start the Server

```bash
npm start
```

## Usage

1. **Start the server** - Run `npm start` in terminal
2. **Go to LinkedIn** - Search for people: `linkedin.com/search/results/people/`
3. **Queue profiles** - Click "+ Queue" button on profiles you want to connect with
4. **Start processing** - Click the extension icon and press "Start"

The automation will:
- Open each profile in a browser window
- Click the Connect button
- Send without a note (blank request)
- Wait 1-3 minutes randomly before the next one

## First Time Login

The first time the automation runs, you'll need to log in to LinkedIn in the browser window that opens. After that, your session is saved in `server/auth.json`.

## Extension Popup

Click the extension icon to:
- See queue status
- Start/Pause processing
- Clear pending items

## Files

```
linkedin-autoconnect/
├── extension/           # Chrome extension
│   ├── manifest.json
│   ├── content.js       # Injects buttons on LinkedIn
│   ├── content.css
│   ├── popup.html       # Extension popup UI
│   ├── popup.js
│   └── background.js
├── server/
│   ├── index.js         # Express server with queue
│   ├── automation.js    # Playwright automation
│   ├── queue.json       # Persisted queue (created at runtime)
│   └── auth.json        # LinkedIn session (created at runtime)
└── package.json
```

## Configuration

Edit `server/index.js` to change:
- `PORT` - Server port (default: 3847)
- Delay range in `processNext()` function (default: 60-180 seconds)

## Troubleshooting

**"Server offline" in extension**
- Make sure the server is running: `npm start`

**"Not logged in" error**
- The automation browser needs you to log in once. Run the server, start processing with at least one profile queued, and log in when the browser opens.

**Connect button not found**
- LinkedIn's UI varies. Some profiles show "Follow" instead of "Connect". The script tries multiple selectors but may not work for all profiles.

## Disclaimer

Use responsibly. LinkedIn may restrict your account if you send too many connection requests. The random delays help but excessive use may still trigger limits.
