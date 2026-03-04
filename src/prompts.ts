// Prompts for the LLM — slim system prompt + rich page state
// Tool definitions are in tools.ts and provided via function calling.
// The system prompt focuses on behavior, rules, and strategy.

import type { PageState } from './types.js';

export function getSystemPrompt(): string {
  return `You are a browser automation agent for UI testing. You execute test scenarios step by step by calling tools.

## How It Works
1. You receive a test scenario in natural language
2. You see the current page state: URL, title, interactive elements, page context
3. You call ONE tool to perform an action
4. After the tool executes, you'll see the updated page state
5. Repeat until the test passes or fails

## Page Context
You receive rich context extracted from the page:
- **Headings**: Visible headings
- **Visible text**: Main text content
- **Overlays**: Cookie banners, modals, popups, dialogs
- **Errors**: Error messages on the page
- **Forms**: Form fields and their current state
Use ALL of this to make informed decisions.

## Handling Overlays & Popups
When the page context shows an overlay:
1. Look for a dismiss button ("Reject", "Decline", "Close", "X", "Accept") in the element tree
2. Use dismiss_overlay with the ref of that button
3. If no button found, try press_key with Escape
4. Only use wait_for_user if it requires human credentials (MFA, CAPTCHA)

## Rules
- Call exactly ONE tool per turn
- Use element ref numbers from the page snapshot — never guess or invent ref numbers
- Use page context (headings, visible text, errors) to verify expectations
- If the page is loading, use wait (1000-3000ms)
- When expectations are met, call done with result "pass"
- When the test cannot succeed after reasonable attempts, call done with result "fail"
- Do NOT get stuck in loops — if an action fails twice, try something different
- Keep descriptions concise — they are shown to the user`;
}

export function getUserPrompt(
  scenario: string,
  pageState: PageState,
  stepIndex: number,
): string {
  const parts: string[] = [];

  if (stepIndex === 0) {
    parts.push(`## Test Scenario\n${scenario}`);
    parts.push('');
  }

  parts.push(`## Current Page (Step ${stepIndex})`);
  parts.push(`URL: ${pageState.url}`);
  parts.push(`Title: ${pageState.title}`);

  // Page context — gives the LLM understanding of what's on screen
  const ctx = pageState.pageContext;

  if (ctx.headings.length > 0) {
    parts.push('');
    parts.push('## Headings');
    parts.push(ctx.headings.map(h => `- ${h}`).join('\n'));
  }

  if (ctx.overlays.length > 0) {
    parts.push('');
    parts.push('## ⚠ Overlays Detected');
    for (const o of ctx.overlays) {
      parts.push(`- **${o.type}**: "${o.text.slice(0, 150)}"${o.hasCloseButton ? ' (has close button)' : ''}`);
    }
  }

  if (ctx.errors.length > 0) {
    parts.push('');
    parts.push('## ❌ Errors on Page');
    for (const e of ctx.errors) {
      parts.push(`- ${e}`);
    }
  }

  if (ctx.forms.length > 0) {
    parts.push('');
    parts.push('## Form State');
    for (const f of ctx.forms) {
      parts.push(`- ${f}`);
    }
  }

  parts.push('');
  parts.push('## Interactive Elements');
  parts.push(pageState.treeText);

  if (ctx.visibleText.length > 0) {
    parts.push('');
    parts.push('## Visible Text (trimmed)');
    // Only send first 400 chars to save tokens — interactive elements matter more
    parts.push(ctx.visibleText.slice(0, 400));
  }

  parts.push('');
  parts.push('What is the next action?');

  return parts.join('\n');
}
