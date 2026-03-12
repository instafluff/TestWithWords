import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAvailableModels } from '../auth.js';

type MockFetch = typeof fetch;
const originalFetch = globalThis.fetch;

function mockFetch(response: Partial<Response>): MockFetch {
  return (async () => response as Response) as MockFetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchAvailableModels', () => {
  it('parses GitHub Models array responses and returns chat model names', async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      json: async () => [
        { id: 'opaque-1', name: 'gpt-4o-mini', task: 'chat-completion' },
        { id: 'opaque-2', name: 'text-embedding-3-large', task: 'embeddings' },
        { id: 'opaque-3', name: 'Meta-Llama-3.1-8B-Instruct', task: 'chat-completion' },
      ],
    });

    const models = await fetchAvailableModels('token', 'https://models.inference.ai.azure.com');

    assert.deepEqual(models, ['Meta-Llama-3.1-8B-Instruct', 'gpt-4o-mini']);
  });

  it('supports OpenAI-style object responses with data arrays', async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o-mini' },
          { id: 'gpt-4o' },
        ],
      }),
    });

    const models = await fetchAvailableModels('token', 'https://api.openai.com/v1');

    assert.deepEqual(models, ['gpt-4o', 'gpt-4o-mini']);
  });

  it('returns null when the endpoint fails', async () => {
    globalThis.fetch = mockFetch({
      ok: false,
    });

    const models = await fetchAvailableModels('token', 'https://models.inference.ai.azure.com');

    assert.equal(models, null);
  });
});
