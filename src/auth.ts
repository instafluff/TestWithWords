// Auth config — persistent credential storage and provider management
// Saves to ~/.testwithwords/config.json so users only auth once

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import OpenAI, { AzureOpenAI } from 'openai';

const CONFIG_DIR = join(homedir(), '.testwithwords');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const MODEL_CACHE_FILE = join(CONFIG_DIR, 'model-cache.json');
const MODEL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_DYNAMIC_MODEL_PROBES = 20;

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

export interface ValidationResult {
  ok: boolean;
  error?: string;
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
  'Meta-Llama-3.1-8B-Instruct',
];

// Keep the old export name for backward compat
export const GITHUB_MODELS = GITHUB_MODELS_FALLBACK;

interface ModelListEntry {
  id?: string;
  name?: string;
  task?: string;
}

interface ModelCacheEntry {
  checkedAt: number;
  modelSetHash: string;
  compatibleModels: string[];
}

interface ModelCacheFile {
  entries: Record<string, ModelCacheEntry>;
}

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

    const payload = await response.json() as ModelListEntry[] | { data?: ModelListEntry[] };
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : null;

    if (!entries || entries.length === 0) return null;

    const models = entries
      .filter((m) => !m.task || m.task === 'chat-completion')
      .map((m) => {
        if (typeof m.name === 'string' && m.name.trim()) return m.name.trim();
        if (typeof m.id === 'string' && m.id.trim()) return m.id.trim();
        return null;
      })
      .filter((id): id is string => Boolean(id))
      .filter((id, index, all) => all.indexOf(id) === index)
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
  const saved = await loadConfig();

  // 1. Explicit env vars
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    return {
      provider: 'github',
      apiKey: githubToken,
      baseURL: PROVIDERS.github.baseURL,
      model: saved?.provider === 'github' ? saved.model : PROVIDERS.github.defaultModel,
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
      model: saved?.provider === 'azure' ? saved.model : PROVIDERS.azure.defaultModel,
      apiVersion: saved?.provider === 'azure' ? saved.apiVersion : '2024-06-01',
      displayName: 'Azure OpenAI (env)',
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: saved?.provider === 'openai' ? saved.model : PROVIDERS.openai.defaultModel,
      displayName: 'OpenAI (env)',
    };
  }

  // 2. Saved config
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

function createClient(config: AuthConfig): OpenAI | AzureOpenAI {
  if (config.provider === 'azure') {
    return new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: (config.baseURL || '').replace(/\/$/, ''),
      apiVersion: config.apiVersion || '2024-06-01',
    });
  }

  const opts: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey: config.apiKey,
  };

  if (config.baseURL) {
    opts.baseURL = config.baseURL;
  }

  return new OpenAI(opts);
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function getCacheKey(provider: ProviderType, apiKey: string, baseURL?: string): string {
  return hashValue(`${provider}|${baseURL || ''}|${apiKey}`);
}

function getModelSetHash(models: string[]): string {
  return hashValue([...models].sort().join('\n'));
}

async function loadModelCache(): Promise<ModelCacheFile> {
  try {
    if (!existsSync(MODEL_CACHE_FILE)) {
      return { entries: {} };
    }
    const data = await readFile(MODEL_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(data) as ModelCacheFile;
    return parsed.entries ? parsed : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

async function saveModelCache(cache: ModelCacheFile): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(MODEL_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function prioritizeModels(models: string[], preferredModel?: string): string[] {
  const unique = models.filter((model, index) => models.indexOf(model) === index);
  if (!preferredModel || !unique.includes(preferredModel)) {
    return unique;
  }
  return [preferredModel, ...unique.filter(model => model !== preferredModel)];
}

export async function getCompatibleChatModels(
  provider: ProviderType,
  apiKey: string,
  baseURL: string | undefined,
  models: string[],
  preferredModel?: string,
): Promise<{
  models: string[];
  usedCache: boolean;
  checkedCount: number;
  totalCount: number;
}> {
  const orderedModels = prioritizeModels(models, preferredModel);
  const candidates = orderedModels.slice(0, MAX_DYNAMIC_MODEL_PROBES);
  const cacheKey = getCacheKey(provider, apiKey, baseURL);
  const modelSetHash = getModelSetHash(orderedModels);
  const cache = await loadModelCache();
  const cached = cache.entries[cacheKey];

  if (
    cached
    && cached.modelSetHash === modelSetHash
    && (Date.now() - cached.checkedAt) < MODEL_CACHE_TTL_MS
  ) {
    return {
      models: cached.compatibleModels.filter(model => orderedModels.includes(model)),
      usedCache: true,
      checkedCount: Math.min(orderedModels.length, MAX_DYNAMIC_MODEL_PROBES),
      totalCount: orderedModels.length,
    };
  }

  const compatibleModels: string[] = [];

  for (const model of candidates) {
    const validation = await validateAuthConfig({
      provider,
      apiKey,
      baseURL,
      model,
      displayName: PROVIDERS[provider].displayName,
    });

    if (validation.ok) {
      compatibleModels.push(model);
    }
  }

  cache.entries[cacheKey] = {
    checkedAt: Date.now(),
    modelSetHash,
    compatibleModels,
  };
  await saveModelCache(cache);

  return {
    models: compatibleModels,
    usedCache: false,
    checkedCount: candidates.length,
    totalCount: orderedModels.length,
  };
}

/**
 * Validate that the configured provider/model combination can actually answer
 * a tiny chat request. Used during `tww auth` so bad models don't get saved.
 */
export async function validateAuthConfig(config: AuthConfig): Promise<ValidationResult> {
  try {
    const client = createClient(config);
    await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 5,
      temperature: 0,
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: formatValidationError(config, error),
    };
  }
}

function formatValidationError(config: AuthConfig, error: unknown): string {
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: number }).status)
    : undefined;

  const message = error instanceof Error ? error.message : String(error);

  if (status === 401) {
    return 'Authentication failed. Your token/key was rejected.';
  }

  if (status === 403) {
    if (config.provider === 'github') {
      return 'GitHub accepted the token, but this account/token does not have access to GitHub Models. If you use a PAT, it needs the models:read permission.';
    }
    return 'Access forbidden by the provider.';
  }

  if (status === 404) {
    if (config.provider === 'azure') {
      return `Deployment not found: ${config.model}. For Azure OpenAI, this must be your deployment name, not the base model name.`;
    }
    return `Model not found: ${config.model}.`;
  }

  if (status === 429) {
    if (config.provider === 'github') {
      return 'GitHub Models rate limit hit for this account/model. Try gpt-4o-mini or a smaller open model, or wait for the limit to reset.';
    }
    return 'Rate limit hit. Try again in a moment.';
  }

  if (config.provider === 'github' && /model|deployment|not found|unsupported/i.test(message)) {
    return `That model is not available through the GitHub Models API: ${config.model}.`;
  }

  return message;
}
