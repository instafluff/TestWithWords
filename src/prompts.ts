// Prompts for the LLM — compact system prompt + stateless page state
// Optimized for low token budgets (e.g. GitHub Models free tier ~8K input tokens).
// Each LLM call is stateless: system prompt + one user message with action log + page state.

import type { PageState } from './types.js';

/** Compact record of a completed action for the history log */
export interface ActionRecord {
  /** Tool name (e.g. "click", "navigate") */
  tool: string;
  /** Compact argument summary (e.g. "[5] 'See Demo'") */
  target: string;
  /** Whether it succeeded */
  ok: boolean;
  /** Error message if failed */
  error?: string;
}

export function getSystemPrompt(): string {
  return `You are a browser test agent. Execute the scenario by calling tools.

Rules:
- Call ONE tool per turn using element ref numbers from the snapshot
- Use page context (headings, text) to verify expectations
- If loading, call wait. If overlay blocks, use dismiss_overlay or press_key Escape
- When done: call done with pass/fail
- If stuck (action fails twice), try a different approach
- Never invent ref numbers — only use refs from the snapshot`;
}

/**
 * Build a compact action summary from the history log.
 */
function formatActionHistory(history: ActionRecord[]): string {
  if (history.length === 0) return '';
  const lines = history.map((a, i) => {
    const status = a.ok ? '✓' : `✗ ${a.error || 'failed'}`;
    return `${i + 1}. ${a.tool} ${a.target} ${status}`;
  });
  return `## Done\n${lines.join('\n')}`;
}

export function getUserPrompt(
  scenario: string,
  pageState: PageState,
  stepIndex: number,
  actionHistory: ActionRecord[] = [],
): string {
  const parts: string[] = [];

  // Always include scenario so the LLM knows the goal
  parts.push(`## Scenario\n${scenario}`);

  // Compact action history — replaces full conversation history
  const historyText = formatActionHistory(actionHistory);
  if (historyText) {
    parts.push('');
    parts.push(historyText);
  }

  parts.push('');
  parts.push(`## Page (step ${stepIndex})`);
  parts.push(`URL: ${pageState.url}`);
  if (pageState.title) parts.push(`Title: ${pageState.title}`);

  const ctx = pageState.pageContext;

  // Overlays are high-priority — they block interaction
  if (ctx.overlays.length > 0) {
    parts.push('');
    parts.push('## Overlays');
    for (const o of ctx.overlays) {
      parts.push(`- ${o.type}: "${o.text.slice(0, 100)}"${o.hasCloseButton ? ' (close btn)' : ''}`);
    }
  }

  if (ctx.errors.length > 0) {
    parts.push('');
    parts.push('## Errors');
    parts.push(ctx.errors.slice(0, 3).join('\n'));
  }

  if (ctx.headings.length > 0) {
    parts.push('');
    parts.push('## Headings');
    parts.push(ctx.headings.slice(0, 6).join(', '));
  }

  parts.push('');
  parts.push('## Elements');
  parts.push(pageState.treeText);

  // Only include visible text if it adds value (and keep it very short)
  if (ctx.visibleText.length > 0) {
    parts.push('');
    parts.push('## Text');
    parts.push(ctx.visibleText.slice(0, 300));
  }

  if (ctx.forms.length > 0) {
    parts.push('');
    parts.push('## Forms');
    parts.push(ctx.forms.slice(0, 8).join('\n'));
  }

  parts.push('');
  parts.push('Next action?');

  return parts.join('\n');
}
