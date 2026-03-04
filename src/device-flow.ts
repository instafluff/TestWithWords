// GitHub Device Flow — the "enter this code at github.com/login/device" experience
// Same flow used by Copilot CLI, gh CLI, and VS Code
// No client secret needed — public OAuth Apps use device flow safely

import { execSync } from 'child_process';

const CLIENT_ID = 'Ov23ligwaNI0zOpkeaLc';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const SCOPES = ''; // No scopes needed — GitHub Models just needs authentication

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * Start the GitHub Device Flow.
 * Returns the user code and verification URL for the user to visit,
 * along with a function to poll for the token.
 */
export async function startDeviceFlow(): Promise<{
  userCode: string;
  verificationUri: string;
  pollForToken: () => Promise<string>;
}> {
  // Step 1: Request a device code
  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub device code request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as DeviceCodeResponse;

  if (!data.device_code || !data.user_code) {
    throw new Error(`Unexpected response from GitHub: ${JSON.stringify(data)}`);
  }

  // Step 2: Return the code and a poller function
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    pollForToken: () => pollForAccessToken(data.device_code, data.interval, data.expires_in),
  };
}

/**
 * Poll GitHub for the access token until the user approves or it expires.
 */
async function pollForAccessToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<string> {
  const startTime = Date.now();
  const timeoutMs = expiresIn * 1000;
  // GitHub requires at least `interval` seconds between polls
  const pollInterval = Math.max(interval, 5) * 1000;

  while (Date.now() - startTime < timeoutMs) {
    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await response.json() as TokenResponse;

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      // User hasn't approved yet — keep polling
      continue;
    }

    if (data.error === 'slow_down') {
      // We're polling too fast — increase interval
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Login timed out. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Login was denied. Please try again.');
    }

    if (data.error) {
      throw new Error(`GitHub auth error: ${data.error} — ${data.error_description || ''}`);
    }
  }

  throw new Error('Login timed out. Please try again.');
}

/**
 * Open a URL in the user's default browser.
 */
export function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    // Silently fail — user can open manually
  }
}
