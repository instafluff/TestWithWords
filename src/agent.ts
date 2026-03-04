// Agent — the observe-act loop that drives the test execution
// This is the core of TestWithWords: observe page → ask LLM → execute tool → repeat

import type { Page } from 'playwright-core';
import type { ToolCall, TestConfig, TestResult, TestStep, TokenUsage } from './types.js';
import { capturePageState } from './page.js';
import { getNextToolCall, resetConversation, reportToolResult, getActiveModel } from './llm.js';
import { executeTool } from './executors.js';
import { isTerminalTool } from './tools.js';
import type { Reporter } from './reporter.js';

/**
 * Run a complete test scenario using the observe-act loop.
 */
export async function runTest(
  page: Page,
  config: TestConfig,
  reporter: Reporter,
): Promise<TestResult> {
  const steps: TestStep[] = [];
  const startTime = Date.now();
  
  // Token usage accumulator
  const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  
  // Reset LLM conversation for this test
  resetConversation();
  
  reporter.testStart(config.scenario);

  try {
    // Navigate to start URL if provided
    if (config.startUrl) {
      reporter.stepProgress(0, 'navigate', `Navigating to ${config.startUrl}`);
      await page.goto(config.startUrl, {
        timeout: config.actionTimeout,
        waitUntil: 'domcontentloaded',
      });
      // Wait a bit for JS to render
      await page.waitForTimeout(1500);
    }

    // Loop detection: track recent tool calls to catch stuck loops
    const recentCalls: string[] = [];
    const LOOP_THRESHOLD = 3;

    // Main observe-act loop
    for (let step = 0; step < config.maxSteps; step++) {
      // Per-test timeout check
      if (config.testTimeout && (Date.now() - startTime) > config.testTimeout) {
        const summary = `Test timed out after ${(config.testTimeout / 1000).toFixed(0)}s`;
        reporter.testDone('fail', summary, steps, Date.now() - startTime);
        return buildResult(config, steps, 'fail', summary, startTime, totalUsage);
      }

      const stepStart = Date.now();
      
      // 1. OBSERVE — capture page state
      reporter.stepProgress(step, 'observe', 'Reading page...');
      const pageState = await capturePageState(
        page,
        config.screenshotEveryStep ? config.screenshotDir : undefined,
        step,
      );

      // 2. THINK — ask the LLM for the next tool call (with one retry)
      reporter.stepProgress(step, 'think', 'Deciding next action...');
      let toolCall: ToolCall;
      let stepUsage: TokenUsage | null = null;
      try {
        const llmResult = await getNextToolCall(config.scenario, pageState, step, config.model);
        toolCall = llmResult.toolCall;
        stepUsage = llmResult.usage;
      } catch (firstErr) {
        // Retry once
        try {
          const llmResult = await getNextToolCall(config.scenario, pageState, step, config.model);
          toolCall = llmResult.toolCall;
          stepUsage = llmResult.usage;
        } catch (retryErr) {
          const error = retryErr instanceof Error ? retryErr.message : String(retryErr);
          reporter.stepError(step, `LLM error (after retry): ${error}`);
          steps.push({
            index: step,
            toolCall: { name: 'done', args: { result: 'fail', summary: `LLM error: ${error}` } },
            description: `LLM error: ${error}`,
            screenshotPath: pageState.screenshotPath,
            timestamp: stepStart,
            durationMs: Date.now() - stepStart,
            success: false,
            error,
          });
          return buildResult(config, steps, 'error', `LLM error: ${error}`, startTime, totalUsage);
        }
      }

      // Accumulate token usage
      if (stepUsage) {
        totalUsage.promptTokens += stepUsage.promptTokens;
        totalUsage.completionTokens += stepUsage.completionTokens;
        totalUsage.totalTokens += stepUsage.totalTokens;
      }

      // 3. Loop detection — same tool + args 3 times in a row means stuck
      const callSig = JSON.stringify({ name: toolCall.name, args: toolCall.args });
      recentCalls.push(callSig);
      if (recentCalls.length > LOOP_THRESHOLD) recentCalls.shift();

      if (recentCalls.length === LOOP_THRESHOLD && recentCalls.every(c => c === callSig)) {
        const summary = `Agent stuck in loop — repeated "${toolCall.name}" ${LOOP_THRESHOLD} times`;
        reporter.stepError(step, summary);
        reporter.testDone('fail', summary, steps, Date.now() - startTime);
        return buildResult(config, steps, 'fail', summary, startTime, totalUsage);
      }

      // 4. CHECK — is the test done?
      if (isTerminalTool(toolCall.name)) {
        // Take a final screenshot
        const finalState = await capturePageState(page, config.screenshotDir, step);
        
        const result = (toolCall.args.result as string) || 'fail';
        const summary = (toolCall.args.summary as string) || 'Test completed';

        steps.push({
          index: step,
          toolCall,
          description: summary,
          screenshotPath: finalState.screenshotPath,
          timestamp: stepStart,
          durationMs: Date.now() - stepStart,
          success: true,
          tokenUsage: stepUsage ?? undefined,
        });

        reporter.testDone(result, summary, steps, Date.now() - startTime);
        return buildResult(config, steps, result as 'pass' | 'fail', summary, startTime, totalUsage);
      }

      // 4. ACT — execute the tool
      const description = (toolCall.args.description as string)
        || (toolCall.args.reason as string)
        || toolCall.name;
      reporter.stepAction(step, toolCall.name, description);
      
      const result = await executeTool(toolCall.name, page, toolCall.args, pageState.elements, config.actionTimeout);
      
      // Report result to LLM conversation for error recovery
      if (!result.success && result.error) {
        reportToolResult('', `Error: ${result.error}`);
      }

      // Wait for page to settle after action
      await page.waitForTimeout(800);
      
      steps.push({
        index: step,
        toolCall,
        description,
        screenshotPath: pageState.screenshotPath,
        timestamp: stepStart,
        durationMs: Date.now() - stepStart,
        success: result.success,
        error: result.error,
        tokenUsage: stepUsage ?? undefined,
      });

      if (!result.success) {
        reporter.stepError(step, result.error || 'Action failed');
        // Don't abort — let the LLM know and try to recover
      } else {
        reporter.stepDone(step);
      }
    }

    // Exceeded max steps
    const summary = `Test exceeded maximum ${config.maxSteps} steps without reaching a conclusion`;
    reporter.testDone('fail', summary, steps, Date.now() - startTime);
    return buildResult(config, steps, 'fail', summary, startTime, totalUsage);

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    reporter.testDone('error', `Unexpected error: ${error}`, steps, Date.now() - startTime);
    return buildResult(config, steps, 'error', `Unexpected error: ${error}`, startTime, totalUsage);
  }
}

function buildResult(
  config: TestConfig,
  steps: TestStep[],
  result: 'pass' | 'fail' | 'error',
  summary: string,
  startTime: number,
  tokenUsage?: TokenUsage,
): TestResult {
  return {
    scenario: config.scenario,
    startUrl: config.startUrl,
    result,
    summary,
    steps,
    totalDurationMs: Date.now() - startTime,
    screenshotDir: config.screenshotDir,
    model: config.model,
    tokenUsage: tokenUsage && tokenUsage.totalTokens > 0 ? tokenUsage : undefined,
  };
}
