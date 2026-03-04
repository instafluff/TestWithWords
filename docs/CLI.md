# CLI Reference

Every command and flag, organized by workflow.

New to TestWithWords? Start with the [Getting Started Guide](GUIDE.md).

---

## Quick Reference

The commands you'll use most often:

| What you want to do | Command |
|---------------------|---------|
| Run a test file | `tww run mytest.tww` |
| Run all tests in a folder | `tww run tests/` |
| Run a quick inline test | `tww run "Verify the homepage loads" --url https://example.com` |
| Test with your logged-in browser | `tww run tests/ --attach` |
| Set up your AI provider | `tww auth` |
| Create a config file | `tww init` |
| Explore a site interactively | `tww interactive` |

---

## Setup Commands

### tww auth

Connect TestWithWords to an AI provider. You only need to do this once.

```bash
tww auth
```

You'll pick from four providers:

| Provider | Setup | Cost |
|----------|-------|------|
| **GitHub Models** | Device flow (like GitHub Copilot) | **Free** with any GitHub account |
| **OpenAI** | Paste your API key | Pay per use |
| **Azure OpenAI** | API key + endpoint + deployment | Pay per use |
| **Custom** | Any OpenAI-compatible API (Ollama, LM Studio, etc.) | Varies |

If you have the GitHub CLI installed (`gh auth token`) or a `GITHUB_TOKEN` environment variable, TWW auto-detects it and offers to use GitHub Models automatically.

#### Flags

| Flag | What it does |
|------|-------------|
| `--status` | Show your current auth status |
| `--logout` | Clear saved credentials |

#### Examples

```bash
# Interactive setup — walk through provider selection
tww auth

# Check what you're connected to
tww auth --status

# Start fresh
tww auth --logout
```

#### GitHub Models — available models

| Model | Best for |
|-------|----------|
| `gpt-4o-mini` | **Default.** Fast, cheap, great for most tests |
| `gpt-4o` | More capable, slower — for complex scenarios |
| `gpt-4.1-mini` | Newer mini model |
| `gpt-4.1-nano` | Smallest, fastest — quick smoke tests |
| `o3-mini` | Reasoning model — for tricky page states |
| `o1-mini` | Reasoning model |

---

### tww init

Create a `.twwrc.json` config file with sensible defaults.

```bash
tww init
```

Generates:

```json
{
  "model": "gpt-4o-mini",
  "timeout": 60000,
  "retries": 0,
  "output": "./results",
  "screenshotEveryStep": true,
  "maxSteps": 25
}
```

If `.twwrc.json` already exists, the command warns you and exits without overwriting.

See [Configuration Reference](CONFIG.md) for every setting you can tweak.

---

## Running Tests

### tww run

Run test scenarios from a `.tww` file, a directory, or an inline string.

```bash
tww run <target> [options]
```

#### Target types

| Target | Example | What happens |
|--------|---------|-------------|
| `.tww` file | `tww run login.test.tww` | Parses and runs all tests in that file |
| Directory | `tww run tests/` | Discovers all `.tww` files and runs them as a suite |
| Inline string | `tww run "Verify the homepage loads"` | Runs a single scenario — quick and easy |

#### All flags

| Flag | Short | Default | What it does |
|------|-------|---------|-------------|
| `--url <url>` | `-u` | — | Starting URL (for inline tests) |
| `--attach [port]` | — | — | Attach to Chrome/Edge via CDP (default port: `9222`) |
| `--browser <name>` | `-b` | `chromium` | Browser engine to use |
| `--headless` | — | `false` | Run without a visible browser window |
| `--model <model>` | `-m` | `gpt-4o-mini` | LLM model to use |
| `--max-steps <n>` | `-s` | `25` | Max AI actions per test before giving up |
| `--no-screenshots` | — | — | Skip screenshots (faster, less disk) |
| `--verbose` | `-v` | `false` | Show every AI action as it happens |
| `--retries <n>` | `-r` | `0` | Retry failed tests n times |
| `--timeout <ms>` | `-t` | `60000` | Per-test timeout in milliseconds |
| `--output <dir>` | `-o` | `./results` | Where screenshots and reports go |
| `--no-tokens` | — | — | Hide token usage from output and reports |

#### Browser names

**Standalone mode** (no `--attach`) — TWW launches its own browser:

| Name | Engine |
|------|--------|
| `chromium` | Playwright Chromium (default) |
| `firefox` | Playwright Firefox |
| `webkit` | Playwright WebKit |

**Attach mode** (`--attach`) — TWW connects to your browser:

| Name | Engine |
|------|--------|
| `chrome` | Google Chrome |
| `edge` | Microsoft Edge |

If you use `--attach` without `--browser`, TWW auto-detects which one you have installed.

#### Common scenarios

**Run a single test file:**
```bash
tww run checkout.test.tww
```

**Run every test in a folder:**
```bash
tww run tests/
```

**Quick inline test against a URL:**
```bash
tww run "Click Sign In and verify the login form appears" --url https://myapp.com
```

**Test with Firefox in headless mode (great for CI):**
```bash
tww run tests/ --browser firefox --headless
```

**Attach to Edge for SSO testing:**
```bash
tww run tests/ --attach --browser edge
```

**Retry flaky tests with a longer timeout:**
```bash
tww run tests/ --retries 2 --timeout 90000
```

**Use a more powerful model for complex tests:**
```bash
tww run tests/ --model gpt-4o
```

**Watch every AI step in real time:**
```bash
tww run tests/ -v
```

**Run in CI with no browser window and no token noise:**
```bash
tww run tests/ --headless --no-tokens
```

---

### tww interactive

Run test scenarios one at a time in an interactive session. Useful for exploring a site or debugging individual steps.

**Alias:** `tww i`

```bash
tww interactive [options]
```

#### Flags

| Flag | Short | Default | What it does |
|------|-------|---------|-------------|
| `--attach [port]` | — | — | Attach to Chrome/Edge via CDP |
| `--browser <name>` | `-b` | `chromium` | Browser engine |
| `--headless` | — | `false` | Run headless |
| `--model <model>` | `-m` | `gpt-4o-mini` | LLM model |
| `--output <dir>` | `-o` | `./results` | Screenshot output directory |

#### How it works

```bash
tww interactive
```

```
  🧪 TestWithWords — Interactive Mode
  ──────────────────────────────
  ✓ Connected to Chromium (standalone)

  Type a test scenario and press Enter to run it.
  Start with a URL: "url:https://example.com" to navigate first.
  Type "quit" or "exit" to stop.

  ▶ url:https://example.com Verify the heading says "Example Domain"
```

Start your input with `url:` to navigate to a page first:

```
▶ url:https://example.com Verify the page has a "More information..." link
```

Just a URL with no scenario? It checks that the page loads:

```
▶ url:https://example.com
```

#### Examples

```bash
# Interactive with your logged-in Edge browser
tww interactive --attach --browser edge

# Interactive in headless mode
tww interactive --headless
```

---

## Utilities

### tww launch

Launch Chrome or Edge with remote debugging enabled so you can attach to it later. Handy when you want to log in manually before running tests.

```bash
tww launch [options]
```

#### Flags

| Flag | Short | Default | What it does |
|------|-------|---------|-------------|
| `--port <port>` | `-p` | `9222` | Remote debugging port |
| `--browser <browser>` | `-b` | auto-detected | `chrome` or `edge` |

#### What it does

1. Closes existing Chrome/Edge windows
2. Relaunches the browser with `--remote-debugging-port` enabled
3. Uses a separate user data directory to avoid conflicts

#### Examples

```bash
# Launch Edge with debugging on default port
tww launch --browser edge

# Launch Chrome on a custom port
tww launch --browser chrome --port 9333

# Then run tests against it
tww run tests/ --attach --port 9333
```

Use `tww launch` + `tww run --attach` when you need to manually log into a site first, then run automated tests against your authenticated session.

---

## Tips & Tricks

- **Config over flags.** If you're repeating the same flags, put them in `.twwrc.json` instead — see [Configuration Reference](CONFIG.md).
- **Verbose for debugging.** When a test fails, `tww run tests/ -v` shows every AI action in real time.
- **Inline for quick checks.** `tww run "..."` runs a single scenario without creating a file.
- **Headless for CI.** Add `--headless` in CI pipelines where there's no display.

See the [Troubleshooting Guide](TROUBLESHOOTING.md) for common errors and fixes.

More at [testwithwords.com](https://testwithwords.com).
