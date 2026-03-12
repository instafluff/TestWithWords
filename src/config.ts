// Project-level config file (.twwrc.json) — provides defaults for CLI options
// CLI flags always override config file values.

import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import type { ProviderType } from './auth.js';
import type { BrowserType } from './browser.js';

const CONFIG_FILENAME = '.twwrc.json';
const PROJECT_CONFIG_PROVIDERS: ProviderType[] = ['github', 'azure', 'openai', 'custom'];
const PROJECT_CONFIG_BROWSERS: BrowserType[] = ['chromium', 'firefox', 'webkit', 'chrome', 'edge'];

/** Shape of the .twwrc.json config file */
export interface ProjectConfig {
  provider?: ProviderType;
  model?: string;
  timeout?: number;
  retries?: number;
  output?: string;
  port?: number;
  browser?: BrowserType;
  screenshotEveryStep?: boolean;
  maxSteps?: number;
  showTokenUsage?: boolean;
  showSponsorMessage?: boolean;
}

/**
 * Load project config from .twwrc.json in the current directory (or parent dirs).
 * Returns empty config if none found.
 */
export async function loadProjectConfig(): Promise<ProjectConfig> {
  const configPath = await findConfigFile();
  if (!configPath) return {};

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    return validateConfig(parsed, configPath);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${configPath}: ${err.message}`);
    }
    throw err;
  }
}

/** Search for .twwrc.json from cwd upwards */
async function findConfigFile(): Promise<string | null> {
  let dir = resolve('.');
  const root = resolve('/');

  while (true) {
    const candidate = join(dir, CONFIG_FILENAME);
    try {
      await readFile(candidate, 'utf-8');
      return candidate;
    } catch {
      // Not found, try parent
    }

    const parent = resolve(dir, '..');
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  return null;
}

/** Validate config values and return clean config */
function validateConfig(raw: Record<string, unknown>, path: string): ProjectConfig {
  const config: ProjectConfig = {};

  if (raw.provider !== undefined) {
    if (typeof raw.provider !== 'string' || !PROJECT_CONFIG_PROVIDERS.includes(raw.provider as ProviderType)) {
      throw new Error(`${path}: "provider" must be one of ${PROJECT_CONFIG_PROVIDERS.join(', ')}`);
    }
    config.provider = raw.provider as ProviderType;
  }

  if (raw.model !== undefined) {
    if (typeof raw.model !== 'string') throw new Error(`${path}: "model" must be a string`);
    config.model = raw.model;
  }

  if (raw.timeout !== undefined) {
    if (typeof raw.timeout !== 'number' || raw.timeout <= 0) throw new Error(`${path}: "timeout" must be a positive number (ms)`);
    config.timeout = raw.timeout;
  }

  if (raw.retries !== undefined) {
    if (typeof raw.retries !== 'number' || raw.retries < 0) throw new Error(`${path}: "retries" must be a non-negative number`);
    config.retries = Math.floor(raw.retries);
  }

  if (raw.output !== undefined) {
    if (typeof raw.output !== 'string') throw new Error(`${path}: "output" must be a string`);
    config.output = raw.output;
  }

  if (raw.port !== undefined) {
    if (typeof raw.port !== 'number') throw new Error(`${path}: "port" must be a number`);
    config.port = raw.port;
  }

  if (raw.browser !== undefined) {
    if (typeof raw.browser !== 'string' || !PROJECT_CONFIG_BROWSERS.includes(raw.browser as BrowserType)) {
      throw new Error(`${path}: "browser" must be one of ${PROJECT_CONFIG_BROWSERS.join(', ')}`);
    }
    config.browser = raw.browser as BrowserType;
  }

  if (raw.screenshotEveryStep !== undefined) {
    if (typeof raw.screenshotEveryStep !== 'boolean') throw new Error(`${path}: "screenshotEveryStep" must be a boolean`);
    config.screenshotEveryStep = raw.screenshotEveryStep;
  }

  if (raw.maxSteps !== undefined) {
    if (typeof raw.maxSteps !== 'number' || raw.maxSteps <= 0) throw new Error(`${path}: "maxSteps" must be a positive number`);
    config.maxSteps = Math.floor(raw.maxSteps);
  }

  if (raw.showTokenUsage !== undefined) {
    if (typeof raw.showTokenUsage !== 'boolean') throw new Error(`${path}: "showTokenUsage" must be a boolean`);
    config.showTokenUsage = raw.showTokenUsage;
  }

  if (raw.showSponsorMessage !== undefined) {
    if (typeof raw.showSponsorMessage !== 'boolean') throw new Error(`${path}: "showSponsorMessage" must be a boolean`);
    config.showSponsorMessage = raw.showSponsorMessage;
  }

  return config;
}

/** Generate a default .twwrc.json content */
export function generateDefaultConfig(): string {
  const config: ProjectConfig = {
    provider: 'github',
    browser: 'chromium',
  };
  return JSON.stringify(config, null, 2) + '\n';
}
