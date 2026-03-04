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
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  // ─── Navigation ───
  {
    name: 'navigate',
    description: 'Navigate to a URL. Use when you need to go to a specific page.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to navigate to' },
      },
      required: ['url'],
    },
  },

  // ─── Interaction ───
  {
    name: 'click',
    description: 'Click an element on the page. Use element ref numbers from the page snapshot.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference number from the page snapshot' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'fill',
    description: 'Type text into an input field, textarea, or contenteditable element. Clears existing content first by default.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference number of the input field' },
        text: { type: 'string', description: 'Text to type into the field' },
        clear: { type: 'boolean', description: 'Whether to clear existing content first (default: true)' },
      },
      required: ['ref', 'text'],
    },
  },
  {
    name: 'select_option',
    description: 'Select an option from a dropdown/select element by its visible label text.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference number of the select/dropdown' },
        value: { type: 'string', description: 'The visible text of the option to select' },
      },
      required: ['ref', 'value'],
    },
  },
  {
    name: 'check',
    description: 'Check or uncheck a checkbox or toggle a radio button.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference number of the checkbox/radio' },
        checked: { type: 'boolean', description: 'Whether to check (true) or uncheck (false). Default: true' },
      },
      required: ['ref'],
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element to reveal tooltips, dropdown menus, or trigger hover states.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference number to hover over' },
      },
      required: ['ref'],
    },
  },

  // ─── Keyboard ───
  {
    name: 'press_key',
    description: 'Press a keyboard key or key combination. Use for Enter, Tab, Escape, Backspace, ArrowDown, Control+A, etc.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name (e.g. "Enter", "Tab", "Escape", "ArrowDown", "Control+A")' },
      },
      required: ['key'],
    },
  },

  // ─── Scroll ───
  {
    name: 'scroll',
    description: 'Scroll the page up or down to reveal more content.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Pixels to scroll (default: 500)' },
      },
      required: ['direction'],
    },
  },

  // ─── Wait ───
  {
    name: 'wait',
    description: 'Wait for content to load or animations to complete. Use when the page is loading or transitioning.',
    parameters: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milliseconds to wait (max 10000)' },
        reason: { type: 'string', description: 'Why you are waiting' },
      },
      required: ['ms'],
    },
  },

  // ─── Overlay Handling ───
  {
    name: 'dismiss_overlay',
    description: 'Dismiss a popup, cookie banner, modal, or overlay. Clicks the specified close/dismiss button, or presses Escape if no ref given.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference of the close/dismiss button (optional — if omitted, presses Escape)' },
      },
      required: [],
    },
  },

  // ─── Assertions ───
  {
    name: 'assert_visible',
    description: 'Assert that specific text is visible on the page. Use to verify expected content, headings, messages, labels, or values.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text that should be visible on the page' },
        exact: { type: 'boolean', description: 'Require exact match (default: false, uses substring/contains)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'assert_not_visible',
    description: 'Assert that specific text is NOT visible on the page. Use to verify error messages are gone, elements were removed, etc.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text that should NOT be visible' },
      },
      required: ['text'],
    },
  },
  {
    name: 'assert_url',
    description: 'Assert the current page URL contains or matches a pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text the URL should contain, or a regex pattern' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'assert_element',
    description: 'Assert that an element exists with specific state (checked, disabled, expanded, has specific value).',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Element reference number' },
        state: { type: 'string', enum: ['checked', 'unchecked', 'disabled', 'enabled', 'expanded', 'collapsed'], description: 'Expected element state' },
      },
      required: ['ref', 'state'],
    },
  },

  // ─── Human Handoff ───
  {
    name: 'wait_for_user',
    description: 'Pause and ask the user to intervene. ONLY use for CAPTCHAs, MFA prompts, or login forms that require real credentials.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'What the user needs to do and why' },
      },
      required: ['reason'],
    },
  },

  // ─── Terminal: Test Complete ───
  {
    name: 'done',
    description: 'Declare the test complete with a pass or fail result. Call ONLY when you can determine the final test outcome.',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string', enum: ['pass', 'fail'], description: 'Test result: pass if all expectations met, fail otherwise' },
        summary: { type: 'string', description: 'Detailed summary of what happened, what was verified, and the outcome' },
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
