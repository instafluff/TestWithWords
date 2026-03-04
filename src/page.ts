// Page state capture — reads the DOM to understand what's on screen
// Extracts: accessible elements with refs, page context (headings, text, overlays),
// and takes screenshots for evidence.

import type { Page } from 'playwright-core';
import type { PageElement, PageState, PageContext, OverlayInfo } from './types.js';
import { mkdir } from 'fs/promises';
import { join } from 'path';

let globalRefCounter = 0;

/** Reset the ref counter between test runs */
export function resetRefs(): void {
  globalRefCounter = 0;
}

/**
 * Capture the current page state: URL, title, accessibility tree, screenshot
 */
export async function capturePageState(
  page: Page,
  screenshotDir?: string,
  stepIndex?: number,
): Promise<PageState> {
  // Reset refs for each capture so the LLM always works with a fresh set
  resetRefs();

  // Capture accessibility tree using Playwright's built-in snapshot
  let a11yTree: any = null;
  try {
    a11yTree = await (page as any).accessibility.snapshot({ interestingOnly: true });
  } catch {
    a11yTree = null;
  }
  
  // Convert to our format with refs
  let elements: PageElement[] = [];
  if (a11yTree) {
    flattenTree(a11yTree, elements);
  }

  // Fallback: if a11y tree is empty/sparse, extract elements from the DOM directly
  if (elements.length < 3) {
    const domElements = await extractDOMElements(page);
    if (domElements.length > elements.length) {
      elements = domElements;
    }
  }

  // Build text representation
  const treeText = elements.length > 0
    ? formatTreeText(elements)
    : '(Page appears empty or is still loading)';

  // Extract page context from HTML
  const pageContext = await extractPageContext(page, elements);

  // Take screenshot for evidence (not sent to LLM — just saved)
  let screenshotPath: string | undefined;
  if (screenshotDir != null && stepIndex != null) {
    await mkdir(screenshotDir, { recursive: true });
    screenshotPath = join(screenshotDir, `step-${stepIndex}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }

  return {
    url: page.url(),
    title: await page.title(),
    elements,
    treeText,
    screenshotPath,
    pageContext,
  };
}

/**
 * Flatten the Playwright accessibility tree into our PageElement format
 */
function flattenTree(
  node: any,
  result: PageElement[],
  depth: number = 0,
): void {
  // Skip generic/structural roles that don't help the LLM
  const skipRoles = new Set(['none', 'generic', 'paragraph', 'Section']);
  
  const role = node.role || '';
  const name = node.name || '';
  
  // Include if it has a meaningful role or name
  const isInteresting = !skipRoles.has(role) && (name || isInteractiveRole(role));
  
  if (isInteresting) {
    globalRefCounter++;
    const element: PageElement = {
      ref: globalRefCounter,
      role,
      name,
      level: depth,
    };
    
    if (node.value != null && node.value !== '') element.value = String(node.value);
    if (node.description) element.description = node.description;
    if (node.disabled) element.disabled = true;
    if (node.checked != null) element.checked = node.checked;
    if (node.expanded != null) element.expanded = node.expanded;
    
    result.push(element);
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, result, depth + 1);
    }
  }
}

/** Roles that are worth showing even without a name */
function isInteractiveRole(role: string): boolean {
  return [
    'button', 'link', 'textbox', 'checkbox', 'radio',
    'combobox', 'menuitem', 'tab', 'switch', 'slider',
    'searchbox', 'spinbutton',
  ].includes(role);
}

/**
 * Format the accessibility tree into a readable text for the LLM.
 * Example output:
 *   [1] link "Home"
 *   [2] button "Sign In"
 *   [3] textbox "Email" value=""
 */
function formatTreeText(elements: PageElement[]): string {
  const lines: string[] = [];
  
  for (const el of elements) {
    const indent = '  '.repeat(Math.min(el.level || 0, 4));
    let line = `${indent}[${el.ref}] ${el.role}`;
    
    if (el.name) {
      line += ` "${el.name}"`;
    }
    
    if (el.value != null) {
      line += ` value="${el.value}"`;
    }
    
    if (el.disabled) line += ' (disabled)';
    if (el.checked != null) line += el.checked ? ' (checked)' : ' (unchecked)';
    if (el.expanded != null) line += el.expanded ? ' (expanded)' : ' (collapsed)';
    
    lines.push(line);
  }
  
  // Truncate if too long — LLM context is precious
  const MAX_LINES = 80;
  if (lines.length > MAX_LINES) {
    // Prioritize: keep interactive elements, trim static text
    const interactive = lines.filter(l => /\b(button|link|textbox|searchbox|combobox|checkbox|radio|tab|menuitem|switch)\b/.test(l));
    const nonInteractive = lines.filter(l => !interactive.includes(l));
    const budget = MAX_LINES;
    const interactiveKept = interactive.slice(0, Math.min(interactive.length, Math.floor(budget * 0.7)));
    const remainingBudget = budget - interactiveKept.length;
    const nonInteractiveKept = nonInteractive.slice(0, remainingBudget);
    const kept = [...interactiveKept, ...nonInteractiveKept];
    kept.push(`  ... and ${lines.length - kept.length} more elements (page is large)`);
    return kept.join('\n');
  }
  
  return lines.join('\n');
}

/**
 * Fallback: extract elements directly from the DOM when the accessibility tree is empty.
 * Captures headings, links, buttons, inputs, and visible text blocks.
 */
async function extractDOMElements(page: Page): Promise<PageElement[]> {
  globalRefCounter = 0;
  
  const rawElements = await page.evaluate(() => {
    const results: Array<{
      tag: string;
      role: string;
      name: string;
      value?: string;
      type?: string;
      disabled?: boolean;
      checked?: boolean;
      href?: string;
      index: number;
    }> = [];

    // Clear previous refs
    document.querySelectorAll('[data-tww-ref]').forEach(el => el.removeAttribute('data-tww-ref'));

    // Selectors for interactive and landmark elements
    const selector = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a[href]',
      'button',
      'input', 'textarea', 'select',
      '[role="button"]', '[role="link"]', '[role="tab"]',
      '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]',
      'p', 'li', 'label', 'pre', 'code', 'td', 'th',
    ].join(', ');

    const els = document.querySelectorAll(selector);
    let refIdx = 0;
    
    for (const el of els) {
      const htmlEl = el as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const inputType = ((el as HTMLInputElement).type || '').toLowerCase();

      // Skip truly hidden elements
      if (htmlEl.hidden || htmlEl.getAttribute('aria-hidden') === 'true') continue;
      if (tag === 'input' && (inputType === 'hidden' || inputType === 'file')) continue;

      // Skip elements not visible in the layout
      const style = window.getComputedStyle(htmlEl);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      // offsetParent is null for hidden elements (and fixed/absolute positioned ones)
      if (htmlEl.offsetParent === null && style.position !== 'fixed' && style.position !== 'absolute' && style.position !== 'sticky') continue;
      // Skip zero-size elements (except inputs which can be styled small)
      if (htmlEl.offsetWidth === 0 && htmlEl.offsetHeight === 0 && !['input', 'textarea', 'select'].includes(tag)) continue;

      const text = (htmlEl.textContent || '').trim().slice(0, 200);
      if (!text && !['input', 'textarea', 'select'].includes(tag)) {
        continue;
      }

      let role = el.getAttribute('role') || '';
      
      // Map HTML tags to roles
      if (!role) {
        const tagRoleMap: Record<string, string> = {
          a: 'link', button: 'button', input: 'textbox',
          textarea: 'textbox', select: 'combobox',
          h1: 'heading', h2: 'heading', h3: 'heading',
          h4: 'heading', h5: 'heading', h6: 'heading',
          p: 'text', li: 'listitem', label: 'label',
          pre: 'text', code: 'text', td: 'cell', th: 'columnheader', span: 'text',
        };
        role = tagRoleMap[tag] || tag;
      }

      // For inputs, refine role based on type
      if (tag === 'input' && inputType === 'checkbox') role = 'checkbox';
      if (tag === 'input' && inputType === 'radio') role = 'radio';
      if (tag === 'input' && inputType === 'search') role = 'searchbox';

      const name = el.getAttribute('aria-label')
        || el.getAttribute('title')
        || (el as HTMLInputElement).placeholder
        || text;

      refIdx++;
      // Tag the element in the DOM so we can find it later
      htmlEl.setAttribute('data-tww-ref', String(refIdx));

      results.push({
        tag,
        role,
        name,
        value: (el as HTMLInputElement).value || undefined,
        type: inputType || undefined,
        disabled: (el as HTMLInputElement).disabled || undefined,
        checked: (el as HTMLInputElement).checked || undefined,
        href: (el as HTMLAnchorElement).href || undefined,
        index: refIdx,
      });

      // Limit to prevent huge pages from overwhelming
      if (results.length >= 100) break;
    }

    return results;
  });

  const elements: PageElement[] = [];
  for (const raw of rawElements) {
    globalRefCounter = raw.index;
    const el: PageElement = {
      ref: raw.index,
      role: raw.role,
      name: raw.name,
      level: 0,
      fromDOM: true,
    };
    if (raw.value) el.value = raw.value;
    if (raw.disabled) el.disabled = true;
    if (raw.checked != null) el.checked = raw.checked;
    if (raw.href) el.description = raw.href;
    elements.push(el);
  }

  return elements;
}

/**
 * Extract rich page context from the HTML — visible text, overlays, errors, forms.
 * This gives the LLM much more understanding of what's on screen without using vision.
 */
async function extractPageContext(page: Page, elements: PageElement[]): Promise<PageContext> {
  const raw = await page.evaluate(() => {
    // Headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => (h.textContent || '').trim())
      .filter(t => t.length > 0)
      .slice(0, 10);

    // Visible text — grab the main content area
    const mainEl = document.querySelector('main, [role="main"], #content, #main, .content, article')
      || document.body;
    const rawText = (mainEl.textContent || '').replace(/\s+/g, ' ').trim();
    const visibleText = rawText.slice(0, 800); // cap aggressively to avoid token bloat

    // Detect overlays — elements with position:fixed/absolute and high z-index
    const overlays: Array<{
      type: string;
      text: string;
      hasCloseButton: boolean;
      closeSelector?: string;
    }> = [];

    // Check for dialogs
    const dialogs = document.querySelectorAll(
      'dialog[open], [role="dialog"], [role="alertdialog"], ' +
      '.modal, .cookie-banner, .consent-banner, .cookie-consent, ' +
      '#cookie-banner, #consent, .overlay, .popup, ' +
      '[class*="cookie"], [class*="consent"], [class*="gdpr"], ' +
      '[id*="cookie"], [id*="consent"], [id*="gdpr"]'
    );

    for (const overlay of dialogs) {
      const el = overlay as HTMLElement;
      const style = window.getComputedStyle(el);
      // Skip hidden overlays
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!text) continue;

      // Determine type
      const classId = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
      let type = 'popup';
      if (classId.includes('cookie') || classId.includes('consent') || classId.includes('gdpr')) {
        type = 'cookie-banner';
      } else if (el.tagName === 'DIALOG' || classId.includes('modal')) {
        type = 'modal';
      } else if (classId.includes('banner')) {
        type = 'banner';
      } else if (el.getAttribute('role') === 'dialog' || el.getAttribute('role') === 'alertdialog') {
        type = 'dialog';
      }

      // Look for close/dismiss buttons within
      const closeBtn = el.querySelector(
        'button[class*="close"], button[class*="dismiss"], button[class*="reject"], ' +
        'button[class*="decline"], button[aria-label*="close"], button[aria-label*="Close"], ' +
        '[class*="close"], .btn-close, [data-dismiss], ' +
        'button:has(svg), button[class*="accept"]'  
      );
      const hasCloseButton = closeBtn !== null;

      overlays.push({ type, text, hasCloseButton });
    }

    // Also detect fixed-position overlays by style
    const fixedEls = document.querySelectorAll('*');
    for (const el of fixedEls) {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      if (
        (style.position === 'fixed' || style.position === 'sticky') &&
        parseInt(style.zIndex || '0') > 100 &&
        htmlEl.offsetHeight > 50 &&
        style.display !== 'none'
      ) {
        const text = (htmlEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (text && text.length > 20 && !overlays.some(o => text.includes(o.text.slice(0, 50)))) {
          const classId = ((htmlEl.className || '') + ' ' + (htmlEl.id || '')).toLowerCase();
          let type = 'banner';
          if (classId.includes('cookie') || classId.includes('consent') || text.toLowerCase().includes('cookie')) {
            type = 'cookie-banner';
          }
          overlays.push({ type, text, hasCloseButton: false });
        }
      }
      // Early exit — don't scan the whole DOM
      if (overlays.length >= 5) break;
    }

    // Error messages
    const errorSelectors = [
      '.error', '.alert-danger', '.alert-error', '[role="alert"]',
      '.error-message', '.form-error', '.validation-error',
      '[class*="error"]', '[class*="Error"]',
    ];
    const errors = Array.from(document.querySelectorAll(errorSelectors.join(', ')))
      .map(e => (e.textContent || '').trim())
      .filter(t => t.length > 0 && t.length < 500)
      .slice(0, 5);

    // Form state
    const forms: string[] = [];
    const formEls = document.querySelectorAll('input, textarea, select');
    for (const f of formEls) {
      const input = f as HTMLInputElement;
      const style = window.getComputedStyle(input);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (input.type === 'hidden' || input.type === 'file') continue;
      if (input.hidden) continue;
      
      const label = input.getAttribute('aria-label')
        || input.placeholder
        || input.name
        || input.id
        || '';
      const type = input.type || input.tagName.toLowerCase();
      let state = `${type}`;
      if (label) state += ` "${label}"`;
      if (input.value) state += ` = "${input.value}"`;
      if (input.required) state += ' (required)';
      if (input.disabled) state += ' (disabled)';
      if (input.type === 'checkbox' || input.type === 'radio') {
        state += input.checked ? ' (checked)' : ' (unchecked)';
      }
      forms.push(state);
      if (forms.length >= 15) break;
    }

    // Meta
    const metaDesc = document.querySelector('meta[name="description"]');
    const meta = metaDesc ? (metaDesc.getAttribute('content') || '') : '';

    return { headings, visibleText, overlays, errors, forms, meta };
  });

  return {
    headings: raw.headings,
    visibleText: raw.visibleText,
    overlays: raw.overlays.map(o => ({
      type: o.type as OverlayInfo['type'],
      text: o.text,
      hasCloseButton: o.hasCloseButton,
    })),
    errors: raw.errors,
    forms: raw.forms,
    meta: raw.meta,
  };
}
