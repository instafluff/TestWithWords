// Tool executors — map tool calls to Playwright commands
// Each tool from tools.ts gets an executor function here.
// Adding a new tool = one definition in tools.ts + one executor here.

import type { Page } from 'playwright-core';
import type { PageElement } from './types.js';
import * as readline from 'readline';

/** Result of executing a tool */
export interface ToolResult {
  success: boolean;
  error?: string;
  /** Optional data returned by the tool (e.g., assertion results) */
  data?: Record<string, unknown>;
}

/** Registry of tool executors, keyed by tool name */
type ToolExecutor = (
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  actionTimeout: number,
) => Promise<ToolResult>;

const executors: Record<string, ToolExecutor> = {
  navigate: executeNavigate,
  click: executeClick,
  fill: executeFill,
  select_option: executeSelectOption,
  check: executeCheck,
  hover: executeHover,
  press_key: executePressKey,
  scroll: executeScroll,
  wait: executeWait,
  dismiss_overlay: executeDismissOverlay,
  assert_visible: executeAssertVisible,
  assert_not_visible: executeAssertNotVisible,
  assert_url: executeAssertUrl,
  assert_element: executeAssertElement,
  wait_for_user: executeWaitForUser,
  done: executeDone,
};

/**
 * Execute a tool call by name with the given arguments.
 */
export async function executeTool(
  toolName: string,
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  actionTimeout: number,
): Promise<ToolResult> {
  const executor = executors[toolName];
  if (!executor) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  try {
    return await executor(page, args, elements, actionTimeout);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ─── Element Locator ────────────────────────────────────────────────

/**
 * Find an element by ref and build a Playwright locator.
 * Uses data-tww-ref for DOM-sourced elements (reliable),
 * or role + name for accessibility tree elements.
 */
function getLocatorForRef(page: Page, ref: number, elements: PageElement[]) {
  const el = elements.find(e => e.ref === ref);
  if (!el) {
    throw new Error(`Element ref [${ref}] not found in page snapshot`);
  }

  // DOM-sourced elements have a data attribute (most reliable)
  if (el.fromDOM) {
    return { locator: page.locator(`[data-tww-ref="${ref}"]`), element: el };
  }

  // Accessibility tree elements use role + name
  const role = el.role as any;
  if (el.name) {
    return { locator: page.getByRole(role, { name: el.name, exact: false }), element: el };
  }

  // Fallback: role only
  return { locator: page.getByRole(role), element: el };
}

/** Get the first matching locator (handles multiple matches gracefully) */
async function resolveLocator(page: Page, ref: number, elements: PageElement[]) {
  const { locator, element } = getLocatorForRef(page, ref, elements);
  const count = await locator.count();
  return { target: count > 1 ? locator.first() : locator, element };
}

// ─── Tool Executors ─────────────────────────────────────────────────

async function executeNavigate(
  page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const url = args.url as string;
  await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
  return { success: true };
}

async function executeClick(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  timeout: number,
): Promise<ToolResult> {
  const { target } = await resolveLocator(page, args.ref as number, elements);
  await target.click({ timeout });
  // Wait for any navigation or DOM updates
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  return { success: true };
}

async function executeFill(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  timeout: number,
): Promise<ToolResult> {
  const { target } = await resolveLocator(page, args.ref as number, elements);
  const text = args.text as string;
  const clear = (args.clear as boolean) ?? true;

  if (clear) {
    await target.fill(text, { timeout });
  } else {
    await target.pressSequentially(text, { delay: 30, timeout });
  }
  return { success: true };
}

async function executeSelectOption(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  timeout: number,
): Promise<ToolResult> {
  const { target, element } = await resolveLocator(page, args.ref as number, elements);
  const value = args.value as string;

  // Check if it's actually a radio/checkbox — click instead of selectOption
  const tagName = await target.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
  const inputType = await target.evaluate(el => (el as HTMLInputElement).type?.toLowerCase()).catch(() => '');

  if (tagName === 'input' && (inputType === 'radio' || inputType === 'checkbox')) {
    await target.click({ timeout });
    return { success: true };
  }

  await target.selectOption({ label: value }, { timeout });
  return { success: true };
}

async function executeCheck(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  timeout: number,
): Promise<ToolResult> {
  const { target } = await resolveLocator(page, args.ref as number, elements);
  const shouldCheck = (args.checked as boolean) ?? true;

  if (shouldCheck) {
    await target.check({ timeout });
  } else {
    await target.uncheck({ timeout });
  }
  return { success: true };
}

async function executeHover(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  timeout: number,
): Promise<ToolResult> {
  const { target } = await resolveLocator(page, args.ref as number, elements);
  await target.hover({ timeout });
  // Brief wait for hover effects
  await page.waitForTimeout(300);
  return { success: true };
}

async function executePressKey(
  page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const key = args.key as string;
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
  return { success: true };
}

async function executeScroll(
  page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const direction = args.direction as 'up' | 'down';
  const amount = (args.amount as number) || 500;
  const delta = direction === 'down' ? amount : -amount;
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(500);
  return { success: true };
}

async function executeWait(
  _page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const ms = Math.min((args.ms as number) || 1000, 10000);
  await new Promise(resolve => setTimeout(resolve, ms));
  return { success: true };
}

async function executeDismissOverlay(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
  timeout: number,
): Promise<ToolResult> {
  const ref = args.ref as number | undefined;
  if (ref != null) {
    // Click the close/dismiss button
    return await executeClick(page, { ref }, elements, timeout);
  }
  // No ref — try Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  return { success: true };
}

// ─── Assertion Executors ────────────────────────────────────────────

async function executeAssertVisible(
  page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const text = args.text as string;
  const exact = (args.exact as boolean) ?? false;

  // Check visible text content on the page
  const bodyText = await page.evaluate(() => document.body.innerText || '');

  const found = exact
    ? bodyText.includes(text)
    : bodyText.toLowerCase().includes(text.toLowerCase());

  if (found) {
    return { success: true, data: { found: true } };
  }
  return {
    success: false,
    error: `Text "${text}" not found on the page`,
    data: { found: false },
  };
}

async function executeAssertNotVisible(
  page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const text = args.text as string;
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  const found = bodyText.toLowerCase().includes(text.toLowerCase());

  if (!found) {
    return { success: true, data: { absent: true } };
  }
  return {
    success: false,
    error: `Text "${text}" is still visible on the page (expected it to be gone)`,
    data: { absent: false },
  };
}

async function executeAssertUrl(
  page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const currentUrl = page.url();

  // Try substring match first, then regex
  if (currentUrl.includes(pattern)) {
    return { success: true, data: { url: currentUrl } };
  }

  try {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(currentUrl)) {
      return { success: true, data: { url: currentUrl } };
    }
  } catch {
    // Not a valid regex — that's fine, substring check already failed
  }

  return {
    success: false,
    error: `URL "${currentUrl}" does not match pattern "${pattern}"`,
    data: { url: currentUrl },
  };
}

async function executeAssertElement(
  page: Page,
  args: Record<string, unknown>,
  elements: PageElement[],
): Promise<ToolResult> {
  const ref = args.ref as number;
  const state = args.state as string;
  const el = elements.find(e => e.ref === ref);

  if (!el) {
    return { success: false, error: `Element ref [${ref}] not found` };
  }

  let pass = false;
  switch (state) {
    case 'checked': pass = el.checked === true; break;
    case 'unchecked': pass = el.checked === false; break;
    case 'disabled': pass = el.disabled === true; break;
    case 'enabled': pass = !el.disabled; break;
    case 'expanded': pass = el.expanded === true; break;
    case 'collapsed': pass = el.expanded === false; break;
    default: return { success: false, error: `Unknown state: ${state}` };
  }

  if (pass) {
    return { success: true };
  }
  return {
    success: false,
    error: `Element [${ref}] "${el.name}" is not ${state}`,
  };
}

// ─── Human Handoff ──────────────────────────────────────────────────

async function executeWaitForUser(
  _page: Page,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const reason = args.reason as string;

  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`\n  🙋 ${reason}\n  Press Enter when done... `, () => {
      rl.close();
      resolve({ success: true });
    });
  });
}

// ─── Terminal ───────────────────────────────────────────────────────

async function executeDone(): Promise<ToolResult> {
  // Done is handled by the agent loop — this executor is a no-op
  return { success: true };
}
