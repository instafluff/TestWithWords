// Reporter — beautiful terminal output that makes the testing experience magical
// Two modes:
//   - Verbose: step-by-step output with spinners (single test / interactive)
//   - Compact: Jest-style per-test pass/fail lines (suite runs)

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { TestStep, SuiteResult, GroupResult, TestCaseResult, TokenUsage } from './types.js';

export interface Reporter {
  testStart(scenario: string): void;
  connected(url: string): void;
  stepProgress(step: number, phase: string, message: string): void;
  stepAction(step: number, actionType: string, description: string): void;
  stepDone(step: number): void;
  stepError(step: number, error: string): void;
  testDone(result: string, summary: string, steps: TestStep[], durationMs: number): void;
}

/** Tool name to emoji mapping */
const ACTION_ICONS: Record<string, string> = {
  click: '👆',
  fill: '⌨️ ',
  select_option: '📋',
  navigate: '🧭',
  press_key: '⌨️ ',
  scroll: '📜',
  wait: '⏳',
  wait_for_user: '🙋',
  dismiss_overlay: '🚫',
  hover: '🎯',
  check: '☑️ ',
  assert_visible: '✅',
  assert_not_visible: '✅',
  assert_url: '✅',
  assert_element: '✅',
  observe: '👁️ ',
  think: '🧠',
  done: '🏁',
};

/**
 * Create a verbose reporter — shows step-by-step output.
 * Used for single test runs and interactive mode.
 */
export function createReporter(): Reporter {
  let spinner: Ora | null = null;

  return {
    testStart(scenario: string) {
      console.log('');
      console.log(chalk.bold.cyan('  🧪 TestWithWords'));
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log('');
      console.log(chalk.white('  📋 ') + chalk.bold(scenario));
      console.log('');
    },

    connected(url: string) {
      console.log(chalk.green('  ✓ ') + chalk.dim(`Connected to Chrome at ${url}`));
      console.log('');
    },

    stepProgress(step: number, phase: string, message: string) {
      const icon = ACTION_ICONS[phase] || '⚡';
      if (spinner) spinner.stop();
      spinner = ora({
        text: chalk.dim(message),
        prefixText: `  ${icon}`,
        color: 'cyan',
      }).start();
    },

    stepAction(step: number, actionType: string, description: string) {
      if (spinner) spinner.stop();
      const icon = ACTION_ICONS[actionType] || '⚡';
      const stepLabel = chalk.dim(`[${step + 1}]`);
      console.log(`  ${icon} ${stepLabel} ${description}`);
    },

    stepDone(step: number) {
      if (spinner) spinner.stop();
    },

    stepError(step: number, error: string) {
      if (spinner) spinner.stop();
      console.log(chalk.red(`     ⚠ ${error}`));
    },

    testDone(result: string, summary: string, steps: TestStep[], durationMs: number) {
      if (spinner) spinner.stop();
      
      console.log('');
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log('');

      const seconds = (durationMs / 1000).toFixed(1);
      const stepsCount = steps.filter(s => s.toolCall.name !== 'done').length;

      if (result === 'pass') {
        console.log(chalk.bold.green('  ✅ TEST PASSED'));
      } else if (result === 'fail') {
        console.log(chalk.bold.red('  ❌ TEST FAILED'));
      } else {
        console.log(chalk.bold.yellow('  ⚠️  TEST ERROR'));
      }

      console.log('');
      console.log(chalk.white(`  ${summary}`));
      console.log('');

      // Aggregate token usage from steps
      const totalUsage = aggregateStepTokens(steps);
      const tokenInfo = totalUsage
        ? ` · ${totalUsage.totalTokens.toLocaleString()} tokens`
        : '';

      console.log(chalk.dim(`  ${stepsCount} steps · ${seconds}s${tokenInfo} · screenshots in results/`));
      console.log('');
    },
  };
}

// ─── Compact reporter for suite runs (Jest-style) ───

/**
 * Create a compact reporter for suite runs.
 * Shows only test start/done in a single line per test.
 * Use with the suite output functions below.
 */
export function createCompactReporter(verbose = false): Reporter {
  let spinner: Ora | null = null;
  let currentTestName: string = '';

  // If verbose, delegate to the full reporter
  if (verbose) return createReporter();

  return {
    testStart(scenario: string) {
      currentTestName = scenario;
      if (spinner) spinner.stop();
      spinner = ora({
        text: chalk.dim(scenario.slice(0, 60)),
        prefixText: '  ',
        color: 'cyan',
      }).start();
    },

    connected(_url: string) {
      // Quiet in compact mode
    },

    stepProgress(_step: number, _phase: string, _message: string) {
      // Quiet in compact mode
    },

    stepAction(_step: number, _actionType: string, _description: string) {
      // Quiet in compact mode
    },

    stepDone(_step: number) {
      // Quiet in compact mode
    },

    stepError(_step: number, _error: string) {
      // Quiet in compact mode
    },

    testDone(result: string, _summary: string, _steps: TestStep[], durationMs: number) {
      if (spinner) spinner.stop();
      // No per-test output here — suite reporter handles it
    },
  };
}

// ─── Suite-level output functions ───

/** Print the TestWithWords banner and connection info */
export function printBanner(connectionInfo: string): void {
  console.log('');
  console.log(chalk.bold.cyan('  🧪 TestWithWords'));
  console.log(chalk.dim('  ─'.repeat(25)));
  console.log(chalk.green('  ✓ ') + chalk.dim(connectionInfo));
  console.log('');
}

/** Print a suite file header */
export function printSuiteHeader(filePath: string): void {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  console.log(chalk.bold.white(`  ${name}`));
}

/** Print a group (describe) header with indent */
export function printGroupHeader(name: string, depth: number): void {
  if (name === '(root)') return; // Don't print implicit group
  const indent = '  '.repeat(depth + 1);
  console.log(chalk.bold(`${indent}${name}`));
}

/** Print a test result line */
export function printTestResult(result: TestCaseResult, depth: number): void {
  const indent = '  '.repeat(depth + 1);
  const seconds = (result.durationMs / 1000).toFixed(1);
  const time = chalk.dim(` (${seconds}s)`);

  if (result.result === 'pass') {
    console.log(chalk.green(`${indent}✓ `) + chalk.dim(result.name) + time);
  } else if (result.result === 'fail') {
    console.log(chalk.red(`${indent}✗ `) + chalk.white(result.name) + time);
    console.log(chalk.red(`${indent}  → ${result.summary.slice(0, 120)}`));
  } else if (result.result === 'error') {
    console.log(chalk.yellow(`${indent}⚠ `) + chalk.white(result.name) + time);
    console.log(chalk.yellow(`${indent}  → ${result.summary.slice(0, 120)}`));
  } else if (result.result === 'skip') {
    console.log(chalk.gray(`${indent}○ `) + chalk.dim(result.name) + chalk.dim(' (skipped)'));
  }
}

/** Recursively print group results in Jest style */
export function printGroupResults(group: GroupResult, depth = 0): void {
  printGroupHeader(group.name, depth);

  for (const test of group.tests) {
    printTestResult(test, depth + (group.name === '(root)' ? 0 : 1));
  }

  for (const child of group.children) {
    printGroupResults(child, depth + 1);
  }
}

/** Print the final summary line */
export function printSummary(suites: SuiteResult[]): void {
  let passed = 0;
  let failed = 0;
  let errors = 0;
  let skipped = 0;
  let totalMs = 0;

  for (const s of suites) {
    passed += s.passed;
    failed += s.failed;
    errors += s.errors;
    skipped += s.skipped;
    totalMs += s.durationMs;
  }

  const total = passed + failed + errors + skipped;
  const seconds = (totalMs / 1000).toFixed(1);

  console.log('');
  console.log(chalk.dim('  ─'.repeat(25)));

  const parts: string[] = [];
  if (passed > 0) parts.push(chalk.green.bold(`${passed} passed`));
  if (failed > 0) parts.push(chalk.red.bold(`${failed} failed`));
  if (errors > 0) parts.push(chalk.yellow.bold(`${errors} errors`));
  if (skipped > 0) parts.push(chalk.gray(`${skipped} skipped`));

  console.log(`  ${parts.join(', ')} ${chalk.dim(`(${seconds}s)`)}`);

  if (suites.length > 1) {
    console.log(chalk.dim(`  ${suites.length} suites, ${total} tests`));
  }

  // Show aggregated token usage if available
  const suiteTokens = aggregateSuiteTokens(suites);
  if (suiteTokens) {
    console.log(chalk.dim(`  🔤 ${suiteTokens.totalTokens.toLocaleString()} tokens (${suiteTokens.promptTokens.toLocaleString()} in / ${suiteTokens.completionTokens.toLocaleString()} out)`));
  }

  console.log('');
}

/** Aggregate token usage from all steps in a test */
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

/** Aggregate token usage across all suite results */
function aggregateSuiteTokens(suites: SuiteResult[]): TokenUsage | null {
  let total = 0;
  let prompt = 0;
  let completion = 0;
  for (const s of suites) {
    if (s.tokenUsage) {
      total += s.tokenUsage.totalTokens;
      prompt += s.tokenUsage.promptTokens;
      completion += s.tokenUsage.completionTokens;
    }
  }
  return total > 0 ? { promptTokens: prompt, completionTokens: completion, totalTokens: total } : null;
}
