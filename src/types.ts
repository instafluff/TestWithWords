// Types for TestWithWords — page state, tool calls, and test results

/** A single element from the accessibility tree, with a numeric ref for the LLM */
export interface PageElement {
  ref: number;
  role: string;
  name: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  level?: number;
  children?: PageElement[];
  /** Whether this element came from DOM fallback (uses data-tww-ref for locating) */
  fromDOM?: boolean;
}

/** Snapshot of the current page state sent to the LLM */
export interface PageState {
  url: string;
  title: string;
  /** Flattened accessibility tree with refs */
  elements: PageElement[];
  /** Text representation of the a11y tree for the LLM prompt */
  treeText: string;
  /** Path to screenshot file */
  screenshotPath?: string;
  /** Extracted page context: visible text, overlays, errors, structure */
  pageContext: PageContext;
}

/** Extracted context about what's happening on the page */
export interface PageContext {
  /** Visible headings on the page */
  headings: string[];
  /** Main visible text content (trimmed) */
  visibleText: string;
  /** Any overlays, modals, or dialogs detected */
  overlays: OverlayInfo[];
  /** Error messages visible on the page */
  errors: string[];
  /** Form fields and their current state */
  forms: string[];
  /** Meta description or other semantic info */
  meta: string;
}

/** Info about a detected overlay/popup/banner */
export interface OverlayInfo {
  type: 'cookie-banner' | 'modal' | 'popup' | 'banner' | 'dialog';
  text: string;
  hasCloseButton: boolean;
  closeRef?: number;
}

/** A tool call from the LLM — replaces the old fixed AgentAction union */
export interface ToolCall {
  /** Tool name (e.g. 'click', 'fill', 'navigate', 'done') */
  name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

/** Token usage from a single LLM call */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Result from an LLM call — tool call + usage stats */
export interface LLMResult {
  toolCall: ToolCall;
  usage: TokenUsage | null;
}

/** A record of one step in the test execution */
export interface TestStep {
  index: number;
  /** The tool that was called */
  toolCall: ToolCall;
  /** Human-readable description of the action */
  description: string;
  screenshotPath?: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  error?: string;
  /** Token usage for the LLM call that produced this step */
  tokenUsage?: TokenUsage;
}

/** Final test result */
export interface TestResult {
  scenario: string;
  startUrl?: string;
  result: 'pass' | 'fail' | 'error';
  summary: string;
  steps: TestStep[];
  totalDurationMs: number;
  screenshotDir: string;
  /** Model used for this test */
  model?: string;
  /** Aggregated token usage across all steps */
  tokenUsage?: TokenUsage;
}

/** Configuration for a test run */
export interface TestConfig {
  /** The natural language test scenario */
  scenario: string;
  /** Starting URL (optional — LLM can navigate) */
  startUrl?: string;
  /** CDP endpoint to connect to */
  cdpUrl: string;
  /** Maximum number of steps before aborting */
  maxSteps: number;
  /** Directory to save screenshots */
  screenshotDir: string;
  /** LLM model to use */
  model: string;
  /** Whether to take a screenshot after every step */
  screenshotEveryStep: boolean;
  /** Timeout per action in ms */
  actionTimeout: number;
  /** Timeout for entire test in ms (0 = no timeout) */
  testTimeout?: number;
  /** Generate HTML report at the end */
  generateReport: boolean;
  /** Show token usage in output (default true) */
  showTokenUsage?: boolean;
}

export const DEFAULT_CONFIG: Partial<TestConfig> = {
  cdpUrl: 'http://localhost:9222',
  maxSteps: 25,
  screenshotDir: './results',
  model: 'gpt-4o-mini',
  screenshotEveryStep: true,
  actionTimeout: 10000,
  generateReport: true,
};

// ─── .tww Parser Types ───

/** A parsed .tww test file */
export interface TestSuite {
  /** Path to the source .tww file */
  filePath: string;
  /** Default starting URL (from `url` directive) */
  defaultUrl?: string;
  /** Top-level test groups */
  groups: TestGroup[];
}

/** A describe block containing tests and/or nested groups */
export interface TestGroup {
  /** Group name from `describe "name"` */
  name: string;
  /** Source line number of the describe statement */
  line: number;
  /** Steps to run before all tests in this group */
  beforeAll?: string;
  /** Steps to run after all tests in this group */
  afterAll?: string;
  /** Steps to run before each test in this group */
  beforeEach?: string;
  /** Steps to run after each test in this group */
  afterEach?: string;
  /** Test cases in this group */
  tests: TestCase[];
  /** Nested describe groups */
  children: TestGroup[];
}

/** A single test case with its natural language scenario */
export interface TestCase {
  /** Test name from `test "name"` */
  name: string;
  /** The natural language scenario (all body lines concatenated) */
  scenario: string;
  /** Source line number of the test statement */
  line: number;
}

// ─── Runner Result Types ───

/** Result of running a test suite (one .tww file) */
export interface SuiteResult {
  filePath: string;
  groups: GroupResult[];
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  durationMs: number;
  /** Aggregated token usage across all tests in this suite */
  tokenUsage?: TokenUsage;
}

/** Result of running a describe group */
export interface GroupResult {
  name: string;
  tests: TestCaseResult[];
  children: GroupResult[];
  beforeAllError?: string;
  afterAllError?: string;
}

/** Result of running a single test case */
export interface TestCaseResult {
  name: string;
  result: 'pass' | 'fail' | 'error' | 'skip';
  summary: string;
  steps: TestStep[];
  durationMs: number;
  screenshotDir: string;
  /** Model used for this test */
  model?: string;
  /** Aggregated token usage across all steps */
  tokenUsage?: TokenUsage;
}

/** Aggregated result of running multiple .tww files */
export interface RunResult {
  suites: SuiteResult[];
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  durationMs: number;
  /** Aggregated token usage across all suites */
  tokenUsage?: TokenUsage;
}
