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
import { resolveAuth, saveConfig, clearConfig, loadConfig, getConfigPath, tryAutoDetectGitHub, PROVIDERS, GITHUB_MODELS, fetchAvailableModels, type AuthConfig, type ProviderType } from './auth.js';
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
  .version('0.1.0');

/**
 * Initialize LLM from resolved auth. Exits with helpful message if not configured.
 */
async function ensureLLM(): Promise<void> {
  const auth = await resolveAuth();
  if (!auth) {
    console.log('');
    console.log(chalk.red('  ✗ ') + chalk.bold('Not authenticated. Run:'));
    console.log('');
    console.log(chalk.cyan('    tww auth'));
    console.log('');
    console.log(chalk.dim('  This will guide you through connecting to GitHub Models (free),'));
    console.log(chalk.dim('  OpenAI, Azure OpenAI, or any OpenAI-compatible API.'));
    console.log('');
    process.exit(1);
  }
  initLLMFromConfig(auth);
}

program
  .command('run')
  .description('Run a test scenario described in natural language')
  .argument('<target>', 'A .tww file, directory of .tww files, or inline test scenario')
  .option('-u, --url <url>', 'Starting URL to navigate to before testing')
  .option('--attach [port]', 'Attach to your running browser via CDP (for SSO/cookies). Optional port, default 9222.')
  .option('-b, --browser <name>', 'Browser engine: chromium, firefox, webkit (standalone) or chrome, edge (attach)')
  .option('--headless', 'Run in headless mode (no visible browser window)')
  .option('-m, --model <model>', 'LLM model to use', 'gpt-4o-mini')
  .option('-s, --max-steps <steps>', 'Maximum number of steps', '25')
  .option('--no-screenshots', 'Disable automatic screenshots')
  .option('-v, --verbose', 'Show step-by-step output for each test')
  .option('-r, --retries <n>', 'Retry failed tests n times', '0')
  .option('-t, --timeout <ms>', 'Per-test timeout in ms', '60000')
  .option('-o, --output <dir>', 'Screenshot output directory', './results')
  .option('--no-tokens', 'Hide token usage from output and reports')
  .action(async (target: string, opts: any) => {
    try {
      // Load project config (CLI flags override)
      const projectConfig = await loadProjectConfig();

      // 1. Initialize LLM
      await ensureLLM();

      // 2. Resolve options: CLI > .twwrc.json > defaults
      const model = opts.model ?? projectConfig.model ?? DEFAULT_CONFIG.model!;
      const maxSteps = parseInt(opts.maxSteps) || projectConfig.maxSteps || DEFAULT_CONFIG.maxSteps!;
      const outputDir = opts.output ?? projectConfig.output ?? DEFAULT_CONFIG.screenshotDir!;
      const screenshotEveryStep = opts.screenshots !== false && (projectConfig.screenshotEveryStep !== false);
      const retries = parseInt(opts.retries) || projectConfig.retries || 0;
      const testTimeout = parseInt(opts.timeout) || projectConfig.timeout || 60000;
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
        printBanner(`${connection.label} · LLM: ${getProviderName()}`);

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
        reporter.connected(`${connection.label} · LLM: ${getProviderName()}`);

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
      console.log(chalk.dim('  You can now use --attach to connect to it.'));
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
  .option('-b, --browser <name>', 'Browser: chromium, firefox, webkit (standalone) or chrome, edge (attach)')
  .option('--headless', 'Run in headless mode')
  .option('-m, --model <model>', 'LLM model to use', 'gpt-4o-mini')
  .option('-o, --output <dir>', 'Screenshot output directory', './results')
  .action(async (opts: any) => {
    try {
      // 1. Initialize LLM
      await ensureLLM();

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
            screenshotDir: `${opts.output}/run-${runCount}`,
            model: opts.model || 'gpt-4o-mini',
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

    // Check for auto-detected GitHub token first
    const autoGH = tryAutoDetectGitHub();
    if (autoGH) {
      console.log(chalk.green('  ✓ ') + chalk.bold('GitHub token detected automatically!'));
      console.log(chalk.dim('    (from gh CLI or GITHUB_TOKEN env var)'));
      console.log('');
      const useIt = await ask(chalk.white('  Use GitHub Models? (Y/n): '));
      if (!useIt || useIt.toLowerCase() !== 'n') {
        const config: AuthConfig = {
          provider: 'github',
          apiKey: autoGH,
          baseURL: PROVIDERS.github.baseURL,
          model: PROVIDERS.github.defaultModel,
          displayName: 'GitHub Models',
        };
        await saveConfig(config);
        console.log('');
        console.log(chalk.green('  ✓ ') + `Saved! Using ${chalk.bold('GitHub Models')} with ${chalk.bold(config.model)}`);
        console.log(chalk.dim(`    Config: ${getConfigPath()}`));
        console.log('');
        rl.close();
        return;
      }
    }

    // Choose provider
    console.log(chalk.white('  Choose your LLM provider:'));
    console.log('');
    console.log(chalk.cyan('    1) GitHub Models') + chalk.dim(' — Free with any GitHub account'));
    console.log(chalk.cyan('    2) OpenAI') + chalk.dim(' — Direct OpenAI API'));
    console.log(chalk.cyan('    3) Azure OpenAI') + chalk.dim(' — Azure OpenAI Service'));
    console.log(chalk.cyan('    4) Custom') + chalk.dim(' — Any OpenAI-compatible API (Ollama, etc.)'));
    console.log('');

    const choice = await ask(chalk.white('  Choice (1-4): '));
    const providerMap: Record<string, ProviderType> = { '1': 'github', '2': 'openai', '3': 'azure', '4': 'custom' };
    const provider = providerMap[choice.trim()] || 'github';
    const preset = PROVIDERS[provider];

    console.log('');

    let config: AuthConfig;

    if (provider === 'github') {
      // GitHub Device Flow — same experience as Copilot CLI
      console.log(chalk.white('  Signing in with GitHub...'));
      console.log('');

      let token: string;
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
          process.exit(1);
          return; // unreachable but helps TS
        }

        // Recreate readline after spinner is done
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        ask = (question: string): Promise<string> =>
          new Promise(resolve => rl.question(question, resolve));
      } catch (err) {
        console.log(chalk.red('  ✗ ') + (err instanceof Error ? err.message : 'Device flow failed'));
        console.log('');
        console.log(chalk.dim('  Alternative: create a PAT at https://github.com/settings/tokens'));
        const manualToken = await ask(chalk.white('  Paste token manually (or Enter to quit): '));
        if (!manualToken.trim()) {
          rl.close();
          return;
        }
        token = manualToken.trim();
      }

      // Let user pick model — fetch available models from the API first
      console.log('');
      const ora2 = (await import('ora')).default;
      const modelSpinner = ora2({
        text: chalk.dim('Fetching available models...'),
        prefixText: '  ',
        color: 'cyan',
      }).start();
      
      let availableModels = await fetchAvailableModels(token, preset.baseURL);
      
      if (availableModels && availableModels.length > 0) {
        modelSpinner.succeed(chalk.green(`Found ${availableModels.length} models`));
      } else {
        modelSpinner.info(chalk.dim('Could not fetch model list — showing defaults'));
        availableModels = [...GITHUB_MODELS];
      }

      console.log('');
      console.log(chalk.white('  Available models:'));
      
      // Show models in a compact numbered list, marking recommended
      const PAGE_SIZE = 20;
      const totalModels = availableModels.length;
      const showPaged = totalModels > PAGE_SIZE;
      const displayModels = showPaged ? availableModels.slice(0, PAGE_SIZE) : availableModels;
      
      displayModels.forEach((m, i) => {
        const rec = m === 'gpt-4o-mini' ? chalk.dim(' (recommended)') : '';
        console.log(chalk.cyan(`    ${i + 1}) ${m}`) + rec);
      });
      
      if (showPaged) {
        console.log(chalk.dim(`    ... and ${totalModels - PAGE_SIZE} more`));
      }
      
      console.log('');
      console.log(chalk.dim('  Enter a number to pick from the list, or type a model name directly.'));
      const modelChoice = await ask(chalk.white('  Model (default gpt-4o-mini): '));
      const trimmedChoice = modelChoice.trim();
      
      let model: string;
      const asNum = parseInt(trimmedChoice);
      if (!trimmedChoice) {
        // Default
        model = 'gpt-4o-mini';
      } else if (!isNaN(asNum) && asNum >= 1 && asNum <= totalModels) {
        // Picked by number
        model = availableModels[asNum - 1];
      } else {
        // Typed a model name directly
        model = trimmedChoice;
      }

      config = {
        provider: 'github',
        apiKey: token,
        baseURL: preset.baseURL,
        model,
        displayName: 'GitHub Models',
      };

    } else if (provider === 'openai') {
      const key = await ask(chalk.white('  OpenAI API key: '));
      const model = await ask(chalk.white('  Model (default gpt-4o-mini): '));
      config = {
        provider: 'openai',
        apiKey: key.trim(),
        model: model.trim() || 'gpt-4o-mini',
        displayName: 'OpenAI',
      };

    } else if (provider === 'azure') {
      const key = await ask(chalk.white('  Azure OpenAI API key: '));
      const endpoint = await ask(chalk.white('  Azure endpoint URL: '));
      const model = await ask(chalk.white('  Deployment name (default gpt-4o-mini): '));
      config = {
        provider: 'azure',
        apiKey: key.trim(),
        baseURL: endpoint.trim(),
        model: model.trim() || 'gpt-4o-mini',
        apiVersion: '2024-06-01',
        displayName: 'Azure OpenAI',
      };

    } else {
      const baseURL = await ask(chalk.white('  API base URL (e.g. http://localhost:11434/v1): '));
      const key = await ask(chalk.white('  API key (or "none"): '));
      const model = await ask(chalk.white('  Model name: '));
      config = {
        provider: 'custom',
        apiKey: key.trim() === 'none' ? 'none' : key.trim(),
        baseURL: baseURL.trim(),
        model: model.trim() || 'default',
        displayName: `Custom (${baseURL.trim()})`,
      };
    }

    await saveConfig(config);
    console.log('');
    console.log(chalk.green('  ✓ ') + `Saved! Using ${chalk.bold(config.displayName)} with ${chalk.bold(config.model)}`);
    console.log(chalk.dim(`    Config: ${getConfigPath()}`));
    console.log('');
    console.log(chalk.dim('  You can now run tests with: tww run "your test scenario"'));
    console.log('');

    rl.close();
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
