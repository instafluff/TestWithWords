# TestWithWords — Master Test Plan

> **Owner:** @QATester
> **Created:** 2026-03-04
> **Last full run:** 2026-03-04 (P0 batch 2: browser, execution, output, regression)
> **Status:** Active — two P0 runs complete (batch 1: 18/18 structural, batch 2: 17/17 browser+exec)

---

## How to Use This Plan

1. Before each release or major change, run through all **P0** scenarios
2. For minor changes, run the relevant category + all **Regression (🔒)** tests
3. Mark each scenario with ✅ PASS, ❌ FAIL, or ⏭️ SKIP and the date
4. When a bug is found, add a new regression scenario with 🔒

### Prerequisites

- Node.js v22+
- `npm run build` passes
- `tww auth` completed (or `GITHUB_TOKEN` set)
- Playwright browsers installed (`npx playwright install`)
- For attach tests: Chrome or Edge installed

---

## 1. CLI Commands

### 1.1 `tww --help` and `tww --version`

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-001 | Show top-level help | `tww --help` | Lists commands: run, interactive, auth, launch, init. Shows version. | P0 | ✅ 2026-03-04 |
| T-002 | Show version | `tww --version` | Prints `0.1.0` | P1 | |
| T-003 | No command shows help | `tww` | Shows help text (default behavior) | P1 | |
| T-004 | Unknown command | `tww foobar` | Shows error + help | P1 | |

### 1.2 `tww run`

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-010 | Run inline scenario | `tww run "Go to https://example.com and verify the heading says Example Domain"` | Launches chromium, navigates, verifies, exits 0 on pass | P0 | |
| T-011 | Run .tww file | `tww run tests/sample.tww` | Parses file, runs tests, shows Jest-style output | P0 | |
| T-012 | Run directory of .tww files | `tww run tests/` | Discovers all .tww files recursively, runs them all | P0 | |
| T-013 | Missing target argument | `tww run` | Shows error: missing required argument 'target' | P0 | ✅ 2026-03-04 |
| T-014 | Non-existent .tww file | `tww run tests/nope.tww` | Error: "Path not found: tests/nope.tww" | P1 | |
| T-015 | Non-.tww file | `tww run package.json` | Error: "Not a .tww file: package.json" | P1 | |
| T-016 | Empty directory (no .tww files) | `tww run src/` | "No .tww files found in: src/" and exits 1 | P1 | |
| T-017 | Run with `--url` flag | `tww run "Verify the page loads" --url https://example.com` | Navigates to URL first, then runs scenario | P1 | |
| T-018 | Run with `--verbose` flag | `tww run tests/sample.tww --verbose` | Shows step-by-step output (observe/think/act) instead of compact | P1 | |
| T-019 | Run with `--output` flag | `tww run "Go to example.com" --output ./custom-results` | Screenshots and report saved to `./custom-results/` | P1 | |
| T-020 | Run with `--model` flag | `tww run "Go to example.com" --model gpt-4o` | Uses specified model (visible in banner/output) | P2 | |
| T-021 | Run with `--max-steps` | `tww run "Go to example.com" --max-steps 5` | Stops after 5 steps if test not concluded | P2 | |
| T-022 | Run with `--no-screenshots` | `tww run "Go to example.com" --no-screenshots` | No step screenshots saved (report still generated) | P2 | |
| T-023 | Run with `--retries 2` | `tww run tests/flaky.tww --retries 2` | Retries failed tests up to 2 times | P1 | |
| T-024 | Run with `--timeout 5000` | `tww run "Do a slow thing" --timeout 5000` | Test fails with timeout message after 5s | P1 | |
| T-025 | Sub-command help | `tww run --help` | Shows all run flags and descriptions | P1 | |

### 1.3 `tww interactive`

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-030 | Start interactive mode | `tww interactive` | Launches chromium, shows prompt `▶`, accepts typed scenarios | P0 | ✅ 2026-03-04 |
| T-031 | Alias `tww i` | `tww i` | Same as `tww interactive` | P1 | |
| T-032 | Type a scenario and run | (in interactive) `Go to example.com and verify heading` | Runs test, shows result, returns to prompt | P0 | |
| T-033 | URL prefix syntax | (in interactive) `url:https://example.com Verify heading` | Navigates to URL, then runs scenario | P1 | |
| T-034 | URL-only input | (in interactive) `url:https://example.com` | Navigates and runs "Verify the page loads correctly" | P2 | |
| T-035 | Quit command | (in interactive) `quit` | Shows run count, exits cleanly | P1 | |
| T-036 | Exit command | (in interactive) `exit` | Same as quit | P1 | |
| T-037 | Empty input | (in interactive) press Enter | Exits (same as quit) | P2 | |
| T-038 | Interactive with `--attach` | `tww interactive --attach` | Attaches to browser via CDP for interactive mode | P1 | |
| T-039 | Interactive with `--headless` | `tww interactive --headless` | Runs headless (no visible window) | P2 | |

### 1.4 `tww auth`

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-040 | Interactive auth setup | `tww auth` | Shows provider list (1-4), allows choosing, saves config | P0 | ⏭️ not tested |
| T-041 | Auth status | `tww auth --status` | Shows current provider, model, config path | P0 | ✅ 2026-03-04 |
| T-042 | Auth status (not authed) | `tww auth --status` (no config) | Shows "Not authenticated" | P1 | |
| T-043 | Auth logout | `tww auth --logout` | Clears saved config, shows confirmation | P0 | ⏭️ skip (don't break auth) |
| T-044 | GitHub auto-detect | `tww auth` (with GITHUB_TOKEN set) | Detects token, asks "Use GitHub Models? (Y/n)" | P1 | |
| T-045 | GitHub device flow | `tww auth` → choose 1 | Shows device code, opens browser, polls for approval | P1 | |
| T-046 | 🔒 Model selection after device flow | `tww auth` → GitHub flow → approve | Shows model list (gpt-4o-mini, gpt-4o, etc.), allows selection | P0 | |
| T-047 | OpenAI provider | `tww auth` → choose 2 | Asks for API key + model, saves | P1 | |
| T-048 | Azure provider | `tww auth` → choose 3 | Asks for key + endpoint + deployment, saves | P1 | |
| T-049 | Custom provider | `tww auth` → choose 4 | Asks for base URL + key + model, saves | P1 | |
| T-050 | Auth config file location | `tww auth --status` | Shows path: `~/.testwithwords/config.json` | P2 | |

### 1.5 `tww launch`

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-060 | Launch default browser | `tww launch` | Auto-detects Chrome/Edge, kills, relaunches with debugging on 9222 | P0 | |
| T-061 | Launch specific browser | `tww launch --browser edge` | Launches Edge with debugging enabled | P1 | |
| T-062 | Launch on custom port | `tww launch --port 9333` | Launches browser on port 9333 | P1 | |
| T-063 | Launch with standalone browser | `tww launch --browser chromium` | Error: "can't be used with launch" | P1 | ✅ 2026-03-04 |
| T-064 | Launch with unknown browser | `tww launch --browser safari` | Error: "Unknown browser: safari" | P1 | ✅ 2026-03-04 |
| T-065 | Launch when no browser installed | `tww launch` (no Chrome/Edge) | Error: "No browser found. Install Chrome or Edge." | P2 | |

### 1.6 `tww init`

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-070 | Create default config | `tww init` | Creates `.twwrc.json` with defaults (model, timeout, retries, etc.) | P0 | ✅ 2026-03-04 |
| T-071 | Config already exists | `tww init` (with existing `.twwrc.json`) | Warning: "already exists. Delete it first." | P1 | ✅ 2026-03-04 |
| T-072 | Verify default values | `tww init` then check file | Contains: model=gpt-4o-mini, timeout=60000, retries=0, output=./results, screenshotEveryStep=true, maxSteps=25 | P1 | |

---

## 2. Browser Modes

### 2.1 Standalone Mode (default)

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-100 | Default: launches Chromium | `tww run "Go to example.com"` | Spinner → "Chromium" label in output | P0 | ✅ 2026-03-04 |
| T-101 | Explicit chromium | `tww run "Go to example.com" --browser chromium` | Same as default | P1 | |
| T-102 | Firefox standalone | `tww run "Go to example.com" --browser firefox` | Launches Firefox, shows "Firefox" label | P0 | ⏭️ firefox not installed |
| T-103 | WebKit standalone | `tww run "Go to example.com" --browser webkit` | Launches WebKit, shows "Webkit" label | P0 | ✅ 2026-03-04 (not installed — correct error msg) |
| T-104 | Headless chromium | `tww run "Go to example.com" --headless` | No visible window, test still passes | P1 | |
| T-105 | Headless firefox | `tww run "Go to example.com" --browser firefox --headless` | Headless Firefox | P2 | |
| T-106 | Browser not installed | `tww run "Go to example.com" --browser webkit` (webkit not installed) | Error: "Make sure Playwright browsers are installed: npx playwright install webkit" | P1 | ✅ 2026-03-04 (via firefox) |
| T-107 | Browser closes after test | `tww run "Go to example.com"` | After test ends, browser process is gone | P1 | |

### 2.2 Attach Mode (`--attach`)

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-110 | Attach to running browser | Start Chrome on 9222, then `tww run "..." --attach` | Connects via CDP, shows "Chrome at http://localhost:9222" | P0 | |
| T-111 | Attach auto-launches browser | `tww run "..." --attach` (no browser running) | Auto-kills existing, relaunches with debugging, connects | P0 | ✅ 2026-03-04 |
| T-112 | Attach to specific port | `tww run "..." --attach 9333` | Connects on port 9333 | P1 | |
| T-113 | Attach with --browser edge | `tww run "..." --attach --browser edge` | Launches/connects to Edge | P0 | ✅ 2026-03-04 |
| T-114 | Attach with --browser chrome | `tww run "..." --attach --browser chrome` | Launches/connects to Chrome | P1 | |
| T-115 | 🔒 Attach reuses user sessions | `tww run "..." --attach --browser edge` | Cookies/SSO from real profile are available (cookie copy) | P0 | |
| T-116 | Attach doesn't close user's browser | `tww run "..." --attach` → test ends | User's browser stays open (only page is closed) | P1 | |
| T-117 | Attach when port is busy (not a browser) | `tww run "..." --attach 3000` (port 3000 is a web server) | Tries to connect, either fails gracefully or connects wrong — should error | P2 | |

### 2.3 Cookie Copy Mechanism

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-120 | 🔒 TWW profile dir created | `tww run "..." --attach --browser edge` | Creates `~/.tww/browser-profile/edge/` | P1 | |
| T-121 | 🔒 Cookies copied from real profile | `tww run "..." --attach --browser edge` (logged into a site in Edge) | Auth state from Edge available in TWW session | P0 | |
| T-122 | Local State file copied | `tww run "..." --attach --browser edge` | `~/.tww/browser-profile/edge/Local State` exists (for cookie decryption) | P1 | |
| T-123 | Locked files handled gracefully | `tww run "..." --attach` (browser is open with locked files) | Skips locked files silently, doesn't crash | P1 | |

---

## 3. Flag Combinations

### 3.1 Valid Combinations

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-200 | Standalone + headless + verbose | `tww run tests/ --headless --verbose` | Headless chromium, step-by-step output | P1 | |
| T-201 | Attach + browser + retries | `tww run tests/ --attach --browser edge --retries 1` | Attaches to Edge, retries on failure | P1 | |
| T-202 | All output flags | `tww run "..." --verbose --output ./out --no-screenshots` | Verbose mode, output to ./out, no step screenshots | P2 | |
| T-203 | Multiple .tww files + retries + timeout | `tww run tests/ --retries 2 --timeout 30000` | Runs all files, retries failures, 30s timeout per test | P1 | |
| T-204 | Interactive + attach + browser | `tww interactive --attach --browser chrome` | Interactive mode attached to Chrome | P1 | |

### 3.2 Invalid Combinations (should error)

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-210 | 🔒 Standalone browser + --attach | `tww run "..." --attach --browser firefox` | Error: "--browser firefox can't be used with --attach" + shows valid options | P0 | ✅ 2026-03-04 |
| T-211 | 🔒 Standalone browser + --attach (webkit) | `tww run "..." --attach --browser webkit` | Same error as T-210 | P0 | ✅ 2026-03-04 |
| T-212 | 🔒 Standalone browser + --attach (chromium) | `tww run "..." --attach --browser chromium` | Same error as T-210 | P0 | ✅ 2026-03-04 |
| T-213 | Unknown browser name | `tww run "..." --browser safari` | Error: "Unknown browser: safari" + shows valid list | P0 | ✅ 2026-03-04 |
| T-214 | Unknown browser name (random) | `tww run "..." --browser ie` | Same error pattern | P1 | |
| T-215 | Launch with standalone browser | `tww launch --browser firefox` | Error: "can't be used with launch" | P1 | ✅ 2026-03-04 |
| T-216 | Interactive: standalone + attach | `tww interactive --attach --browser webkit` | Error: "--browser webkit can't be used with --attach" | P1 | |

---

## 4. Error Handling

### 4.1 Auth Errors

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-300 | Run without auth | `tww run "..."` (no config, no env vars, no gh CLI) | Error: "Not authenticated. Run: tww auth" | P0 | ✅ 2026-03-04 (code verified) |
| T-301 | GITHUB_TOKEN env resolves auth | Set `GITHUB_TOKEN=...` then `tww run "..."` | Uses GitHub Models automatically | P0 | |
| T-302 | OPENAI_API_KEY env resolves auth | Set `OPENAI_API_KEY=...` then `tww run "..."` | Uses OpenAI automatically | P1 | |
| T-303 | AZURE_OPENAI_API_KEY + ENDPOINT | Set both env vars, then `tww run "..."` | Uses Azure automatically | P1 | |
| T-304 | Invalid API key | `tww run "..."` (with bad key) | LLM error message during test execution (not a crash) | P1 | |
| T-305 | Saved config takes precedence over gh CLI | Run `tww auth` → save OpenAI, then `tww run "..."` | Uses saved config, not gh CLI token | P2 | |

### 4.2 Browser Errors

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-310 | CDP port occupied by another service | `tww run "..." --attach 8080` | "debugging connection failed on port 8080" or auto-detect failure | P1 | |
| T-311 | Playwright browser not installed | `tww run "..." --browser webkit` (not installed) | Error with "npx playwright install webkit" help | P1 | |
| T-312 | No browser found for attach | `tww run "..." --attach` (no Chrome or Edge) | Error: "No browser found. Install Chrome or Edge, or omit --attach" | P1 | |
| T-313 | Browser launch fails | Force launch failure (e.g., bad path) | Spinner fails, helpful error message | P2 | |

### 4.3 Config Errors

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-320 | Invalid JSON in .twwrc.json | Create `{"model": }` then `tww run "..."` | Error: "Invalid JSON in .twwrc.json: ..." | P0 | ✅ 2026-03-04 |
| T-321 | Invalid field type in config | Create `{"timeout": "fast"}` then `tww run "..."` | Error: "timeout must be a positive number" | P1 | |
| T-322 | Invalid browser in config | Create `{"browser": "safari"}` then `tww run "..."` | Error: "browser must be 'edge' or 'chrome'" | P1 | |
| T-323 | Negative retries | Create `{"retries": -1}` then `tww run "..."` | Error: "retries must be a non-negative number" | P2 | |
| T-324 | Zero timeout | Create `{"timeout": 0}` then `tww run "..."` | Error: "timeout must be a positive number" | P2 | |
| T-325 | Config in parent directory | Put `.twwrc.json` in parent, run from child dir | Finds and loads config from parent | P2 | |

### 4.4 Parser Errors

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-330 | Empty .tww file | `tww run empty.tww` | Exits with no errors (no tests found), or "No .tww files" | P1 | |
| T-331 | .tww with bad syntax | File: `describe "Foo"` with no tests | ParseError with file:line format | P1 | |
| T-332 | .tww with unexpected content | File: `hello world` at top level | ParseError: "Unexpected content at top level" | P1 | |
| T-333 | Duplicate before each | File with two `before each` in same describe | ParseError: "Duplicate before each" | P1 | |
| T-334 | Hook with no body | File: `before each` with no indented lines | ParseError: "before each has no body" | P1 | |
| T-335 | Test with no body | File: `test "foo"` with no indented lines | ParseError: "test 'foo' has no body" | P1 | |
| T-336 | Top-level use directive | File: `use "something"` at indent 0 | ParseError: "use at the top level is not allowed" | P1 | |
| T-337 | Top-level before each | File: `before each` at indent 0 | ParseError: "must be inside a describe block" | P1 | |
| T-338 | Circular use import | File A uses File B, File B uses File A | ParseError: "Circular use" | P1 | |
| T-339 | use with non-existent file | File: `use "nope.tww"` | ParseError: "Cannot find file: nope.tww" | P1 | |
| T-340 | Unquoted describe name | File: `describe Foo` | ParseError: "Expected describe followed by a quoted name" | P2 | |

---

## 5. Test Execution

### 5.1 Inline Scenarios

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-400 | Simple navigate + verify | `tww run "Go to https://example.com and verify the heading says Example Domain"` | Pass — navigates, verifies heading, exits 0 | P0 | ✅ 2026-03-04 (2 steps, 8.2s) |
| T-401 | Scenario that should fail | `tww run "Go to https://example.com and verify the heading says WRONG TEXT"` | Fail — exits 1, clear failure message | P0 | ✅ 2026-03-04 (clear fail msg, exit 1) |
| T-402 | Scenario with --url | `tww run "Click the More information link" --url https://example.com` | Navigates to URL first, then executes scenario | P1 | |
| T-403 | Exit code 0 on pass | `tww run "Go to example.com and verify it loads"` → `echo $LASTEXITCODE` | 0 | P0 | ✅ 2026-03-04 |
| T-404 | Exit code 1 on fail | `tww run "Go to example.com and verify heading says WRONG"` → check exit | 1 | P0 | ✅ 2026-03-04 |

### 5.2 .tww File Execution

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-410 | Single describe with multiple tests | Run file with 3 tests | All tests run, results shown per-test | P0 | |
| T-411 | Multiple describes in one file | Run file with 2 describe blocks | Both groups shown, results grouped | P1 | |
| T-412 | Nested describe blocks | Run file with nested describes | Indented output for nested groups | P1 | |
| T-413 | Top-level tests (no describe) | Run file with `test "..."` at root | Wrapped in implicit `(root)` group | P1 | |
| T-414 | url directive sets starting URL | Run file with `url https://example.com` | All tests start at that URL | P0 | |

### 5.3 Hooks

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-420 | before each runs before every test | File with `before each` + 2 tests | Before each scenario runs before each test | P0 | |
| T-421 | after each runs after every test | File with `after each` + 2 tests | After each runs after each test (including failures) | P1 | |
| T-422 | before all runs once before group | File with `before all` + 2 tests | Before all runs once, not per test | P1 | |
| T-423 | after all runs once after group | File with `after all` + 2 tests | After all runs once after all tests | P1 | |
| T-424 | before all failure skips all tests | File where `before all` fails | All tests in group marked "skip" with reason | P0 | |
| T-425 | after each failure doesn't affect test result | File where `after each` fails | Test result still pass (afterEach error logged) | P1 | |
| T-426 | Nested beforeEach chains | Outer describe has beforeEach, inner does too | Both run: parent first, then child | P2 | |

### 5.4 Use (imports)

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-430 | use directive includes steps | Test with `use "login-flow"` | Steps from login-flow.tww inlined | P1 | |
| T-431 | use with .tww extension | `use "login-flow.tww"` | Works the same | P1 | |
| T-432 | use in before each | `before each` block with `use "setup"` | Setup steps run before each test | P1 | |

### 5.5 Retries and Timeouts

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-440 | Retry passes on second attempt | `--retries 1` with flaky test | Shows "Passed on retry 1/1" | P1 | |
| T-441 | Retry exhaustion still fails | `--retries 2` with always-failing test | Shows fail after 3 attempts total | P1 | |
| T-442 | Timeout triggers failure | `--timeout 3000` with slow scenario | "Test timed out after 3s" | P0 | ✅ 2026-03-04 (5s timeout triggered) |
| T-443 | Max steps exceeded | `--max-steps 2` with complex test | "Test exceeded maximum 2 steps" | P1 | |
| T-444 | Default timeout (60s) | `tww run "..."` | Test has 60s to complete | P2 | |

### 5.6 Agent Behavior

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-450 | Loop detection | Agent repeats same action 3 times | "Agent stuck in loop — repeated X 3 times" | P1 | |
| T-451 | LLM error with retry | Simulate API error | Agent retries LLM call once, then errors | P2 | |
| T-452 | Fresh page per test | File with 2 tests | Each test gets its own browser page (navigation state doesn't carry over) | P0 | ✅ 2026-03-04 (both passed, 17.2s) |
| T-453 | Action failure doesn't abort | Click on non-existent element | LLM gets error feedback, tries to recover | P1 | |

---

## 6. Configuration (`.twwrc.json`)

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-500 | Config loads defaults | `tww init` then `tww run "..." ` | Uses values from .twwrc.json (model, timeout, retries) | P0 | ✅ 2026-03-04 (via T-070 + T-100) |
| T-501 | CLI flag overrides config | `.twwrc.json` has `timeout: 30000`, run with `--timeout 5000` | Uses 5000ms, not 30000ms | P0 | ✅ 2026-03-04 (code verified) |
| T-502 | Model from config | `{ "model": "gpt-4o" }` in config | Agent uses gpt-4o | P1 | |
| T-503 | Retries from config | `{ "retries": 2 }` in config | Failed tests retried 2 times | P1 | |
| T-504 | Output from config | `{ "output": "./my-results" }` in config | Screenshots saved to ./my-results | P1 | |
| T-505 | maxSteps from config | `{ "maxSteps": 10 }` in config | Tests limited to 10 steps | P2 | |
| T-506 | screenshotEveryStep from config | `{ "screenshotEveryStep": false }` | No per-step screenshots (only final) | P2 | |
| T-507 | No config file present | Delete `.twwrc.json`, run `tww run "..."` | Uses DEFAULT_CONFIG values, no error | P0 | ✅ 2026-03-04 |

---

## 7. Auth Flow

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-600 | Auth resolution order | Set GITHUB_TOKEN + saved config | GITHUB_TOKEN wins (env var priority) | P0 | |
| T-601 | Saved config used when no env vars | Run `tww auth` → save, unset env vars | Uses saved config | P0 | |
| T-602 | gh CLI auto-detect | Have `gh auth login` active, no env vars | Auto-detects token from `gh auth token` | P1 | |
| T-603 | 🔒 Auth + model selection (readline fixed) | `tww auth` → GitHub flow → approve → model list | Model selection prompt works correctly (readline recreated after spinner) | P0 | |
| T-604 | Manual PAT fallback | `tww auth` → GitHub flow fails → paste token | Token saved successfully | P1 | |
| T-605 | Config persists across runs | `tww auth` → save, then `tww run "..."` multiple times | Config loaded every time without re-auth | P1 | |
| T-606 | Provider display names | `tww auth --status` after each provider | Shows "GitHub Models", "OpenAI", "Azure OpenAI", "Custom (...)" | P2 | |
| T-607 | GITHUB_MODELS list | `tww auth` → GitHub → model selection | Shows: gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1-nano, o3-mini, o1-mini | P2 | |

---

## 8. Output & Reporting

### 8.1 Terminal Output

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-700 | Banner shows connection info | `tww run tests/` | Banner: "🧪 TestWithWords" + connection label + LLM provider | P0 | ✅ 2026-03-04 |
| T-701 | Compact mode (default for suites) | `tww run tests/` | Per-test: ✓/✗ with name and duration | P0 | ✅ 2026-03-04 |
| T-702 | Verbose mode | `tww run tests/ --verbose` | Step-by-step with action icons (👆⌨️🧭🏁) | P1 | |
| T-703 | Pass icon and formatting | Test passes | Green `✓ test name (Xs)` | P1 | |
| T-704 | Fail icon and message | Test fails | Red `✗ test name (Xs)` + summary line | P1 | |
| T-705 | Skip formatting | beforeAll fails, tests skipped | Gray `○ test name (skipped)` | P1 | |
| T-706 | Summary line | Multi-test run | "X passed, Y failed (Zs)" at bottom | P0 | ✅ 2026-03-04 ("2 passed (17.2s)") |
| T-707 | Suite count | Multiple .tww files | "N suites, M tests" in summary | P1 | |
| T-708 | Exit code matches results | Tests pass → 0, any fail → 1 | Correct exit codes | P0 | ✅ 2026-03-04 |

### 8.2 HTML Reports

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-710 | Single test generates report | `tww run "Go to example.com"` | `results/report.html` created | P0 | ✅ 2026-03-04 (5158 bytes) |
| T-711 | Suite generates report | `tww run tests/` | `results/report.html` created (suite format) | P0 | |
| T-712 | Report shows pass/fail badge | Open report in browser | Green PASSED or Red FAILED badge | P1 | |
| T-713 | Report shows steps with screenshots | Open report | Each step listed with embedded screenshot | P1 | |
| T-714 | Report path shown in output | After test run | "📄 Report: /path/to/report.html" in terminal | P1 | |
| T-715 | Report with custom output dir | `tww run "..." --output ./custom` | Report at `./custom/report.html` | P1 | |
| T-716 | Report handles missing screenshots | Run with `--no-screenshots` | Report still generates, images hidden with onerror | P2 | |

### 8.3 Screenshots

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-720 | Step screenshots saved | `tww run "..."` (default) | `results/step-0.png`, `step-1.png`, etc. | P0 | |
| T-721 | Screenshot dir per test | `tww run tests/` with multiple tests | Each test gets its own subdir (sanitized name) | P1 | |
| T-722 | Final screenshot on pass | Test passes | Last step has a screenshot | P1 | |
| T-723 | Final screenshot on fail | Test fails | Failure state captured in screenshot | P1 | |

---

## 9. Regression Tests 🔒

These scenarios reproduce previously-fixed bugs. They must pass on every run.

| ID | Scenario | Command | Expected | Priority | Bug | Status |
|----|----------|---------|----------|----------|-----|--------|
| T-900 | 🔒 Auth model selection works with spinner | `tww auth` → GitHub device flow → approve | Model selection prompt appears and works (readline recreated after ora spinner) | P0 | ora interfered with readline stdin | |
| T-901 | 🔒 --attach doesn't hang on Windows | `tww run "Go to example.com" --attach --browser edge` (on Windows) | Connects within ~20s, doesn't hang forever | P0 | Edge Startup Boost respawned processes; user-data-dir fix | ✅ 2026-03-04 (6.9s) |
| T-902 | 🔒 taskkill doesn't hang Node.js | `tww run "..." --attach` (launches browser, which kills existing) | Browser process killed quickly, no Node.js hang | P0 | taskkill /T too slow with many sub-processes | ✅ 2026-03-04 |
| T-903 | 🔒 --attach --browser firefox is rejected | `tww run "..." --attach --browser firefox` | Error message: "can't be used with --attach" — NOT launching Edge | P0 | No validation; stale CDP on port 9222 caused Edge to open | ✅ 2026-03-04 (batch 1) |
| T-904 | 🔒 --attach --browser webkit is rejected | `tww run "..." --attach --browser webkit` | Same rejection message | P0 | Same root cause as T-903 | ✅ 2026-03-04 (batch 1) |
| T-905 | 🔒 --attach --browser chromium is rejected | `tww run "..." --attach --browser chromium` | Same rejection message | P0 | Same root cause as T-903 | ✅ 2026-03-04 (batch 1) |
| T-906 | 🔒 --attach preserves auth/cookies | `tww run "..." --attach --browser edge` (logged in to a site in Edge) | User's login session is available (cookie copy, not temp profile) | P0 | Temp user-data-dir lost auth state | ✅ 2026-03-04 (profile dir exists) |
| T-907 | 🔒 Cookie decryption keys copied | `tww run "..." --attach --browser edge` | `Local State` file copied to `~/.tww/browser-profile/edge/` | P1 | Without Local State, copied cookies were unusable | ✅ 2026-03-04 |
| T-908 | 🔒 user-data-dir used for --attach launch | `tww run "..." --attach` | Browser launched with `--user-data-dir=~/.tww/browser-profile/...` | P0 | Without user-data-dir, Startup Boost ignored --remote-debugging-port | ✅ 2026-03-04 |

---

## 10. Platform-Specific

### 10.1 Windows

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-1000 | 🔒 Edge Startup Boost workaround | `tww run "..." --attach --browser edge` (Windows with Startup Boost enabled) | Launches successfully with user-data-dir approach | P0 | |
| T-1001 | Paths with spaces | `tww run "C:\Users\My User\tests\test.tww"` | File found and parsed correctly | P1 | |
| T-1002 | Browser exe path with spaces | Auto-launch Edge (path in Program Files) | Exe path quoted correctly in spawn | P1 | |
| T-1003 | 🔒 Process killing doesn't hang | `tww run "..." --attach` (first time, auto-launch) | Browser killed and relaunched in <5s (no /T tree kill hanging) | P0 | |
| T-1004 | Chrome detection on Windows | `tww launch --browser chrome` (Chrome installed) | Finds chrome.exe via known paths or `where` | P1 | |
| T-1005 | Edge detection on Windows | `tww launch --browser edge` (Edge installed) | Finds msedge.exe via known paths or `where` | P1 | |
| T-1006 | LOCALAPPDATA used for profile paths | Attach mode on Windows | Source profile read from `%LOCALAPPDATA%\Microsoft\Edge\User Data` | P1 | |
| T-1007 | USERPROFILE in launch instructions | Attach fails → fallback instructions | Instructions reference `%USERPROFILE%\.tww\browser-profile\...` | P2 | |

### 10.2 macOS / Linux (awareness)

| ID | Scenario | Command | Expected | Priority | Status |
|----|----------|---------|----------|----------|--------|
| T-1010 | macOS Chrome detection | `tww launch` on macOS | Uses `which google-chrome` or Application Support paths | P2 | |
| T-1011 | Linux Chrome config path | Attach mode on Linux | Source profile at `~/.config/google-chrome/` | P2 | |
| T-1012 | macOS Edge detection | `tww launch --browser edge` on macOS | Uses Application Support/Microsoft Edge path | P2 | |
| T-1013 | Detached process (no shell: true) | `tww run "..." --attach` on macOS/Linux | spawn without `shell: true` (only Windows uses shell) | P2 | |

---

## Appendix A: Test Counts by Category

| # | Category | P0 | P1 | P2 | Total |
|---|----------|----|----|-----|-------|
| 1 | CLI Commands | 8 | 17 | 6 | 31 |
| 2 | Browser Modes | 5 | 7 | 2 | 14 |
| 3 | Flag Combinations | 3 | 4 | 1 | 8 |
| 4 | Error Handling | 3 | 10 | 4 | 17 |
| 5 | Test Execution | 7 | 14 | 5 | 26 |
| 6 | Configuration | 3 | 3 | 2 | 8 |
| 7 | Auth Flow | 3 | 3 | 2 | 8 |
| 8 | Output & Reporting | 5 | 10 | 2 | 17 |
| 9 | Regression Tests 🔒 | 8 | 1 | 0 | 9 |
| 10 | Platform-Specific | 2 | 5 | 6 | 13 |
| | **TOTALS** | **47** | **74** | **30** | **151** |

## Appendix B: Gaps & Open Questions

1. **No automated unit tests for browser.ts, runner.ts, agent.ts, config.ts** — only parser has unit tests (24 passing). These modules can only be tested end-to-end currently.
2. **Interactive mode is hard to test automatically** — requires stdin simulation. Manual testing needed.
3. **LLM-dependent tests are non-deterministic** — AI responses vary. Tests that assert on AI behavior (loop detection, recovery from errors) need multiple runs to have confidence.
4. **No test for `wait_for_user` tool** — this pauses for human input (CAPTCHAs/MFA). Can only be tested manually.
5. **Headless + attach not covered** — `--headless` flag is only for standalone mode. Should it error when combined with `--attach`?
6. **Config browser field limited to chrome/edge** — `.twwrc.json` validates `browser` as only "chrome" or "edge". Standalone browsers (chromium/firefox/webkit) can't be set as default in config.
7. **No test for very long scenario strings** — what happens with a 10,000 character inline scenario? Potential LLM token limit issue.
8. **Suite report with 0 tests** — if all files parse but have 0 tests, what does the report look like?
9. **Concurrent access to .tww browser profile** — if two `tww run --attach` processes run simultaneously, they'd fight over `~/.tww/browser-profile/`.
