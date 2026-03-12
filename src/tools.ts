// Tool definitions for LLM function calling
// Each tool represents a browser action the AI agent can perform.
// Adding a new capability = adding one tool definition here + one executor in executors.ts.

import type { FunctionDefinition } from 'openai/resources/shared.js';

/** Registry of all available tools for the agent */
export interface ToolDefinition {
  /** Tool name (matches the function name in LLM tool calls) */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema for parameters */
  parameters: FunctionDefinition['parameters'];
  /** Whether this tool ends the test (like 'done') */
  terminal?: boolean;
}

/**
 * All tools available to the agent.
 * The LLM sees these as callable functions. The executors handle the actual Playwright commands.
 * Descriptions are kept minimal to reduce input token count.
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  // ─── Navigation ───
  {
    name: 'navigate',
    description: 'Go to a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL' },
      },
      required: ['url'],
    },
  },

  // ─── Interaction ───
  {
    name: 'click',
    description: 'Click an element by ref number.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element ref' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'fill',
    description: 'Type text into an input field. Clears existing content first.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Input field ref' },
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['ref', 'text'],
    },
  },
  {
    name: 'select_option',
    description: 'Select a dropdown option by visible text.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Select element ref' },
        value: { type: 'string', description: 'Option text' },
      },
      required: ['ref', 'value'],
    },
  },
  {
    name: 'check',
    description: 'Check/uncheck a checkbox or radio button.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element ref' },
        checked: { type: 'boolean', description: 'true=check, false=uncheck' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element ref' },
      },
      required: ['ref'],
    },
  },

  // ─── Keyboard ───
  {
    name: 'press_key',
    description: 'Press a key (Enter, Tab, Escape, ArrowDown, Control+A, etc).',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name' },
      },
      required: ['key'],
    },
  },

  // ─── Scroll ───
  {
    name: 'scroll',
    description: 'Scroll the page.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
        amount: { type: 'number', description: 'Pixels (default 500)' },
      },
      required: ['direction'],
    },
  },

  // ─── Wait ───
  {
    name: 'wait',
    description: 'Wait for content to load.',
    parameters: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milliseconds (max 10000)' },
      },
      required: ['ms'],
    },
  },

  // ─── Overlay Handling ───
  {
    name: 'dismiss_overlay',
    description: 'Dismiss popup/modal/cookie banner. Click close button ref or press Escape.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Close button ref (omit to press Escape)' },
      },
      required: [],
    },
  },

  // ─── Assertions ───
  {
    name: 'assert_visible',
    description: 'Assert text is visible on the page.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Expected text (substring match)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'assert_not_visible',
    description: 'Assert text is NOT visible on the page.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text that should not appear' },
      },
      required: ['text'],
    },
  },
  {
    name: 'assert_url',
    description: 'Assert current URL contains a pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'URL substring or regex' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'assert_element',
    description: 'Assert element state.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element ref' },
        state: { type: 'string', enum: ['checked', 'unchecked', 'disabled', 'enabled', 'expanded', 'collapsed'] },
      },
      required: ['ref', 'state'],
    },
  },

  // ─── Human Handoff ───
  {
    name: 'wait_for_user',
    description: 'Pause for user intervention (CAPTCHA, MFA, login).',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'What the user needs to do' },
      },
      required: ['reason'],
    },
  },

  // ─── Terminal: Test Complete ───
  {
    name: 'done',
    description: 'Declare the test pass or fail.',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['pass', 'fail'] },
        summary: { type: 'string', description: 'What happened and why' },
      },
      required: ['result', 'summary'],
    },
    terminal: true,
  },
];

/**
 * Convert tool definitions to OpenAI function calling format.
 */
export function getToolsForLLM(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: FunctionDefinition['parameters'] };
}> {
  return AGENT_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Check if a tool call is terminal (ends the test).
 */
export function isTerminalTool(name: string): boolean {
  return AGENT_TOOLS.find(t => t.name === name)?.terminal ?? false;
}
