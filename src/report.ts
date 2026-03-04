// HTML report generator — creates visual test reports
// Supports both single-test and multi-test suite reports

import type { TestResult, TestStep, SuiteResult, GroupResult, TestCaseResult, TokenUsage } from './types.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { getActiveModel } from './llm.js';

/**
 * Generate an HTML report from a test result.
 * Returns the file path to the generated report.
 */
export async function generateReport(result: TestResult): Promise<string> {
  const reportPath = join(result.screenshotDir, 'report.html');
  const html = buildHTML(result);
  await writeFile(reportPath, html, 'utf-8');
  return resolve(reportPath);
}

function buildHTML(result: TestResult): string {
  const statusColor = result.result === 'pass' ? '#22c55e' : result.result === 'fail' ? '#ef4444' : '#f59e0b';
  const statusText = result.result === 'pass' ? 'PASSED' : result.result === 'fail' ? 'FAILED' : 'ERROR';
  const statusEmoji = result.result === 'pass' ? '✅' : result.result === 'fail' ? '❌' : '⚠️';
  const duration = (result.totalDurationMs / 1000).toFixed(1);
  const model = result.model || getActiveModel() || 'unknown';
  
  const actionSteps = result.steps.filter(s => s.toolCall.name !== 'done');
  
  // Token usage summary
  const tokenUsage = result.tokenUsage || aggregateStepTokens(result.steps);
  const tokenHTML = tokenUsage
    ? `<div class="token-badge">🔤 ${tokenUsage.totalTokens.toLocaleString()} tokens <span class="token-detail">(${tokenUsage.promptTokens.toLocaleString()} in / ${tokenUsage.completionTokens.toLocaleString()} out)</span></div>`
    : '';
  
  const stepsHTML = result.steps.map((step, i) => {
    const desc = step.description;
    
    const typeLabel = step.toolCall.name.replace(/_/g, ' ');
    const statusClass = step.success ? 'step-success' : 'step-error';
    const icon = ACTION_ICONS_HTML[step.toolCall.name] || '⚡';
    
    // Try to embed screenshot
    const screenshotTag = step.screenshotPath
      ? `<div class="screenshot"><img src="${step.screenshotPath.replace(/\\/g, '/')}" alt="Step ${i} screenshot" loading="lazy" onerror="this.style.display='none'" /></div>`
      : '';
    
    const errorTag = step.error
      ? `<div class="step-error-msg">⚠ ${escapeHTML(step.error)}</div>`
      : '';

    const durationTag = `<span class="step-duration">${step.durationMs}ms</span>`;
    
    const stepTokenTag = step.tokenUsage
      ? `<span class="step-tokens">${step.tokenUsage.totalTokens.toLocaleString()} tok</span>`
      : '';

    return `
      <div class="step ${statusClass}">
        <details${i === result.steps.length - 1 ? ' open' : ''}>
          <summary class="step-header">
            <span class="step-icon">${icon}</span>
            <span class="step-num">#${i + 1}</span>
            <span class="step-type">${typeLabel}</span>
            <span class="step-desc-inline">${escapeHTML(desc).slice(0, 80)}</span>
            ${stepTokenTag}
            ${durationTag}
          </summary>
          <div class="step-body">
            <div class="step-desc">${escapeHTML(desc)}</div>
            ${errorTag}
            ${screenshotTag}
          </div>
        </details>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TestWithWords Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { font-size: 1.5rem; color: #38bdf8; margin-bottom: 0.5rem; }
    .header .scenario { font-size: 1.1rem; color: #94a3b8; margin-bottom: 1rem; padding: 1rem; background: #1e293b; border-radius: 8px; }
    
    .result-badge { display: inline-block; padding: 0.5rem 1.5rem; border-radius: 999px; font-weight: 700; font-size: 1.2rem; color: white; background: ${statusColor}; }
    .summary { margin: 1rem 0; padding: 1rem; background: #1e293b; border-radius: 8px; border-left: 4px solid ${statusColor}; }
    .meta { color: #64748b; font-size: 0.9rem; margin-top: 0.5rem; }
    .model-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; background: #334155; color: #94a3b8; margin-left: 0.5rem; }
    .token-badge { margin-top: 0.5rem; color: #64748b; font-size: 0.85rem; }
    .token-detail { color: #475569; }
    
    .steps { margin-top: 2rem; }
    .steps-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .steps-header h2 { font-size: 1.2rem; color: #38bdf8; }
    .expand-all { background: #334155; color: #94a3b8; border: none; padding: 0.3rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
    .expand-all:hover { background: #475569; color: #e2e8f0; }
    
    .step { background: #1e293b; border-radius: 8px; margin-bottom: 0.5rem; border-left: 4px solid #334155; }
    .step-success { border-left-color: #22c55e; }
    .step-error { border-left-color: #ef4444; }
    
    .step details { }
    .step summary { cursor: pointer; list-style: none; padding: 0.75rem 1rem; }
    .step summary::-webkit-details-marker { display: none; }
    .step summary::marker { display: none; content: ''; }
    
    .step-header { display: flex; align-items: center; gap: 0.5rem; }
    .step-icon { font-size: 1.2rem; }
    .step-num { color: #64748b; font-size: 0.85rem; font-weight: 600; }
    .step-type { color: #38bdf8; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; }
    .step-desc-inline { color: #94a3b8; font-size: 0.85rem; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .step-tokens { color: #475569; font-size: 0.75rem; }
    .step-duration { color: #64748b; font-size: 0.8rem; }
    
    .step-body { padding: 0 1rem 1rem; }
    .step-desc { color: #cbd5e1; margin-bottom: 0.5rem; }
    .step-error-msg { color: #fca5a5; font-size: 0.9rem; margin-top: 0.5rem; }
    
    .screenshot { margin-top: 0.75rem; }
    .screenshot img { width: 100%; border-radius: 6px; border: 1px solid #334155; cursor: pointer; transition: transform 0.2s; }
    .screenshot img:hover { transform: scale(1.02); }
    
    /* Lightbox overlay */
    .lightbox { display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 100; justify-content: center; align-items: center; cursor: zoom-out; }
    .lightbox.active { display: flex; }
    .lightbox img { max-width: 95vw; max-height: 95vh; border-radius: 8px; }
    
    .footer { text-align: center; margin-top: 2rem; color: #475569; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 TestWithWords Report</h1>
      <div class="scenario">${escapeHTML(result.scenario)}</div>
      <div class="result-badge">${statusEmoji} ${statusText}</div>
    </div>
    
    <div class="summary">
      <p>${escapeHTML(result.summary)}</p>
      <p class="meta">${actionSteps.length} steps · ${duration}s${result.startUrl ? ` · ${escapeHTML(result.startUrl)}` : ''}<span class="model-badge">${escapeHTML(model)}</span></p>
      ${tokenHTML}
    </div>

    <div class="steps">
      <div class="steps-header">
        <h2>Test Flow</h2>
        <button class="expand-all" onclick="toggleAll()">Expand All</button>
      </div>
      ${stepsHTML}
    </div>
    
    <div class="footer">
      Generated by TestWithWords · ${new Date().toLocaleString()}
    </div>
  </div>
  
  <!-- Lightbox for screenshot zoom -->
  <div class="lightbox" id="lightbox" onclick="this.classList.remove('active')">
    <img id="lightbox-img" src="" alt="Screenshot" />
  </div>
  
  <script>
    // Click screenshots to open lightbox
    document.querySelectorAll('.screenshot img').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const lb = document.getElementById('lightbox');
        document.getElementById('lightbox-img').src = img.src;
        lb.classList.add('active');
      });
    });

    // Expand/collapse all steps
    let allExpanded = false;
    function toggleAll() {
      allExpanded = !allExpanded;
      document.querySelectorAll('.step details').forEach(d => {
        d.open = allExpanded;
      });
      document.querySelector('.expand-all').textContent = allExpanded ? 'Collapse All' : 'Expand All';
    }
  </script>
</body>
</html>`;
}

const ACTION_ICONS_HTML: Record<string, string> = {
  click: '👆',
  fill: '⌨️',
  select_option: '📋',
  navigate: '🧭',
  press_key: '⌨️',
  scroll: '📜',
  wait: '⏳',
  wait_for_user: '🙋',
  dismiss_overlay: '🚫',
  hover: '🎯',
  check: '☑️',
  assert_visible: '✅',
  assert_not_visible: '✅',
  assert_url: '✅',
  assert_element: '✅',
  done: '🏁',
};

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Aggregate token usage from steps */
function aggregateStepTokens(steps: TestStep[]): TokenUsage | null {
  let total = 0;
  let prompt = 0;
  let completion = 0;
  for (const step of steps) {
    if (step.tokenUsage) {
      total += step.tokenUsage.totalTokens;
      prompt += step.tokenUsage.promptTokens;
      completion += step.tokenUsage.completionTokens;
    }
  }
  return total > 0 ? { promptTokens: prompt, completionTokens: completion, totalTokens: total } : null;
}

// ─── Multi-test suite report ───

/**
 * Generate a combined HTML report for multiple suite results.
 * Returns the path to the generated report.
 */
export async function generateSuiteReport(suites: SuiteResult[], outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const reportPath = join(outputDir, 'report.html');
  const html = buildSuiteHTML(suites);
  await writeFile(reportPath, html, 'utf-8');
  return resolve(reportPath);
}

function buildSuiteHTML(suites: SuiteResult[]): string {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let totalMs = 0;

  for (const s of suites) {
    totalPassed += s.passed;
    totalFailed += s.failed;
    totalErrors += s.errors;
    totalSkipped += s.skipped;
    totalMs += s.durationMs;
  }

  const totalTests = totalPassed + totalFailed + totalErrors + totalSkipped;
  const allPass = totalFailed === 0 && totalErrors === 0;
  const statusColor = allPass ? '#22c55e' : '#ef4444';
  const statusText = allPass ? 'ALL PASSED' : `${totalFailed + totalErrors} FAILED`;
  const seconds = (totalMs / 1000).toFixed(1);

  // Aggregate token usage across all suites
  let totalTokens = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  for (const s of suites) {
    if (s.tokenUsage) {
      totalTokens += s.tokenUsage.totalTokens;
      totalPrompt += s.tokenUsage.promptTokens;
      totalCompletion += s.tokenUsage.completionTokens;
    }
  }
  const suiteTokenHTML = totalTokens > 0
    ? `<div class="token-summary">🔤 ${totalTokens.toLocaleString()} tokens (${totalPrompt.toLocaleString()} in / ${totalCompletion.toLocaleString()} out)</div>`
    : '';

  // Build sidebar and test cards
  let sidebarHTML = '';
  let testsHTML = '';
  let testIdx = 0;

  for (const suite of suites) {
    const suiteName = suite.filePath.replace(/\\/g, '/').split('/').pop() || suite.filePath;
    sidebarHTML += `<div class="sidebar-suite">${escapeHTML(suiteName)}</div>`;

    for (const group of suite.groups) {
      buildGroupHTML(group, 0);
    }
  }

  function buildGroupHTML(group: GroupResult, depth: number): void {
    if (group.name !== '(root)') {
      sidebarHTML += `<div class="sidebar-group" style="padding-left: ${(depth + 1) * 12}px">${escapeHTML(group.name)}</div>`;
    }

    for (const test of group.tests) {
      const id = `test-${testIdx++}`;
      const icon = test.result === 'pass' ? '✅' : test.result === 'fail' ? '❌' : test.result === 'error' ? '⚠️' : '⏭️';
      const statusCls = test.result === 'pass' ? 'pass' : test.result === 'fail' ? 'fail' : test.result === 'error' ? 'error' : 'skip';

      sidebarHTML += `<a class="sidebar-test sidebar-${statusCls}" href="#${id}" style="padding-left: ${(depth + 1) * 12 + 12}px">${icon} ${escapeHTML(test.name)}</a>`;

      const testSeconds = (test.durationMs / 1000).toFixed(1);
      const testTokens = test.tokenUsage || aggregateStepTokens(test.steps);
      const testTokenTag = testTokens
        ? `<span class="test-tokens">🔤 ${testTokens.totalTokens.toLocaleString()} tokens</span>`
        : '';
      const testModelTag = test.model
        ? `<span class="test-model">${escapeHTML(test.model)}</span>`
        : '';
      const stepsHTML = test.steps.map((step, si) => {
        const stepIcon = ACTION_ICONS_HTML[step.toolCall.name] || '⚡';
        const stepClass = step.success ? 'step-success' : 'step-error';
        const errorMsg = step.error ? `<div class="step-error-msg">⚠ ${escapeHTML(step.error)}</div>` : '';
        const screenshot = step.screenshotPath
          ? `<div class="screenshot"><img src="${step.screenshotPath.replace(/\\/g, '/')}" alt="Step ${si}" loading="lazy" onerror="this.style.display='none'" /></div>`
          : '';

        return `<div class="step ${stepClass}">
          <div class="step-header">
            <span class="step-icon">${stepIcon}</span>
            <span class="step-num">#${si + 1}</span>
            <span class="step-type">${step.toolCall.name.replace(/_/g, ' ')}</span>
            <span class="step-duration">${step.durationMs}ms</span>
          </div>
          <div class="step-desc">${escapeHTML(step.description)}</div>
          ${errorMsg}
          ${screenshot}
        </div>`;
      }).join('\n');

      testsHTML += `
        <div class="test-card" id="${id}">
          <div class="test-card-header test-${statusCls}">
            <span>${icon} ${escapeHTML(test.name)}</span>
            <span class="test-meta">${testModelTag} ${testTokenTag} <span class="test-time">${testSeconds}s</span></span>
          </div>
          <div class="test-summary">${escapeHTML(test.summary)}</div>
          <details class="test-steps">
            <summary>${test.steps.length} steps</summary>
            ${stepsHTML}
          </details>
        </div>`;
    }

    for (const child of group.children) {
      buildGroupHTML(child, depth + 1);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TestWithWords Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; height: 100vh; }

    .sidebar { width: 280px; background: #1e293b; border-right: 1px solid #334155; overflow-y: auto; padding: 1rem 0; flex-shrink: 0; }
    .sidebar-header { padding: 0.75rem 1rem; font-weight: 700; color: #38bdf8; font-size: 1.1rem; }
    .sidebar-suite { padding: 0.5rem 1rem; font-weight: 600; color: #94a3b8; font-size: 0.85rem; margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .sidebar-group { padding: 0.3rem 1rem; color: #cbd5e1; font-weight: 600; font-size: 0.9rem; }
    .sidebar-test { display: block; padding: 0.3rem 1rem; color: #94a3b8; font-size: 0.85rem; text-decoration: none; border-radius: 4px; margin: 1px 4px; }
    .sidebar-test:hover { background: #334155; color: #e2e8f0; }
    .sidebar-pass { color: #4ade80; }
    .sidebar-fail { color: #f87171; }
    .sidebar-error { color: #fbbf24; }
    .sidebar-skip { color: #64748b; }

    .main { flex: 1; overflow-y: auto; padding: 2rem; }
    .header { text-align: center; margin-bottom: 2rem; }
    .header h1 { font-size: 1.4rem; color: #38bdf8; margin-bottom: 0.5rem; }
    .result-badge { display: inline-block; padding: 0.5rem 1.5rem; border-radius: 999px; font-weight: 700; font-size: 1.1rem; color: white; background: ${statusColor}; }
    .summary-meta { color: #64748b; margin-top: 0.75rem; font-size: 0.9rem; }
    .token-summary { color: #475569; font-size: 0.85rem; margin-top: 0.25rem; }

    .test-card { background: #1e293b; border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
    .test-card-header { padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
    .test-pass { border-left: 4px solid #22c55e; }
    .test-fail { border-left: 4px solid #ef4444; }
    .test-error { border-left: 4px solid #f59e0b; }
    .test-skip { border-left: 4px solid #475569; color: #64748b; }
    .test-time { color: #64748b; font-size: 0.85rem; font-weight: 400; }
    .test-meta { display: flex; align-items: center; gap: 0.5rem; }
    .test-tokens { color: #475569; font-size: 0.75rem; font-weight: 400; }
    .test-model { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; background: #334155; color: #94a3b8; font-weight: 400; }
    .test-summary { padding: 0.5rem 1rem; color: #94a3b8; font-size: 0.9rem; }

    .test-steps { padding: 0.5rem 1rem 1rem; }
    .test-steps summary { cursor: pointer; color: #64748b; font-size: 0.85rem; margin-bottom: 0.5rem; }

    .step { background: #0f172a; border-radius: 6px; margin-bottom: 0.5rem; padding: 0.75rem; border-left: 3px solid #334155; }
    .step-success { border-left-color: #22c55e; }
    .step-error { border-left-color: #ef4444; }
    .step-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .step-icon { font-size: 1rem; }
    .step-num { color: #64748b; font-size: 0.8rem; font-weight: 600; }
    .step-type { color: #38bdf8; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; }
    .step-duration { color: #64748b; font-size: 0.75rem; margin-left: auto; }
    .step-desc { color: #cbd5e1; font-size: 0.9rem; }
    .step-error-msg { color: #fca5a5; font-size: 0.85rem; margin-top: 0.25rem; }
    .screenshot { margin-top: 0.5rem; }
    .screenshot img { width: 100%; border-radius: 4px; border: 1px solid #334155; cursor: pointer; }

    .footer { text-align: center; margin-top: 2rem; color: #475569; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="sidebar">
    <div class="sidebar-header">🧪 TestWithWords</div>
    ${sidebarHTML}
  </div>
  <div class="main">
    <div class="header">
      <h1>Test Report</h1>
      <div class="result-badge">${statusText}</div>
      <div class="summary-meta">${totalPassed} passed, ${totalFailed} failed, ${totalErrors} errors, ${totalSkipped} skipped · ${totalTests} tests · ${seconds}s</div>
      ${suiteTokenHTML}
    </div>
    ${testsHTML}
    <div class="footer">Generated by TestWithWords · ${new Date().toLocaleString()}</div>
  </div>
  <script>
    document.querySelectorAll('.screenshot img').forEach(img => {
      img.addEventListener('click', () => {
        img.style.maxWidth = img.style.maxWidth === 'none' ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;
}
