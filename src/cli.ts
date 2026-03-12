#!/usr/bin/env node
// CLI entry point for TestWithWords
// Usage: tww run "Go to example.com and verify the homepage loads"
//        tww run tests/checkout.test.tww
//        tww run tests/

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { stat } from 'fs/promises';
import { connectToBrowser, isBrowserAvailable, launchStandalone, launchUserBrowser, detectInstalledBrowser, getLaunchInstructions, VALID_BROWSERS, STANDALONE_BROWSERS, ATTACH_BROWSERS, type BrowserConnection, type StandaloneBrowser, type AttachBrowser } from './browser.js';
import { initLLMFromConfig, getProviderName } from './llm.js';
import { runTest } from './agent.js';
import { createReporter, createCompactReporter, printBanner, printSuiteHeader, printGroupResults, printSummary } from './reporter.js';
import { generateReport, generateSuiteReport } from './report.js';
import { resolveAuth, saveConfig, clearConfig, loadConfig, getConfigPath, tryAutoDetectGitHub, PROVIDERS, GITHUB_MODELS, fetchAvailableModels, getCompatibleChatModels, validateAuthConfig, type AuthConfig, type ProviderType } from './auth.js';
import { startDeviceFlow, openBrowser } from './device-flow.js';
import { DEFAULT_CONFIG, type TestConfig } from './types.js';
import { findTWWFiles, runSuite, type RunnerConfig } from './runner.js';
import { parseTWWFile } from './parser.js';
import { loadProjectConfig, generateDefaultConfig } from './config.js';

/** Check if a path is a directory */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

const program = new Command();

program
  .name('tww')
  .description('TestWithWords — AI-powered UI testing in plain English')
  .version('0.1.0')
  .addHelpText('after', `

Start here:
  tww auth
  tww run "Go to https://example.com and verify the page loads"
  tww run tests/
  tww launch --browser edge

Common workflows:
  Local browser:  tww run smoke.test.tww
  Reuse login:    tww launch --browser edge   then   tww run tests/ --attach --browser edge
  Check auth:     tww auth --status
`);

/**
 * Initialize LLM from resolved auth. Exits with helpful message if not configured.
 */
async function ensureLLM(): Promise<AuthConfig> {
  const auth = await resolveAuth();
  if (!auth) {
    console.log('');
    console.log(chalk.red('  ✗ ') + chalk.bold('No LLM provider is configured.'));
    console.log('');
    console.log(chalk.white('  Run:'));
    console.log(chalk.cyan('    tww auth'));
    console.log('');
    console.log(chalk.dim('  Recommended for first run: GitHub Models (free with a GitHub account).'));
    console.log(chalk.dim('  This will guide you through connecting to GitHub Models (free),'));
    console.log(chalk.dim('  OpenAI, Azure OpenAI, or any OpenAI-compatible API.'));
    console.log(chalk.dim('  Check current setup anytime with: tww auth --status'));
    console.log('');
    process.exit(1);
  }
  initLLMFromConfig(auth);
  return auth;
}

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sortGitHubModels(models: string[], preferredModel = PROVIDERS.github.defaultModel): string[] {
  const unique = [...new Set(models)];
  const rest = unique.filter(model => model !== preferredModel).sort((a, b) => a.localeCompare(b));
  return unique.includes(preferredModel)
    ? [preferredModel, ...rest]
    : rest;
}

function getGitHubModelHint(model: string): string {
  if (model === PROVIDERS.github.defaultModel) return 'recommended default';
  return '';
}

function pickNumberedOrNamedModel(choice: string, availableModels: string[], defaultModel: string): string {
  const trimmedChoice = choice.trim();
  const asNum = Number.parseInt(trimmedChoice, 10);

  if (!trimmedChoice) return defaultModel;
  if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= availableModels.length) {
    return availableModels[asNum - 1];
  }
  return trimmedChoice;
}

function printNotConfiguredAndExit(): never {
  console.log('');
  console.log(chalk.red('  ✗ ') + chalk.bold('No LLM provider is configured.'));
  console.log('');
  console.log(chalk.white('  Run:'));
  console.log(chalk.cyan('    tww auth'));
  console.log('');
  process.exit(1);
}

async function getResolvedAuthOrExit(): Promise<AuthConfig> {
  const auth = await resolveAuth();
  if (!auth) {
    printNotConfiguredAndExit();
  }
  return auth;
}

function printSection(title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(`  ${title}`));
  console.log(chalk.dim(`  ${'─'.repeat(title.length)}`));
}

function printCheck(ok: boolean, label: string, detail?: string): void {
  const icon = ok ? chalk.green('  ✓ ') : chalk.red('  ✗ ');
  console.log(icon + label);
  if (detail) {
    console.log(chalk.dim(`    ${detail}`));
  }
}

program
  .command('run')
  .description('Run a test scenario described in natural language')
  .argument('<target>', 'A .tww file, directory of .tww files, or inline test scenario')
  .option('-u, --url <url>', 'Starting URL to navigate to before testing')
  .option('--attach [port]', 'Reuse your Chrome/Edge session for login-required apps (SSO, cookies, saved sessions). Optional port, default 9222.')
  .option('-b, --browser <name>', 'Browser: chromium, firefox, webkit (standalone) or chrome, edge (attach-only)')
  .option('--headless', 'Run in headless mode (no visible browser window)')
  .option('-m, --model <model>', 'LLM model to use')
  .option('-s, --max-steps <steps>', 'Maximum number of steps')
  .option('--no-screenshots', 'Disable automatic screenshots')
  .option('-v, --verbose', 'Show step-by-step output for each test')
  .option('-r, --retries <n>', 'Retry failed tests n times')
  .option('-t, --timeout <ms>', 'Per-test timeout in ms')
  .option('-o, --output <dir>', 'Screenshot output directory')
  .option('--no-tokens', 'Hide token usage from output and reports')
  .addHelpText('after', `

Examples:
  tww run smoke.test.tww
  tww run tests/
  tww run "Verify the homepage loads" --url https://example.com
  tww run tests/ --attach --browser edge
  tww launch --browser edge --port 9333
  tww run tests/ --attach 9333 --browser edge
`)
  .action(async (target: string, opts: any) => {
    try {
      // Load project config (CLI flags override)
      const projectConfig = await loadProjectConfig();

      // 1. Initialize LLM
      const auth = await ensureLLM();

      // 2. Resolve options: CLI > .twwrc.json > defaults
      const model = opts.model ?? projectConfig.model ?? auth.model ?? DEFAULT_CONFIG.model!;
      const maxSteps = parseOptionalInt(opts.maxSteps) ?? projectConfig.maxSteps ?? DEFAULT_CONFIG.maxSteps!;
      const outputDir = opts.output ?? projectConfig.output ?? DEFAULT_CONFIG.screenshotDir!;
      const screenshotEveryStep = opts.screenshots !== false && (projectConfig.screenshotEveryStep !== false);
      const retries = parseOptionalInt(opts.retries) ?? projectConfig.retries ?? 0;
      const testTimeout = parseOptionalInt(opts.timeout) ?? projectConfig.timeout ?? 60000;
      const headless = opts.headless || false;

      // 3. Connect to browser
      let connection: BrowserConnection;
      const browserOpt = opts.browser?.toLowerCase();

      // Validate --browser value if provided
      if (browserOpt && !VALID_BROWSERS.includes(browserOpt as any)) {
        console.log('');
        console.log(chalk.red('  ✗ ') + chalk.bold(`Unknown browser: ${browserOpt}`));
        console.log(chalk.dim(`  Standalone: ${STANDALONE_BROWSERS.join(', ')}`));
        console.log(chalk.dim(`  Attach:     ${ATTACH_BROWSERS.join(', ')} (requires --attach)`));
        console.log('');
        process.exit(1);
        return;
      }

      // Reject standalone-only browsers with --attach
      if (opts.attach !== undefined && browserOpt && STANDALONE_BROWSERS.includes(browserOpt as StandaloneBrowser)) {
        console.log('');
        console.log(chalk.red('  ✗ ') + chalk.bold(`--browser ${browserOpt} can't be used with --attach`));
        console.log('');
        console.log(chalk.dim(`  Standalone (no --attach): ${STANDALONE_BROWSERS.join(', ')}`));
        console.log(chalk.dim(`  Attach (--attach):        ${ATTACH_BROWSERS.join(', ')}`));
        console.log('');
        process.exit(1);
        return;
      }

      // Reject attach-only browsers without --attach
      if (opts.attach === undefined && browserOpt && ATTACH_BROWSERS.includes(browserOpt as AttachBrowser)) {
        console.log('');
        console.log(chalk.red('  ✗ ') + chalk.bold(`--browser ${browserOpt} requires --attach`));
        console.log('');
        console.log(chalk.dim('  Chrome and Edge are only available when reusing your existing browser session.'));
        console.log(chalk.dim(`  Try: tww run ${target} --attach --browser ${browserOpt}`));
        console.log(chalk.dim(`  Or use a standalone engine: ${STANDALONE_BROWSERS.join(', ')}`));
        console.log('');
        process.exit(1);
        return;
      }

      if (opts.attach !== undefined) {
        // ─── Attached mode: connect to user's running browser via CDP ───
        const port = typeof opts.attach === 'string' ? parseInt(opts.attach) : 9222;
        const cdpUrl = `http://localhost:${port}`;
        const available = await isBrowserAvailable(cdpUrl);

        if (!available) {
          // Determine which browser to launch
          const attachBrowser: AttachBrowser | null = browserOpt
            ? (browserOpt as AttachBrowser)
            : detectInstalledBrowser();

          if (attachBrowser && ATTACH_BROWSERS.includes(attachBrowser as AttachBrowser)) {
            const ora = (await import('ora')).default;
            const name = attachBrowser === 'edge' ? 'Edge' : 'Chrome';
            console.log(chalk.yellow(`  ⚠ Closing ${name} to relaunch with debugging enabled`));
            const spinner = ora({ text: chalk.dim(`Launching ${name} on port ${port}...`), prefixText: '  ', color: 'cyan' }).start();
            try {
              connection = await launchUserBrowser(attachBrowser as AttachBrowser, port);
              spinner.succeed(chalk.green(`Connected to ${name}`));
            } catch {
              spinner.fail(chalk.red(`Could not connect to ${name}`));
              console.log('');
              console.log(chalk.dim(`  ${name} launched but debugging connection failed on port ${port}.`));
              console.log(chalk.dim('  This usually means another process is using that port.'));
              console.log('');
              console.log(chalk.white('  Try manually:'));
              console.log(chalk.cyan(getLaunchInstructions(attachBrowser as AttachBrowser, port)));
              console.log('');
              process.exit(1);
              return;
            }
          } else {
            console.log('');
            console.log(chalk.red('  ✗ ') + chalk.bold('No browser found on this system.'));
            console.log(chalk.dim('  Install Chrome or Edge, or omit --attach to use built-in Chromium.'));
            console.log('');
            process.exit(1);
            return;
          }
        } else {
          connection = await connectToBrowser(cdpUrl);
        }

      } else {
        // ─── Standalone mode (default): launch Playwright-managed browser ───
        const engine: StandaloneBrowser = (browserOpt && STANDALONE_BROWSERS.includes(browserOpt as StandaloneBrowser))
          ? browserOpt as StandaloneBrowser
          : 'chromium';

        const ora = (await import('ora')).default;
        const spinner = ora({ text: chalk.dim(`Launching ${engine}...`), prefixText: '  ', color: 'cyan' }).start();
        try {
          connection = await launchStandalone(engine, headless);
          spinner.succeed(chalk.green(connection.label));
        } catch (err) {
          spinner.fail(chalk.red(`Failed to launch ${engine}`));
          console.log('');
          console.log(chalk.dim(`  Make sure Playwright browsers are installed:`));
          console.log(chalk.cyan(`    npx playwright install ${engine}`));
          console.log('');
          process.exit(1);
          return;
        }
      }

      const cdpUrl = opts.attach !== undefined ? `http://localhost:${typeof opts.attach === 'string' ? parseInt(opts.attach) : 9222}` : 'standalone';

      // 4. Determine mode: .tww file(s) or inline scenario
      const isTWWTarget = target.endsWith('.tww') || await isDirectory(target);

      if (isTWWTarget) {
        // ─── .tww file mode (Jest-style output) ───
        const verbose = opts.verbose || false;
        const reporter = createCompactReporter(verbose);
        printBanner(`${connection.label} · ${getProviderName()} · ${model}`);

        const files = await findTWWFiles(target);
        if (files.length === 0) {
          console.log(chalk.yellow('  No .tww files found in: ') + target);
          await connection.close();
          process.exit(1);
        }

        const runnerConfig: RunnerConfig = {
          cdpUrl,
          model,
          maxSteps,
          actionTimeout: DEFAULT_CONFIG.actionTimeout!,
          outputDir,
          screenshotEveryStep,
          generateReport: DEFAULT_CONFIG.generateReport!,
          retries,
          testTimeout,
        };

        const suiteResults: import('./types.js').SuiteResult[] = [];

        for (const file of files) {
          const suite = await parseTWWFile(file);
          printSuiteHeader(file);
          const suiteResult = await runSuite(suite, connection.context, runnerConfig, reporter);

          // Print Jest-style results
          for (const group of suiteResult.groups) {
            printGroupResults(group);
          }
          console.log('');

          suiteResults.push(suiteResult);
        }

        printSummary(suiteResults);

        // Generate suite HTML report
        const reportPath = await generateSuiteReport(suiteResults, outputDir);
        console.log(chalk.dim(`  📄 Report: ${reportPath}`));
        console.log('');

        await connection.close();
        const anyFail = suiteResults.some(s => s.failed > 0 || s.errors > 0);
        process.exit(anyFail ? 1 : 0);

      } else {
        // ─── Inline scenario mode (backwards compatible with POC) ───
        const reporter = createReporter();
        reporter.connected(`${connection.label} · ${getProviderName()} · ${model}`);

        const config: TestConfig = {
          scenario: target,
          startUrl: opts.url,
          cdpUrl,
          maxSteps,
          screenshotDir: outputDir,
          model,
          screenshotEveryStep,
          actionTimeout: DEFAULT_CONFIG.actionTimeout!,
          testTimeout,
          generateReport: DEFAULT_CONFIG.generateReport!,
        };

        const result = await runTest(connection.page, config, reporter);

        if (config.generateReport) {
          const reportPath = await generateReport(result);
          console.log(chalk.dim(`  📄 Report: ${reportPath}`));
          console.log('');
        }

        await connection.close();
        process.exit(result.result === 'pass' ? 0 : 1);
      }

    } catch (err) {
      console.error('');
      console.error(chalk.red('  ✗ Unexpected error: ') + (err instanceof Error ? err.message : String(err)));
      console.error('');
      process.exit(1);
    }
  });

program
  .command('launch')
  .description('Launch your browser (Chrome/Edge) with remote debugging enabled')
  .option('-p, --port <port>', 'Remote debugging port', '9222')
  .option('-b, --browser <browser>', 'Browser: chrome or edge (auto-detected if omitted)')
  .addHelpText('after', `

Examples:
  tww launch --browser edge
  tww launch --browser chrome --port 9333

Then run:
  tww run tests/ --attach --browser edge
  tww run tests/ --attach 9333 --browser chrome
`)
  .action(async (opts: any) => {
    const port = parseInt(opts.port);
    const browserOpt = opts.browser?.toLowerCase();

    // Validate --browser value if provided
    if (browserOpt && !VALID_BROWSERS.includes(browserOpt as any)) {
      console.log('');
      console.log(chalk.red('  ✗ ') + chalk.bold(`Unknown browser: ${browserOpt}`));
      console.log(chalk.dim(`  Standalone: ${STANDALONE_BROWSERS.join(', ')}`));
      console.log(chalk.dim(`  Attach:     ${ATTACH_BROWSERS.join(', ')} (requires --attach)`));
      console.log('');
      process.exit(1);
      return;
    }

    // launch only supports attach browsers (chrome, edge)
    if (browserOpt && STANDALONE_BROWSERS.includes(browserOpt as StandaloneBrowser)) {
      console.log('');
      console.log(chalk.red('  ✗ ') + chalk.bold(`--browser ${browserOpt} can't be used with launch`));
      console.log('');
      console.log(chalk.dim(`  Standalone (no --attach): ${STANDALONE_BROWSERS.join(', ')}`));
      console.log(chalk.dim(`  Attach (--attach):        ${ATTACH_BROWSERS.join(', ')}`));
      console.log('');
      process.exit(1);
      return;
    }

    const browserType = browserOpt
      ? (browserOpt === 'edge' ? 'edge' as const : 'chrome' as const)
      : detectInstalledBrowser();

    if (!browserType) {
      console.log('');
      console.log(chalk.red('  ✗ ') + 'No browser found. Install Chrome or Edge.');
      console.log('');
      process.exit(1);
      return;
    }

    const name = browserType === 'edge' ? 'Edge' : 'Chrome';
    console.log('');
    console.log(chalk.yellow(`  ⚠ Closing ${name} to relaunch with debugging enabled`));
    const ora = (await import('ora')).default;
    const spinner = ora({ text: chalk.dim(`Launching ${name} on port ${port}...`), prefixText: '  ', color: 'cyan' }).start();

    try {
      await launchUserBrowser(browserType, port);
      spinner.succeed(chalk.green(`${name} running with debugging on port ${port}`));
      console.log(chalk.dim('  Next: sign in in that browser if needed, then run:'));
      console.log(chalk.cyan(`    tww run tests/ --attach ${port === 9222 ? '--browser ' + browserType : `${port} --browser ${browserType}`}`));
      console.log('');
    } catch {
      spinner.fail(chalk.red(`Could not connect to ${name}`));
      console.log('');
      console.log(chalk.dim(`  ${name} launched but debugging connection failed on port ${port}.`));
      console.log(chalk.dim('  This usually means another process is using that port.'));
      console.log('');
      console.log(chalk.white('  Try manually:'));
      console.log(chalk.cyan(getLaunchInstructions(browserType, port)));
      console.log('');
    }
  });

program
  .command('interactive')
  .alias('i')
  .description('Interactive mode — type test scenarios and run them one by one')
  .option('--attach [port]', 'Attach to your running browser via CDP (default port 9222)')
  .option('-b, --browser <name>', 'Browser: chromium, firefox, webkit (standalone) or chrome, edge (attach-only)')
  .option('--headless', 'Run in headless mode')
  .option('-m, --model <model>', 'LLM model to use')
  .option('-o, --output <dir>', 'Screenshot output directory')
  .addHelpText('after', `

Examples:
  tww interactive
  tww interactive --attach --browser edge
  tww interactive --attach 9333 --browser chrome
`)
  .action(async (opts: any) => {
    try {
      // 1. Initialize LLM
      const auth = await ensureLLM();
      const projectConfig = await loadProjectConfig();
      const model = opts.model ?? projectConfig.model ?? auth.model ?? DEFAULT_CONFIG.model!;
      const outputDir = opts.output ?? projectConfig.output ?? DEFAULT_CONFIG.screenshotDir!;

      // 2. Connect to browser
      let connection: BrowserConnection;
      const browserOpt = opts.browser?.toLowerCase();

      // Validate --browser value if provided
      if (browserOpt && !VALID_BROWSERS.includes(browserOpt as any)) {
        console.log('');
        console.log(chalk.red('  ✗ ') + chalk.bold(`Unknown browser: ${browserOpt}`));
        console.log(chalk.dim(`  Standalone: ${STANDALONE_BROWSERS.join(', ')}`));
        console.log(chalk.dim(`  Attach:     ${ATTACH_BROWSERS.join(', ')} (requires --attach)`));
        console.log('');
        process.exit(1);
        return;
      }

      // Reject standalone-only browsers with --attach
      if (opts.attach !== undefined && browserOpt && STANDALONE_BROWSERS.includes(browserOpt as StandaloneBrowser)) {
        console.log('');
        console.log(chalk.red('  ✗ ') + chalk.bold(`--browser ${browserOpt} can't be used with --attach`));
        console.log('');
        console.log(chalk.dim(`  Standalone (no --attach): ${STANDALONE_BROWSERS.join(', ')}`));
        console.log(chalk.dim(`  Attach (--attach):        ${ATTACH_BROWSERS.join(', ')}`));
        console.log('');
        process.exit(1);
        return;
      }

      if (opts.attach === undefined && browserOpt && ATTACH_BROWSERS.includes(browserOpt as AttachBrowser)) {
        console.log('');
        console.log(chalk.red('  ✗ ') + chalk.bold(`--browser ${browserOpt} requires --attach`));
        console.log('');
        console.log(chalk.dim(`  Try: tww interactive --attach --browser ${browserOpt}`));
        console.log(chalk.dim(`  Or use a standalone engine: ${STANDALONE_BROWSERS.join(', ')}`));
        console.log('');
        process.exit(1);
        return;
      }

      if (opts.attach !== undefined) {
        const port = typeof opts.attach === 'string' ? parseInt(opts.attach) : 9222;
        const cdpUrl = `http://localhost:${port}`;
        if (!(await isBrowserAvailable(cdpUrl))) {
          const attachBrowser: AttachBrowser | null = browserOpt
            ? (browserOpt as AttachBrowser)
            : detectInstalledBrowser();
          if (attachBrowser && ATTACH_BROWSERS.includes(attachBrowser as AttachBrowser)) {
            const ora = (await import('ora')).default;
            const name = attachBrowser === 'edge' ? 'Edge' : 'Chrome';
            console.log(chalk.yellow(`  ⚠ Closing ${name} to relaunch with debugging enabled`));
            const spinner = ora({ text: chalk.dim(`Launching ${name} on port ${port}...`), prefixText: '  ', color: 'cyan' }).start();
            try {
              connection = await launchUserBrowser(attachBrowser as AttachBrowser, port);
              spinner.succeed(chalk.green(`Connected to ${name}`));
            } catch {
              spinner.fail(chalk.red(`Could not connect to ${name}`));
              console.log('');
              console.log(chalk.dim(`  ${name} launched but debugging connection failed on port ${port}.`));
              console.log(chalk.dim('  This usually means another process is using that port.'));
              console.log('');
              console.log(chalk.white('  Try manually:'));
              console.log(chalk.cyan(getLaunchInstructions(attachBrowser as AttachBrowser, port)));
              console.log('');
              process.exit(1);
              return;
            }
          } else {
            console.log(chalk.red('  ✗ ') + 'No browser found. Omit --attach to use built-in Chromium.');
            process.exit(1);
            return;
          }
        } else {
          connection = await connectToBrowser(cdpUrl);
        }
      } else {
        const engine: StandaloneBrowser = (browserOpt && STANDALONE_BROWSERS.includes(browserOpt as StandaloneBrowser))
          ? browserOpt as StandaloneBrowser
          : 'chromium';
        const ora = (await import('ora')).default;
        const spinner = ora({ text: chalk.dim(`Launching ${engine}...`), prefixText: '  ', color: 'cyan' }).start();
        connection = await launchStandalone(engine, opts.headless || false);
        spinner.succeed(chalk.green(connection.label));
      }

      console.log('');
      console.log(chalk.bold.cyan('  🧪 TestWithWords — Interactive Mode'));
      console.log(chalk.dim('  ─'.repeat(25)));
      console.log(chalk.green('  ✓ ') + chalk.dim(`Connected to ${connection.label}`));
      console.log(chalk.green('  ✓ ') + chalk.dim(`Using ${getProviderName()} · ${model}`));
      console.log('');
      console.log(chalk.dim('  Type a test scenario and press Enter to run it.'));
      console.log(chalk.dim('  Start with a URL: "url:https://example.com" to navigate first.'));
      console.log(chalk.dim('  Type "quit" or "exit" to stop.'));
      console.log('');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      let runCount = 0;

      const prompt = () => {
        rl.question(chalk.cyan('  ▶ '), async (input) => {
          const trimmed = input.trim();
          if (!trimmed || trimmed === 'quit' || trimmed === 'exit') {
            console.log('');
            console.log(chalk.dim(`  ${runCount} test(s) run. Goodbye!`));
            rl.close();
            await connection.close();
            process.exit(0);
            return;
          }

          // Parse optional URL prefix
          let startUrl: string | undefined;
          let scenario = trimmed;
          if (trimmed.toLowerCase().startsWith('url:')) {
            const spaceIdx = trimmed.indexOf(' ', 4);
            if (spaceIdx > 0) {
              startUrl = trimmed.slice(4, spaceIdx).trim();
              scenario = trimmed.slice(spaceIdx).trim();
            } else {
              startUrl = trimmed.slice(4).trim();
              scenario = `Verify the page at ${startUrl} loads correctly`;
            }
          }

          runCount++;
          const config: TestConfig = {
            scenario,
            startUrl,
            cdpUrl: 'interactive',
            maxSteps: 25,
            screenshotDir: `${outputDir}/run-${runCount}`,
            model,
            screenshotEveryStep: true,
            actionTimeout: 10000,
            generateReport: true,
          };

          try {
            // Open a new page for each run
            const page = await connection.context.newPage();
            const reporter = createReporter();
            const result = await runTest(page, config, reporter);
            
            if (config.generateReport) {
              const reportPath = await generateReport(result);
              console.log(chalk.dim(`  📄 Report: ${reportPath}`));
            }
            
            await page.close();
          } catch (err) {
            console.log(chalk.red('  ✗ ') + (err instanceof Error ? err.message : String(err)));
          }

          console.log('');
          prompt();
        });
      };

      prompt();

    } catch (err) {
      console.error(chalk.red('  ✗ ') + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

// ─── Auth command ───

program
  .command('auth')
  .description('Set up LLM provider (GitHub Models, OpenAI, Azure, or custom)')
  .option('--status', 'Show current auth status')
  .option('--logout', 'Clear saved credentials')
  .addHelpText('after', `

Examples:
  tww auth
  tww auth --status
  tww auth --logout

Recommended for first run:
  GitHub Models (free with a GitHub account)
`)
  .action(async (opts: any) => {
    if (opts.logout) {
      await clearConfig();
      console.log('');
      console.log(chalk.green('  ✓ ') + 'Credentials cleared.');
      console.log('');
      return;
    }

    if (opts.status) {
      const auth = await resolveAuth();
      console.log('');
      if (auth) {
        console.log(chalk.green('  ✓ ') + chalk.bold('Authenticated'));
        console.log(chalk.dim(`    Provider: ${auth.displayName}`));
        console.log(chalk.dim(`    Model:    ${auth.model}`));
        console.log(chalk.dim(`    Config:   ${getConfigPath()}`));
      } else {
        console.log(chalk.yellow('  ✗ ') + 'Not authenticated. Run: tww auth');
      }
      console.log('');
      return;
    }

    // Interactive auth setup
    let rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let ask = (question: string): Promise<string> =>
      new Promise(resolve => rl.question(question, resolve));

    console.log('');
    console.log(chalk.bold.cyan('  🔑 TestWithWords — Auth Setup'));
    console.log(chalk.dim('  ─'.repeat(25)));
    console.log('');

    let detectedGitHubToken: string | null = null;

    // Check for auto-detected GitHub token first
    const autoGH = tryAutoDetectGitHub();
    if (autoGH) {
      console.log(chalk.green('  ✓ ') + chalk.bold('GitHub token detected automatically!'));
      console.log(chalk.dim('    (from gh CLI or GITHUB_TOKEN env var)'));
      console.log('');
      const useIt = await ask(chalk.white('  Use GitHub Models? (Y/n): '));
      if (!useIt || useIt.toLowerCase() !== 'n') {
        detectedGitHubToken = autoGH;
      }
    }

    let provider: ProviderType;
    if (detectedGitHubToken) {
      provider = 'github';
    } else {
      console.log(chalk.white('  Choose your LLM provider:'));
      console.log('');
      console.log(chalk.cyan('    1) GitHub Models') + chalk.dim(' — Free with any GitHub account'));
      console.log(chalk.cyan('    2) OpenAI') + chalk.dim(' — Direct OpenAI API'));
      console.log(chalk.cyan('    3) Azure OpenAI') + chalk.dim(' — Azure OpenAI Service'));
      console.log(chalk.cyan('    4) Custom') + chalk.dim(' — Any OpenAI-compatible API (Ollama, etc.)'));
      console.log('');

      const choice = await ask(chalk.white('  Choice (1-4): '));
      const providerMap: Record<string, ProviderType> = { '1': 'github', '2': 'openai', '3': 'azure', '4': 'custom' };
      provider = providerMap[choice.trim()] || 'github';
    }

    const preset = PROVIDERS[provider];

    console.log('');

    let config: AuthConfig;

    if (provider === 'github') {
      // GitHub Device Flow — same experience as Copilot CLI
      let token: string;
      if (detectedGitHubToken) {
        token = detectedGitHubToken;
        console.log(chalk.green('  ✓ ') + chalk.dim('Using detected GitHub token'));
      } else {
        console.log(chalk.white('  Signing in with GitHub...'));
        console.log('');

        try {
          const flow = await startDeviceFlow();

          // Show the code and open browser
          console.log(chalk.bold(`  Your code: ${chalk.cyan(flow.userCode)}`));
          console.log('');
          console.log(chalk.dim(`  Opening ${flow.verificationUri} in your browser...`));
          console.log(chalk.dim('  Enter the code above to authorize TestWithWords.'));
          console.log('');

          openBrowser(flow.verificationUri);

          // Close readline before spinner — ora interferes with stdin
          rl.close();

          // Wait for approval with a spinner
          const ora = (await import('ora')).default;
          const spinner = ora({
            text: chalk.dim('Waiting for you to approve...'),
            prefixText: '  ',
            color: 'cyan',
          }).start();

          try {
            token = await flow.pollForToken();
            spinner.succeed(chalk.green('Approved!'));
          } catch (err) {
            spinner.fail(chalk.red(err instanceof Error ? err.message : 'Login failed'));
            rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            ask = (question: string): Promise<string> =>
              new Promise(resolve => rl.question(question, resolve));
            console.log('');
            console.log(chalk.dim('  Alternative: create a PAT at https://github.com/settings/tokens'));
            console.log(chalk.dim('  If you use a PAT, it needs the models:read permission.'));
            const manualToken = await ask(chalk.white('  Paste token manually (or Enter to quit): '));
            if (!manualToken.trim()) {
              rl.close();
              return;
            }
            token = manualToken.trim();
          }

          // Recreate readline after spinner is done
          rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          ask = (question: string): Promise<string> =>
            new Promise(resolve => rl.question(question, resolve));
        } catch (err) {
          console.log(chalk.red('  ✗ ') + (err instanceof Error ? err.message : 'Device flow failed'));
          console.log('');
          console.log(chalk.dim('  Alternative: create a PAT at https://github.com/settings/tokens')); 
          console.log(chalk.dim('  If you use a PAT, it needs the models:read permission.'));
          const manualToken = await ask(chalk.white('  Paste token manually (or Enter to quit): '));
          if (!manualToken.trim()) {
            rl.close();
            return;
          }
          token = manualToken.trim();
        }
      }

      // Let user pick model — fetch available models from the API first
      console.log('');
      console.log(chalk.dim('  Fetching available models...'));
      
      let availableModels = await fetchAvailableModels(token, preset.baseURL);
      let probeSummary: { usedCache: boolean; checkedCount: number; totalCount: number } | null = null;
      let compatibleModels: string[] = [];
      
      if (availableModels && availableModels.length > 0) {
        availableModels = sortGitHubModels(availableModels);
        console.log(chalk.dim('  Checking which of those work in this CLI...'));
        const compatibility = await getCompatibleChatModels(
          'github',
          token,
          preset.baseURL,
          availableModels,
          preset.defaultModel,
        );
        probeSummary = {
          usedCache: compatibility.usedCache,
          checkedCount: compatibility.checkedCount,
          totalCount: compatibility.totalCount,
        };
        compatibleModels = sortGitHubModels(compatibility.models);
        console.log(chalk.green(`  ✓ Found ${availableModels.length} models from the API`));
      } else {
        console.log(chalk.yellow('  ⚠ Could not fetch GitHub Models list — showing known fallbacks'));
        console.log(chalk.dim('  If this keeps happening, your token may not have GitHub Models access yet.'));
        console.log(chalk.dim('  PATs need the models:read permission.'));
        availableModels = sortGitHubModels([...GITHUB_MODELS]);
        compatibleModels = [...availableModels];
      }

      if (probeSummary) {
        const checkedText = probeSummary.usedCache
          ? `Using cached compatibility results from ${probeSummary.checkedCount} checked model(s).`
          : `Checked ${probeSummary.checkedCount} of ${probeSummary.totalCount} model(s) to avoid burning rate limits.`;
        console.log(chalk.dim(`  ${checkedText}`));
        console.log(chalk.dim('  ✓ = pre-validated in this CLI, ? = discovered from the API but not pre-validated yet.'));
        console.log(chalk.dim('  VS Code/Copilot may show a broader catalog than this public API path.'));
      }

      console.log('');
      console.log(chalk.white('  Available models:'));
      
      // Show models in a compact numbered list, marking recommended
      const PAGE_SIZE = 30;
      const totalModels = availableModels.length;
      const showPaged = totalModels > PAGE_SIZE;
      const displayModels = showPaged ? availableModels.slice(0, PAGE_SIZE) : availableModels;
      const compatibleSet = new Set(compatibleModels);
      
      displayModels.forEach((m, i) => {
        const hint = getGitHubModelHint(m);
        const rec = hint ? chalk.dim(` (${hint})`) : '';
        const status = compatibleSet.has(m) ? chalk.green('✓') : chalk.dim('?');
        console.log(`    ${status} ${chalk.cyan(`${i + 1}) ${m}`)}${rec}`);
      });
      
      if (showPaged) {
        console.log(chalk.dim(`    ... and ${totalModels - PAGE_SIZE} more`));
      }
      
      console.log('');
      console.log(chalk.dim('  Enter a number to pick from the list, or type a model name directly.'));
      const defaultGitHubModel = compatibleModels.includes(preset.defaultModel)
        ? preset.defaultModel
        : compatibleModels[0] || availableModels[0];
      while (true) {
        const modelChoice = await ask(chalk.white(`  Model (default ${defaultGitHubModel}): `));
        const model = pickNumberedOrNamedModel(modelChoice, availableModels, defaultGitHubModel);

        config = {
          provider: 'github',
          apiKey: token,
          baseURL: preset.baseURL,
          model,
          displayName: 'GitHub Models',
        };

        console.log(chalk.dim(`  Validating ${model}...`));

        const validation = await validateAuthConfig(config);
        if (validation.ok) {
          console.log(chalk.green(`  ✓ Model ready: ${model}`));
          break;
        }

        console.log(chalk.red(`  ✗ ${validation.error || 'Model validation failed'}`));
        console.log(chalk.dim('  Pick another model, or press Ctrl+C to cancel.'));
        console.log('');
      }

    } else if (provider === 'openai') {
      const key = await ask(chalk.white('  OpenAI API key: '));
      while (true) {
        const model = await ask(chalk.white('  Model (default gpt-4o-mini): '));
        config = {
          provider: 'openai',
          apiKey: key.trim(),
          model: model.trim() || 'gpt-4o-mini',
          displayName: 'OpenAI',
        };

        const validation = await validateAuthConfig(config);
        if (validation.ok) break;
        console.log(chalk.red('  ✗ ') + (validation.error || 'Model validation failed'));
        console.log('');
      }

    } else if (provider === 'azure') {
      const key = await ask(chalk.white('  Azure OpenAI API key: '));
      const endpoint = await ask(chalk.white('  Azure endpoint URL: '));
      while (true) {
        const model = await ask(chalk.white('  Deployment name (default gpt-4o-mini): '));
        config = {
          provider: 'azure',
          apiKey: key.trim(),
          baseURL: endpoint.trim(),
          model: model.trim() || 'gpt-4o-mini',
          apiVersion: '2024-06-01',
          displayName: 'Azure OpenAI',
        };

        const validation = await validateAuthConfig(config);
        if (validation.ok) break;
        console.log(chalk.red('  ✗ ') + (validation.error || 'Model validation failed'));
        console.log('');
      }

    } else {
      const baseURL = await ask(chalk.white('  API base URL (e.g. http://localhost:11434/v1): '));
      const key = await ask(chalk.white('  API key (or "none"): '));
      while (true) {
        const model = await ask(chalk.white('  Model name: '));
        config = {
          provider: 'custom',
          apiKey: key.trim() === 'none' ? 'none' : key.trim(),
          baseURL: baseURL.trim(),
          model: model.trim() || 'default',
          displayName: `Custom (${baseURL.trim()})`,
        };

        const validation = await validateAuthConfig(config);
        if (validation.ok) break;
        console.log(chalk.red('  ✗ ') + (validation.error || 'Model validation failed'));
        console.log('');
      }
    }

    await saveConfig(config);
    console.log('');
    console.log(chalk.green('  ✓ ') + `Saved! Using ${chalk.bold(config.displayName)} with ${chalk.bold(config.model)}`);
    console.log(chalk.dim(`    Config: ${getConfigPath()}`));
    console.log('');
    console.log(chalk.dim('  Next steps:'));
    console.log(chalk.cyan('    tww run "Go to https://example.com and verify the page loads"'));
    console.log(chalk.cyan('    tww run first.test.tww'));
    console.log(chalk.cyan('    tww launch --browser edge   then   tww run tests/ --attach --browser edge'));
    console.log('');

    rl.close();
  });

program
  .command('models')
  .description('List models available from your configured provider')
  .option('--check', 'Pre-validate discovered models where supported')
  .addHelpText('after', `

Examples:
  tww models
  tww models --check

Notes:
  GitHub Models: fetches the live API catalog and can pre-check compatibility.
  Azure OpenAI: deployments are not enumerable here; use your configured deployment name.
`)
  .action(async (opts: any) => {
    const auth = await getResolvedAuthOrExit();

    printSection('Available Models');
    console.log(chalk.dim(`  Provider: ${auth.displayName}`));
    console.log(chalk.dim(`  Current:  ${auth.model}`));

    if (auth.provider === 'azure') {
      console.log('');
      console.log(chalk.yellow('  Azure OpenAI does not expose deployment discovery through this CLI path.'));
      const validation = await validateAuthConfig(auth);
      printCheck(validation.ok, 'Configured deployment', validation.ok ? auth.model : validation.error);
      console.log('');
      return;
    }

    const models = await fetchAvailableModels(auth.apiKey, auth.baseURL);
    if (!models || models.length === 0) {
      console.log('');
      console.log(chalk.red('  ✗ Could not fetch a model list from the provider.'));
      console.log('');
      process.exit(1);
      return;
    }

    const sortedModels = auth.provider === 'github'
      ? sortGitHubModels(models, auth.model)
      : [...new Set(models)].sort((a, b) => a.localeCompare(b));

    let compatibleSet = new Set<string>();
    let compatibilitySummary: string | null = null;
    if (opts.check && auth.provider === 'github') {
      const compatibility = await getCompatibleChatModels(
        'github',
        auth.apiKey,
        auth.baseURL,
        sortedModels,
        auth.model,
      );
      compatibleSet = new Set(compatibility.models);
      compatibilitySummary = compatibility.usedCache
        ? `Using cached results from ${compatibility.checkedCount} checked model(s).`
        : `Checked ${compatibility.checkedCount} of ${compatibility.totalCount} model(s).`;
    }

    console.log('');
    console.log(chalk.white(`  ${sortedModels.length} model(s) discovered:`));
    sortedModels.forEach((model, index) => {
      const current = model === auth.model ? chalk.yellow(' (current)') : '';
      const checked = opts.check && auth.provider === 'github'
        ? compatibleSet.has(model)
          ? chalk.green('✓ ')
          : chalk.dim('? ')
        : '';
      console.log(`  ${checked}${chalk.cyan(`${index + 1})`)} ${model}${current}`);
    });

    if (compatibilitySummary) {
      console.log('');
      console.log(chalk.dim(`  ${compatibilitySummary}`));
      console.log(chalk.dim('  ✓ = pre-validated in this CLI, ? = discovered but not pre-validated in this run.'));
    }

    console.log('');
  });

program
  .command('doctor')
  .description('Check auth, model, browser, and config health')
  .option('--port <port>', 'Attach-mode port to inspect', '9222')
  .addHelpText('after', `

Examples:
  tww doctor
  tww doctor --port 9333

Checks:
  Auth configuration, current model validation, browser availability, and attach-mode readiness.
`)
  .action(async (opts: any) => {
    printSection('Doctor');

    const port = parseOptionalInt(opts.port) ?? 9222;
    const cdpUrl = `http://localhost:${port}`;

    let auth: AuthConfig | null = null;
    auth = await resolveAuth();

    printSection('Auth');
    if (!auth) {
      printCheck(false, 'Provider configured', 'Run tww auth');
    } else {
      printCheck(true, 'Provider configured', `${auth.displayName} · ${auth.model}`);
      const validation = await validateAuthConfig(auth);
      printCheck(validation.ok, 'Current model validation', validation.ok ? 'The configured model answered a test request.' : validation.error);
    }

    printSection('Project Config');
    try {
      const projectConfig = await loadProjectConfig();
      const hasConfig = Object.keys(projectConfig).length > 0;
      printCheck(true, hasConfig ? 'Project config loaded' : 'No project config found', hasConfig ? JSON.stringify(projectConfig) : 'Using CLI/default values.');
    } catch (err) {
      printCheck(false, 'Project config invalid', err instanceof Error ? err.message : String(err));
    }

    printSection('Browser');
    const detectedBrowser = detectInstalledBrowser();
    printCheck(Boolean(detectedBrowser), 'Attach-capable browser installed', detectedBrowser ? detectedBrowser : 'Install Chrome or Edge for --attach mode.');
    const attachReady = await isBrowserAvailable(cdpUrl);
    printCheck(attachReady, `Attach endpoint on port ${port}`, attachReady ? `${cdpUrl} is reachable.` : `Nothing listening at ${cdpUrl}. Run: tww launch --browser edge${port !== 9222 ? ` --port ${port}` : ''}`);

    if (auth && auth.provider !== 'azure') {
      printSection('Models API');
      const models = await fetchAvailableModels(auth.apiKey, auth.baseURL);
      printCheck(Boolean(models && models.length > 0), 'Model list fetch', models && models.length > 0 ? `${models.length} model(s) discovered.` : 'Could not fetch models from the provider.');
    }

    console.log('');
  });

// ─── Init command ───

program
  .command('init')
  .description('Create a .twwrc.json config file with defaults')
  .action(async () => {
    const { writeFile } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const configPath = '.twwrc.json';

    if (existsSync(configPath)) {
      console.log('');
      console.log(chalk.yellow('  ⚠ ') + '.twwrc.json already exists. Delete it first to regenerate.');
      console.log('');
      return;
    }

    await writeFile(configPath, generateDefaultConfig(), 'utf-8');
    console.log('');
    console.log(chalk.green('  ✓ ') + 'Created .twwrc.json with default settings');
    console.log(chalk.dim('    Edit the file to customize model, timeout, retries, etc.'));
    console.log('');
  });

// Default: show help
program.parse();
