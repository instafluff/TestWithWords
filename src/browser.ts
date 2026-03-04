// Browser connection — two modes:
// 1. Standalone (default): Launch Playwright's bundled browser — zero setup, works everywhere
//    Supports: chromium (default), firefox, webkit
// 2. Attached (--attach): Connect to user's running browser via CDP — gets cookies, SSO, auth
//    Supports: chrome, edge (any Chromium-based browser)

import { chromium, firefox, webkit } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/** Browsers available in standalone mode (Playwright engines) */
export type StandaloneBrowser = 'chromium' | 'firefox' | 'webkit';

/** Browsers available in attach mode (user's installed browsers) */
export type AttachBrowser = 'chrome' | 'edge';

/** All supported browser identifiers */
export type BrowserType = StandaloneBrowser | AttachBrowser;

/** Valid browser names for --browser flag */
export const VALID_BROWSERS = ['chromium', 'firefox', 'webkit', 'chrome', 'edge'] as const;

/** Standalone engines available via Playwright */
export const STANDALONE_BROWSERS: StandaloneBrowser[] = ['chromium', 'firefox', 'webkit'];

/** Browsers that support CDP attach */
export const ATTACH_BROWSERS: AttachBrowser[] = ['chrome', 'edge'];

export interface BrowserConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  browserType: BrowserType;
  /** Human-readable label for the connection */
  label: string;
  close: () => Promise<void>;
}

// ─── Standalone Mode (default) ───

const ENGINE_MAP = { chromium, firefox, webkit };

/**
 * Launch a Playwright-managed browser.
 * Supports chromium (default), firefox, and webkit.
 */
export async function launchStandalone(
  engine: StandaloneBrowser = 'chromium',
  headless: boolean = false,
): Promise<BrowserConnection> {
  const engineImpl = ENGINE_MAP[engine];
  const label = engine.charAt(0).toUpperCase() + engine.slice(1);

  const browser = await engineImpl.launch({
    headless,
    args: engine === 'chromium' ? ['--disable-blink-features=AutomationControlled'] : undefined,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    browserType: engine,
    label: headless ? `${label} (headless)` : label,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

// ─── Attached Mode (--attach) ───

/**
 * Connect to an already-running browser via Chrome DevTools Protocol.
 * Works with both Edge and Chrome — they both support CDP.
 * Reuses the user's session: cookies, SSO tokens, authenticated state.
 */
export async function connectToBrowser(cdpUrl: string): Promise<BrowserConnection> {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const browserType = await detectBrowserType(cdpUrl);
  const detected = browserType === 'edge' ? 'Edge' : 'Chrome';

  // Get the default context (which has the user's cookies/sessions)
  const contexts = browser.contexts();
  let context: BrowserContext;

  if (contexts.length > 0) {
    context = contexts[0];
  } else {
    context = await browser.newContext();
  }

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    browserType,
    label: `${detected} at ${cdpUrl}`,
    close: async () => {
      await page.close();
      // Don't close the browser — it's the user's browser!
    },
  };
}

/**
 * Check if a Chromium browser (Edge or Chrome) is listening on the CDP port
 */
export async function isBrowserAvailable(cdpUrl: string): Promise<boolean> {
  try {
    const versionUrl = cdpUrl.replace(/\/$/, '') + '/json/version';
    const response = await fetch(versionUrl);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Detect whether the connected browser is Edge or Chrome
 */
async function detectBrowserType(cdpUrl: string): Promise<BrowserType> {
  try {
    const versionUrl = cdpUrl.replace(/\/$/, '') + '/json/version';
    const response = await fetch(versionUrl);
    const info = (await response.json()) as { Browser?: string };
    const name = info.Browser?.toLowerCase() || '';
    if (name.includes('edg')) return 'edge';
    return 'chrome';
  } catch {
    return 'chrome';
  }
}

// ─── Auto-launch user's browser (for --attach mode) ───

interface BrowserPaths {
  exe: string;
  paths: string[];
}

const BROWSER_PATHS: Record<'chrome' | 'edge', BrowserPaths> = {
  chrome: {
    exe: process.platform === 'win32' ? 'chrome' : 'google-chrome',
    paths: process.platform === 'win32' ? [
      `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
    ] : [],
  },
  edge: {
    exe: process.platform === 'win32' ? 'msedge' : 'microsoft-edge',
    paths: process.platform === 'win32' ? [
      `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ] : [],
  },
};

/**
 * Detect which user browser is installed. Prefers Chrome, falls back to Edge.
 * Returns null if neither is found.
 */
export function detectInstalledBrowser(): 'chrome' | 'edge' | null {
  for (const type of ['chrome', 'edge'] as const) {
    if (isBrowserInstalled(type)) return type;
  }
  return null;
}

function isBrowserInstalled(type: 'chrome' | 'edge'): boolean {
  const info = BROWSER_PATHS[type];
  if (process.platform === 'win32') {
    for (const p of info.paths) {
      if (existsSync(p)) return true;
    }
    try { execSync(`where ${info.exe}`, { stdio: 'ignore' }); return true; } catch { return false; }
  }
  try { execSync(`which ${info.exe}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function getBrowserExe(type: 'chrome' | 'edge'): string {
  const info = BROWSER_PATHS[type];
  if (process.platform === 'win32') {
    for (const p of info.paths) {
      if (existsSync(p)) return p;
    }
  }
  return info.exe;
}

// ─── TWW Browser Profile & Cookie Copy ───

/** Stable profile directory for TWW-managed browser instances */
function getTwwProfileDir(type: 'chrome' | 'edge'): string {
  return path.join(os.homedir(), '.tww', 'browser-profile', type);
}

/**
 * Get the source profile directory for the user's real browser.
 * Returns the "User Data" parent dir and the "Default" profile subdir.
 */
function getSourceProfilePaths(type: 'chrome' | 'edge'): { userDataDir: string; defaultDir: string } | null {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'];
    if (!localAppData) return null;
    const userDataDir = type === 'edge'
      ? path.join(localAppData, 'Microsoft', 'Edge', 'User Data')
      : path.join(localAppData, 'Google', 'Chrome', 'User Data');
    return { userDataDir, defaultDir: path.join(userDataDir, 'Default') };
  }

  if (process.platform === 'darwin') {
    const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
    const userDataDir = type === 'edge'
      ? path.join(appSupport, 'Microsoft Edge')
      : path.join(appSupport, 'Google', 'Chrome');
    return { userDataDir, defaultDir: path.join(userDataDir, 'Default') };
  }

  // Linux
  const configDir = os.homedir();
  const userDataDir = type === 'edge'
    ? path.join(configDir, '.config', 'microsoft-edge')
    : path.join(configDir, '.config', 'google-chrome');
  return { userDataDir, defaultDir: path.join(userDataDir, 'Default') };
}

/**
 * Copy auth-relevant files from the user's real browser profile into the
 * TWW profile directory. This carries over cookies, login sessions, and
 * encryption keys so the TWW browser instance has the user's auth state.
 *
 * Fails silently per-file — files may not exist or may be locked.
 */
async function copyBrowserProfile(type: 'chrome' | 'edge', twwProfileDir: string): Promise<void> {
  const sourcePaths = getSourceProfilePaths(type);
  if (!sourcePaths) return;

  const { userDataDir, defaultDir } = sourcePaths;

  // Skip if source profile doesn't exist
  if (!existsSync(defaultDir)) return;

  const destDefaultDir = path.join(twwProfileDir, 'Default');
  await fs.mkdir(destDefaultDir, { recursive: true });

  // Copy auth-relevant files from Default/ (cookies, login sessions, etc.)
  const filesToCopy = ['Cookies', 'Login Data', 'Web Data'];
  for (const file of filesToCopy) {
    const src = path.join(defaultDir, file);
    const dest = path.join(destDefaultDir, file);
    try {
      await fs.copyFile(src, dest);
    } catch {
      // File may not exist or be locked — skip silently
    }
  }

  // Copy "Local State" from the User Data parent dir — contains encryption
  // keys needed to decrypt cookies. Without it, copied cookies are useless.
  try {
    await fs.copyFile(
      path.join(userDataDir, 'Local State'),
      path.join(twwProfileDir, 'Local State'),
    );
  } catch {
    // May not exist or be locked — skip silently
  }
}

/**
 * Launch the user's browser (Chrome or Edge) with remote debugging enabled.
 *
 * Uses --user-data-dir to force a truly separate browser process that always
 * respects --remote-debugging-port, regardless of existing browser instances.
 * This avoids the Windows "Startup boost" problem where Edge/Chrome hand off
 * to an already-running process and silently ignore the debugging flag.
 *
 * Copies cookies and auth data from the user's real profile so sessions work.
 */
export async function launchUserBrowser(
  type: 'chrome' | 'edge',
  port: number = 9222,
  waitMs: number = 20000,
): Promise<BrowserConnection> {
  const name = type === 'edge' ? 'Edge' : 'Chrome';
  const twwProfileDir = getTwwProfileDir(type);

  // Ensure the profile directory exists
  await fs.mkdir(twwProfileDir, { recursive: true });

  // Copy cookies and auth state from the user's real profile
  await copyBrowserProfile(type, twwProfileDir);

  const exe = getBrowserExe(type);
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${twwProfileDir}`,
  ];

  // Launch as a detached process so it survives our exit
  if (process.platform === 'win32') {
    // On Windows, exe paths may contain spaces — quote and use shell: true
    const child = spawn(`"${exe}"`, args, {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.unref();
  } else {
    const child = spawn(exe, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  // Wait for CDP to become available
  const cdpUrl = `http://localhost:${port}`;
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    if (await isBrowserAvailable(cdpUrl)) {
      return connectToBrowser(cdpUrl);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(
    `${name} launched but CDP not available on port ${port} after ${waitMs / 1000}s.\n` +
    `Troubleshooting:\n` +
    getLaunchInstructions(type, port),
  );
}

/**
 * Get instructions for launching a browser with remote debugging.
 * Used as fallback when auto-launch fails.
 */
export function getLaunchInstructions(
  browserType: 'chrome' | 'edge' = 'chrome',
  port: number = 9222,
): string {
  if (process.platform === 'win32') {
    const exe = browserType === 'edge' ? 'msedge' : 'chrome';
    return [
      `  1. Run:  start ${exe} --remote-debugging-port=${port} --user-data-dir="%USERPROFILE%\\.tww\\browser-profile\\${browserType}"`,
      `  2. Then re-run your tww command`,
    ].join('\n');
  }

  const exe = browserType === 'edge' ? 'microsoft-edge' : 'google-chrome';
  return [
    `  1. Run:  ${exe} --remote-debugging-port=${port} --user-data-dir="$HOME/.tww/browser-profile/${browserType}" &`,
    `  2. Then re-run your tww command`,
  ].join('\n');
}
