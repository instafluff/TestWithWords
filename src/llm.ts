// LLM integration — sends page state to the model, gets back tool calls
// Uses OpenAI function calling (tool-use) for structured, extensible actions.
// Supports GitHub Models (free!), Azure OpenAI, OpenAI, and any OpenAI-compatible API.
//
// STATELESS architecture: each call builds a fresh 2-message conversation
// (system + user) with a compact action log instead of accumulating history.
// This keeps token usage constant regardless of step count, critical for
// low-budget endpoints like GitHub Models free tier (~8K input tokens).

import OpenAI, { AzureOpenAI } from 'openai';
import type { ToolCall, PageState, TokenUsage, LLMResult } from './types.js';
import type { AuthConfig } from './auth.js';
import { getSystemPrompt, getUserPrompt } from './prompts.js';
import type { ActionRecord } from './prompts.js';
import { getToolsForLLM } from './tools.js';

let client: OpenAI | null = null;
let providerName: string = '';
let activeModel: string = '';

/** Which LLM provider is active */
export function getProviderName(): string {
  return providerName;
}

/** Which model is active */
export function getActiveModel(): string {
  return activeModel;
}

/**
 * Initialize the LLM client from an AuthConfig.
 */
export function initLLMFromConfig(config: AuthConfig): void {
  activeModel = config.model;
  providerName = config.displayName;

  if (config.provider === 'azure') {
    client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: (config.baseURL || '').replace(/\/$/, ''),
      apiVersion: config.apiVersion || '2024-06-01',
    });
  } else {
    // GitHub Models, OpenAI, and custom all use the standard OpenAI SDK
    const opts: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: config.apiKey,
    };
    if (config.baseURL) {
      opts.baseURL = config.baseURL;
    }
    client = new OpenAI(opts);
  }
}

/** Reset conversation for a new test (no-op in stateless mode, kept for API compat) */
export function resetConversation(): void {
  // Stateless mode — nothing to reset
}

/**
 * Ask the LLM for the next tool call given the current page state.
 * Uses STATELESS mode: builds a fresh 2-message conversation each call
 * with a compact action history instead of accumulating conversation.
 * Returns the tool call + token usage from the API response.
 */
export async function getNextToolCall(
  scenario: string,
  pageState: PageState,
  stepIndex: number,
  model: string,
  actionHistory: ActionRecord[] = [],
): Promise<LLMResult> {
  if (!client) throw new Error('LLM not initialized. Call initLLMFromConfig() first.');

  // Build fresh messages each call — no history accumulation
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: getUserPrompt(scenario, pageState, stepIndex, actionHistory) },
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.1,
    max_tokens: 400,
    tools: getToolsForLLM(),
    tool_choice: 'required',
  });

  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error('LLM returned empty response');
  }

  // Capture token usage
  const usage: TokenUsage | null = response.usage
    ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }
    : null;

  // Extract the tool call
  const toolCalls = message.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    // Fallback: if the LLM returned text instead of a tool call, try to parse it
    if (message.content) {
      return { toolCall: parseFallbackContent(message.content), usage };
    }
    throw new Error('LLM did not return a tool call');
  }

  // Take the first tool call (we only expect one per turn)
  const tc = toolCalls[0];
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(tc.function.arguments);
  } catch {
    throw new Error(`LLM returned invalid tool arguments: ${tc.function.arguments}`);
  }

  const toolCall: ToolCall = {
    name: tc.function.name,
    args,
  };

  return { toolCall, usage };
}

/**
 * Report a tool execution result back to the conversation.
 * No-op in stateless mode — errors are tracked via ActionRecord history.
 */
export function reportToolResult(_toolCallId: string, _result: string): void {
  // Stateless mode — errors are passed back via actionHistory
}

/**
 * Fallback parser for when the LLM returns text instead of a tool call.
 * Tries to parse JSON from the response content.
 */
function parseFallbackContent(content: string): ToolCall {
  try {
    const parsed = JSON.parse(content);
    // Try old format: { type: "click", ref: 5, description: "..." }
    if (parsed.type) {
      const name = parsed.type === 'type' ? 'fill' :
                   parsed.type === 'select' ? 'select_option' :
                   parsed.type === 'key' ? 'press_key' :
                   parsed.type;
      const { type, description, ...args } = parsed;
      return { name, args };
    }
    // Try: { name: "click", args: { ref: 5 } }
    if (parsed.name) {
      return { name: parsed.name, args: parsed.args || {} };
    }
  } catch {
    // Not JSON
  }
  throw new Error(`LLM returned text instead of a tool call: ${content.slice(0, 200)}`);
}
