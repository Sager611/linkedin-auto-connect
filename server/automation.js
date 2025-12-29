import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, 'auth.json');

let browser = null;
let context = null;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: false, // Show browser so you can see what's happening
      slowMo: 100 // Slow down actions slightly
    });
  }

  if (!context) {
    // Load saved authentication state if it exists
    const storageState = fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined;

    context = await browser.newContext({
      storageState,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }

  return context;
}

export async function saveAuth() {
  if (context) {
    await context.storageState({ path: AUTH_FILE });
    console.log('Authentication state saved');
  }
}

export async function connectToProfile(profileUrl) {
  const ctx = await getBrowser();
  const page = await ctx.newPage();

  try {
    // Navigate to profile
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });

    // Check if logged in
    const loginButton = await page.$('a[href*="login"]');
    if (loginButton) {
      throw new Error('Not logged in - please log in manually first');
    }

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for Connect button - LinkedIn has various button patterns
    const connectButton = await page.$(
      'button:has-text("Connect"):not(:has-text("Message")), ' +
      'button[aria-label*="connect" i], ' +
      'div.pvs-profile-actions button:has-text("Connect")'
    );

    if (!connectButton) {
      // Maybe we're already connected or there's a "More" button
      const moreButton = await page.$('button[aria-label="More actions"]');
      if (moreButton) {
        await moreButton.click();
        await page.waitForTimeout(500);

        const connectInMenu = await page.$('div[role="menu"] span:has-text("Connect")');
        if (connectInMenu) {
          await connectInMenu.click();
        } else {
          throw new Error('Connect option not found in menu');
        }
      } else {
        // Check if already connected
        const messageButton = await page.$('button:has-text("Message")');
        if (messageButton) {
          throw new Error('Already connected or cannot connect');
        }
        throw new Error('Connect button not found');
      }
    } else {
      await connectButton.click();
    }

    // Wait for modal
    await page.waitForTimeout(1000);

    // Handle the connection modal
    // Look for "Send without a note" or just "Send" button
    const sendButton = await page.$(
      'button[aria-label="Send without a note"], ' +
      'button[aria-label="Send now"], ' +
      'button:has-text("Send without a note"), ' +
      'button:has-text("Send")'
    );

    if (sendButton) {
      await sendButton.click();
      await page.waitForTimeout(1000);
    }

    // Save auth state after successful action
    await saveAuth();

    console.log(`Connection request sent to: ${profileUrl}`);
  } finally {
    await page.close();
  }
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});

process.on('SIGTERM', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});
