// LLM integration — sends page state to the model, gets back tool calls
// Uses OpenAI function calling (tool-use) for structured, extensible actions.
// Supports GitHub Models (free!), Azure OpenAI, OpenAI, and any OpenAI-compatible API.

import OpenAI, { AzureOpenAI } from 'openai';
import type { ToolCall, PageState, TokenUsage, LLMResult } from './types.js';
import type { AuthConfig } from './auth.js';
import { getSystemPrompt, getUserPrompt } from './prompts.js';
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

/** Conversation history for the current test run */
let conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [];

/** Reset conversation for a new test */
export function resetConversation(): void {
  conversationHistory = [];
}

/**
 * Ask the LLM for the next tool call given the current page state.
 * Uses OpenAI function calling — the LLM picks a tool and provides arguments.
 * Maintains conversation history so the LLM has full context of the test run.
 * Returns the tool call + token usage from the API response.
 */
export async function getNextToolCall(
  scenario: string,
  pageState: PageState,
  stepIndex: number,
  model: string,
): Promise<LLMResult> {
  if (!client) throw new Error('LLM not initialized. Call initLLMFromConfig() first.');

  // On first step, set up the system prompt
  if (conversationHistory.length === 0) {
    conversationHistory.push({
      role: 'system',
      content: getSystemPrompt(),
    });
  }

  // Add the current page state as a user message
  conversationHistory.push({
    role: 'user',
    content: getUserPrompt(scenario, pageState, stepIndex),
  });

  const response = await client.chat.completions.create({
    model,
    messages: conversationHistory,
    temperature: 0.1,
    max_tokens: 500,
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

  // Add assistant message with tool call to history
  conversationHistory.push({
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: tc.id,
      type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }],
  });

  // Add tool result to history (brief, so the LLM knows what happened)
  conversationHistory.push({
    role: 'tool',
    tool_call_id: tc.id,
    content: 'Executed. See updated page state in next message.',
  });

  // Trim old conversation to control token usage
  trimHistory();

  return { toolCall, usage };
}

/**
 * Report a tool execution result back to the conversation.
 * Called after executing a tool so the LLM knows about errors.
 */
export function reportToolResult(toolCallId: string, result: string): void {
  // The tool result was already added in getNextToolCall with a generic message.
  // For errors, we update the last tool message with the actual result.
  const lastToolMsg = [...conversationHistory].reverse().find(m => m.role === 'tool');
  if (lastToolMsg && 'content' in lastToolMsg) {
    (lastToolMsg as any).content = result;
  }
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

/**
 * Trim conversation history to avoid token limit issues.
 * Keeps system prompt + the last 6 exchanges (user + assistant + tool messages).
 * More aggressive trimming helps stay within smaller model limits (e.g. gpt-4o-mini 8K).
 */
function trimHistory(): void {
  const MAX_MESSAGES = 15; // ~5 full exchanges (user + assistant + tool)
  const nonSystem = conversationHistory.filter(m => m.role !== 'system');
  if (nonSystem.length > MAX_MESSAGES) {
    const system = conversationHistory.find(m => m.role === 'system');
    const keep = nonSystem.slice(-MAX_MESSAGES);
    conversationHistory = system ? [system, ...keep] : keep;
  }
}
