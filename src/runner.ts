// Test runner — discovers .tww files, manages browser lifecycle, runs tests via AI agent
// Orchestration layer between parser (Phase 2) and agent (Phase 1).
//
// Flow per group:
//   beforeAll (one page)
//   for each test:
//     new page → beforeEach → test scenario → afterEach → close page
//   afterAll

import { readdir, stat, mkdir } from 'fs/promises';
import { join, resolve, extname } from 'path';
import type { BrowserContext } from 'playwright-core';
import type {
  TestSuite, TestGroup, TestCase, TestConfig,
  SuiteResult, GroupResult, TestCaseResult, TokenUsage,
} from './types.js';
import { parseTWWFile } from './parser.js';
import { runTest } from './agent.js';
import type { Reporter } from './reporter.js';

// ─── File Discovery ───

/**
 * Discover .tww files from a path (file, directory, or glob-like).
 * Returns absolute paths.
 */
export async function findTWWFiles(target: string): Promise<string[]> {
  const abs = resolve(target);
  const s = await stat(abs).catch(() => null);

  if (!s) {
    throw new Error(`Path not found: ${target}`);
  }

  if (s.isFile()) {
    if (extname(abs) !== '.tww') {
      throw new Error(`Not a .tww file: ${target}`);
    }
    return [abs];
  }

  if (s.isDirectory()) {
    return walkDir(abs);
  }

  throw new Error(`Unsupported path type: ${target}`);
}

/** Recursively find all .tww files in a directory */
async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tww')) {
      files.push(fullPath);
    }
  }

  // Sort for deterministic execution order
  return files.sort();
}

// ─── Suite Runner ───

/** Configuration for a runner execution */
export interface RunnerConfig {
  /** CDP URL for browser connection */
  cdpUrl: string;
  /** LLM model */
  model: string;
  /** Max steps per test */
  maxSteps: number;
  /** Action timeout in ms */
  actionTimeout: number;
  /** Base output directory for screenshots/reports */
  outputDir: string;
  /** Take screenshot every step */
  screenshotEveryStep: boolean;
  /** Generate HTML report */
  generateReport: boolean;
  /** Number of retries for failed tests (0 = no retries) */
  retries: number;
  /** Per-test timeout in ms (0 = no timeout) */
  testTimeout: number;
}

/**
 * Run a parsed TestSuite through the AI agent.
 * Returns structured results.
 */
export async function runSuite(
  suite: TestSuite,
  context: BrowserContext,
  config: RunnerConfig,
  reporter: Reporter,
): Promise<SuiteResult> {
  const startTime = Date.now();
  const groupResults: GroupResult[] = [];
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let errors = 0;
  let skipped = 0;

  for (const group of suite.groups) {
    const result = await runGroup(group, suite.defaultUrl, context, config, reporter, []);
    groupResults.push(result);

    // Aggregate counts
    const counts = countResults(result);
    totalTests += counts.total;
    passed += counts.passed;
    failed += counts.failed;
    errors += counts.errors;
    skipped += counts.skipped;
  }

  return {
    filePath: suite.filePath,
    groups: groupResults,
    totalTests,
    passed,
    failed,
    errors,
    skipped,
    durationMs: Date.now() - startTime,
    tokenUsage: aggregateGroupTokens(groupResults),
  };
}

/** Run a single describe group (recursive for nested groups) */
async function runGroup(
  group: TestGroup,
  defaultUrl: string | undefined,
  context: BrowserContext,
  config: RunnerConfig,
  reporter: Reporter,
  parentBeforeEach: string[],
): Promise<GroupResult> {
  const testResults: TestCaseResult[] = [];
  const childResults: GroupResult[] = [];
  let beforeAllError: string | undefined;
  let afterAllError: string | undefined;

  // Collect all beforeEach chains (parent + current)
  const allBeforeEach = [...parentBeforeEach];
  if (group.beforeEach) allBeforeEach.push(group.beforeEach);

  // Collect afterEach for this level
  const afterEachSteps: string[] = [];
  if (group.afterEach) afterEachSteps.push(group.afterEach);

  // beforeAll — runs once before any test in the group
  if (group.beforeAll) {
    try {
      const page = await context.newPage();
      if (defaultUrl) {
        await page.goto(defaultUrl, { timeout: config.actionTimeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
      }
      const testConfig = buildTestConfig(group.beforeAll, defaultUrl, config, 'beforeAll');
      const result = await runTest(page, testConfig, reporter);
      await page.close();

      if (result.result !== 'pass') {
        beforeAllError = result.summary;
        // Skip all tests in this group — beforeAll failed
        for (const test of group.tests) {
          testResults.push({
            name: test.name,
            result: 'skip',
            summary: `Skipped: beforeAll failed — ${beforeAllError}`,
            steps: [],
            durationMs: 0,
            screenshotDir: '',
          });
        }
        return { name: group.name, tests: testResults, children: childResults, beforeAllError };
      }
    } catch (err) {
      beforeAllError = err instanceof Error ? err.message : String(err);
      // Skip all tests
      for (const test of group.tests) {
        testResults.push({
          name: test.name,
          result: 'skip',
          summary: `Skipped: beforeAll error — ${beforeAllError}`,
          steps: [],
          durationMs: 0,
          screenshotDir: '',
        });
      }
      return { name: group.name, tests: testResults, children: childResults, beforeAllError };
    }
  }

  // Run each test in a fresh page (with retries)
  for (const test of group.tests) {
    let result = await runTestCase(test, defaultUrl, context, config, reporter, allBeforeEach, afterEachSteps);

    // Retry failed tests
    for (let attempt = 1; attempt <= config.retries && (result.result === 'fail' || result.result === 'error'); attempt++) {
      result = await runTestCase(test, defaultUrl, context, config, reporter, allBeforeEach, afterEachSteps);
      if (result.result === 'pass') {
        result.summary = `Passed on retry ${attempt}/${config.retries}`;
      }
    }

    testResults.push(result);
  }

  // Run nested groups
  for (const child of group.children) {
    const childResult = await runGroup(child, defaultUrl, context, config, reporter, allBeforeEach);
    childResults.push(childResult);
  }

  // afterAll — runs once after all tests
  if (group.afterAll) {
    try {
      const page = await context.newPage();
      const testConfig = buildTestConfig(group.afterAll, defaultUrl, config, 'afterAll');
      const result = await runTest(page, testConfig, reporter);
      await page.close();
      if (result.result !== 'pass') {
        afterAllError = result.summary;
      }
    } catch (err) {
      afterAllError = err instanceof Error ? err.message : String(err);
    }
  }

  return { name: group.name, tests: testResults, children: childResults, beforeAllError, afterAllError };
}

/** Run a single test case with fresh page + beforeEach + afterEach */
async function runTestCase(
  test: TestCase,
  defaultUrl: string | undefined,
  context: BrowserContext,
  config: RunnerConfig,
  reporter: Reporter,
  beforeEachSteps: string[],
  afterEachSteps: string[],
): Promise<TestCaseResult> {
  const startTime = Date.now();
  const screenshotDir = join(config.outputDir, sanitizeName(test.name));

  // Ensure screenshot dir exists
  await mkdir(screenshotDir, { recursive: true });

  let page;
  try {
    // Fresh page for isolation
    page = await context.newPage();

    // Navigate to default URL if set
    if (defaultUrl) {
      await page.goto(defaultUrl, { timeout: config.actionTimeout, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    }

    // Run beforeEach chain (parent hooks first, then current level)
    for (const hookScenario of beforeEachSteps) {
      const hookConfig = buildTestConfig(hookScenario, undefined, config, 'beforeEach', screenshotDir);
      const hookResult = await runTest(page, hookConfig, reporter);
      if (hookResult.result !== 'pass') {
        await page.close();
        return {
          name: test.name,
          result: 'error',
          summary: `beforeEach failed: ${hookResult.summary}`,
          steps: hookResult.steps,
          durationMs: Date.now() - startTime,
          screenshotDir,
        };
      }
    }

    // Run the actual test scenario
    const scenario = test.scenario;
    const testConfig: TestConfig = {
      scenario,
      startUrl: undefined, // Already navigated via defaultUrl
      cdpUrl: config.cdpUrl,
      maxSteps: config.maxSteps,
      screenshotDir,
      model: config.model,
      screenshotEveryStep: config.screenshotEveryStep,
      actionTimeout: config.actionTimeout,
      testTimeout: config.testTimeout || undefined,
      generateReport: false, // Runner generates its own reports
    };

    const testResult = await runTest(page, testConfig, reporter);

    // Run afterEach chain
    for (const hookScenario of afterEachSteps) {
      const hookConfig = buildTestConfig(hookScenario, undefined, config, 'afterEach', screenshotDir);
      await runTest(page, hookConfig, reporter);
      // afterEach errors are logged but don't affect test result
    }

    await page.close();

    return {
      name: test.name,
      result: testResult.result,
      summary: testResult.summary,
      steps: testResult.steps,
      durationMs: Date.now() - startTime,
      screenshotDir,
      model: testResult.model,
      tokenUsage: testResult.tokenUsage,
    };

  } catch (err) {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
    const error = err instanceof Error ? err.message : String(err);
    return {
      name: test.name,
      result: 'error',
      summary: `Unexpected error: ${error}`,
      steps: [],
      durationMs: Date.now() - startTime,
      screenshotDir,
    };
  }
}

// ─── Helpers ───

/** Build a TestConfig for hooks or test scenarios */
function buildTestConfig(
  scenario: string,
  startUrl: string | undefined,
  config: RunnerConfig,
  label: string,
  screenshotDir?: string,
): TestConfig {
  return {
    scenario,
    startUrl,
    cdpUrl: config.cdpUrl,
    maxSteps: config.maxSteps,
    screenshotDir: screenshotDir || join(config.outputDir, label),
    model: config.model,
    screenshotEveryStep: config.screenshotEveryStep,
    actionTimeout: config.actionTimeout,
    testTimeout: config.testTimeout || undefined,
    generateReport: false,
  };
}

/** Count pass/fail/error/skip in a group result (recursive) */
function countResults(group: GroupResult): { total: number; passed: number; failed: number; errors: number; skipped: number } {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let errors = 0;
  let skipped = 0;

  for (const t of group.tests) {
    total++;
    if (t.result === 'pass') passed++;
    else if (t.result === 'fail') failed++;
    else if (t.result === 'error') errors++;
    else if (t.result === 'skip') skipped++;
  }

  for (const child of group.children) {
    const c = countResults(child);
    total += c.total;
    passed += c.passed;
    failed += c.failed;
    errors += c.errors;
    skipped += c.skipped;
  }

  return { total, passed, failed, errors, skipped };
}

/** Make a filesystem-safe name from a test name */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Recursively aggregate token usage across nested group results */
function aggregateGroupTokens(groups: GroupResult[]): TokenUsage | undefined {
  let total = 0;
  let prompt = 0;
  let completion = 0;

  function walk(group: GroupResult): void {
    for (const test of group.tests) {
      if (test.tokenUsage) {
        total += test.tokenUsage.totalTokens;
        prompt += test.tokenUsage.promptTokens;
        completion += test.tokenUsage.completionTokens;
      }
    }
    for (const child of group.children) {
      walk(child);
    }
  }

  for (const g of groups) {
    walk(g);
  }

  return total > 0
    ? { promptTokens: prompt, completionTokens: completion, totalTokens: total }
    : undefined;
}
