// Auth config — persistent credential storage and provider management
// Saves to ~/.testwithwords/config.json so users only auth once

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const CONFIG_DIR = join(homedir(), '.testwithwords');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/** Supported LLM providers */
export type ProviderType = 'github' | 'azure' | 'openai' | 'custom';

/** Saved auth configuration */
export interface AuthConfig {
  provider: ProviderType;
  /** API key or token */
  apiKey: string;
  /** Base URL for the API (required for azure/custom) */
  baseURL?: string;
  /** Model to use */
  model: string;
  /** API version (for Azure) */
  apiVersion?: string;
  /** Display name for the provider */
  displayName: string;
}

/** Provider presets */
export const PROVIDERS: Record<ProviderType, {
  displayName: string;
  baseURL?: string;
  defaultModel: string;
  description: string;
}> = {
  github: {
    displayName: 'GitHub Models',
    baseURL: 'https://models.inference.ai.azure.com',
    defaultModel: 'gpt-4o-mini',
    description: 'Free with any GitHub account',
  },
  openai: {
    displayName: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    description: 'Direct OpenAI API',
  },
  azure: {
    displayName: 'Azure OpenAI',
    defaultModel: 'gpt-4o-mini',
    description: 'Azure OpenAI Service',
  },
  custom: {
    displayName: 'Custom (OpenAI-compatible)',
    defaultModel: 'gpt-4o-mini',
    description: 'Any OpenAI-compatible API (Ollama, LM Studio, etc.)',
  },
};

/** Available models on GitHub Models (free tier) — used as fallback when API list fails */
export const GITHUB_MODELS_FALLBACK = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3-mini',
  'o1-mini',
];

// Keep the old export name for backward compat
export const GITHUB_MODELS = GITHUB_MODELS_FALLBACK;

/**
 * Fetch available models from an OpenAI-compatible API.
 * Uses the GET /models endpoint. Returns model IDs sorted alphabetically,
 * or null if the fetch fails.
 */
export async function fetchAvailableModels(
  apiKey: string,
  baseURL?: string,
): Promise<string[] | null> {
  try {
    const url = (baseURL || 'https://models.inference.ai.azure.com').replace(/\/$/, '') + '/models';
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json() as { data?: Array<{ id: string }> };
    if (!data.data || !Array.isArray(data.data)) return null;

    const models = data.data
      .map((m: { id: string }) => m.id)
      .filter((id: string) => id && typeof id === 'string')
      .sort();

    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

/**
 * Load saved auth config, or return null if not configured.
 */
export async function loadConfig(): Promise<AuthConfig | null> {
  try {
    if (!existsSync(CONFIG_FILE)) return null;
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as AuthConfig;
  } catch {
    return null;
  }
}

/**
 * Save auth config to disk.
 */
export async function saveConfig(config: AuthConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Delete saved auth config.
 */
export async function clearConfig(): Promise<void> {
  try {
    const { unlink } = await import('fs/promises');
    await unlink(CONFIG_FILE);
  } catch {
    // Already gone
  }
}

/**
 * Try to auto-detect a GitHub token from:
 * 1. GITHUB_TOKEN env var
 * 2. gh CLI auth token
 */
export function tryAutoDetectGitHub(): string | null {
  // Env var
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) return envToken;

  // gh CLI
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the active auth config, checking in order:
 * 1. Env vars (GITHUB_TOKEN, AZURE_OPENAI_API_KEY, OPENAI_API_KEY)
 * 2. Saved config file
 * 3. Auto-detect from gh CLI
 */
export async function resolveAuth(): Promise<AuthConfig | null> {
  // 1. Explicit env vars
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    return {
      provider: 'github',
      apiKey: githubToken,
      baseURL: PROVIDERS.github.baseURL,
      model: PROVIDERS.github.defaultModel,
      displayName: 'GitHub Models (env)',
    };
  }

  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (azureKey && azureEndpoint) {
    return {
      provider: 'azure',
      apiKey: azureKey,
      baseURL: azureEndpoint,
      model: PROVIDERS.azure.defaultModel,
      apiVersion: '2024-06-01',
      displayName: 'Azure OpenAI (env)',
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: PROVIDERS.openai.defaultModel,
      displayName: 'OpenAI (env)',
    };
  }

  // 2. Saved config
  const saved = await loadConfig();
  if (saved) return saved;

  // 3. Auto-detect gh CLI
  const ghToken = tryAutoDetectGitHub();
  if (ghToken) {
    return {
      provider: 'github',
      apiKey: ghToken,
      baseURL: PROVIDERS.github.baseURL,
      model: PROVIDERS.github.defaultModel,
      displayName: 'GitHub Models (gh CLI)',
    };
  }

  return null;
}

/**
 * Get the config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
