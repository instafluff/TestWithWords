# Getting Started Guide

This guide walks you through installing TestWithWords and running your first AI-powered browser test — described in words.

More examples and walkthroughs at [testwithwords.com](https://testwithwords.com).

---

## What You'll Need

Two things:

- **Node.js 18+** — [grab it here](https://nodejs.org/) if you don't have it
- A **GitHub account** (for the free LLM tier) — or an OpenAI/Azure API key

Quick check:

```bash
node --version
# v18.0.0 or higher
```

---

## Step 1: Install

```bash
npm i -g testwithwords
```

This installs the `tww` CLI globally and downloads Chromium via Playwright so you can run tests immediately.

Verify it worked:

```bash
tww --version
# 0.1.1
```

> **What this did:** Installed the TestWithWords CLI (`tww`) and a bundled Chromium browser. No Docker, no additional config needed.

---

## Step 2: Set Up Auth

TestWithWords needs an LLM to understand your test scenarios. Let's hook one up:

```bash
tww auth
```

You'll see:

```
  🔑 TestWithWords — Auth Setup
  ──────────────────────────────

  Choose your LLM provider:

    1) GitHub Models — Free with any GitHub account
    2) OpenAI — Direct OpenAI API
    3) Azure OpenAI — Azure OpenAI Service
    4) Custom — Any OpenAI-compatible API (Ollama, etc.)

  Choice (1-4):
```

### GitHub Models (recommended — free with any GitHub account)

Pick option 1. TWW uses the same GitHub device flow as GitHub Copilot CLI:

1. A code appears in your terminal
2. Your browser opens to `github.com/login/device`
3. Enter the code and approve
4. Done — you're authenticated!

**Pro tip:** If you already have the GitHub CLI (`gh`) installed or a `GITHUB_TOKEN` env var, TWW detects it automatically. Zero extra steps.

### OpenAI

Pick option 2, paste your API key, choose a model (default: `gpt-4o-mini`).

### Azure OpenAI

Pick option 3, provide your API key, endpoint URL, and deployment name.

### Custom (Ollama, LM Studio, etc.)

Pick option 4, provide the base URL and model name. Works with any OpenAI-compatible API.

### Check your auth status anytime

```bash
tww auth --status
```

```
  ✓ Authenticated
    Provider: GitHub Models
    Model:    gpt-4o-mini
```

> **What this did:** Connected TestWithWords to an AI model that reads your test scenarios and decides how to interact with the browser. Your credentials are saved to `~/.testwithwords/config.json` and persist across sessions.

---

## Step 3: Write Your First Test

Create a file called `first.test.tww`:

```tww
url https://www.testwithwords.com

describe "TestWithWords Website"

  test "homepage loads correctly"
    Verify the heading says "Write tests in words"
    Verify there is a Get Started link
```

That's a complete test. Words, not code. The `url` tells the AI where to go, and each line under `test` is a step for the AI to perform.

---

## Step 4: Run It!

```bash
tww run first.test.tww
```

Output:

```
  🧪 TestWithWords v0.1.1
  Chromium (standalone) · LLM: GitHub Models

 PASS  first.test.tww
  TestWithWords Website
    ✓ homepage loads correctly (4.2s)

 Tests:  1 passed, 0 failed
 Time:   4.2s
 📄 Report: results/report.html
```

A Chromium window opens, navigates to `www.testwithwords.com`, reads the page, checks your expectations, and reports back.

> **What this did:** TestWithWords parsed your `.tww` file, launched a browser, and sent each step to the AI. The AI read the page's accessibility tree, determined the right action, executed it via Playwright, and verified the result. Screenshots were captured at every step — open the HTML report for a visual walkthrough.

After successful `tww run` commands, TWW also shows a small sponsor reminder to support the open-source project. If you want clean logs for CI or demos, use `--no-sponsor` or set `"showSponsorMessage": false` in `.twwrc.json`.

---

## Quick Alternatives

### Run an Inline Test (No File Needed)

Don't want to create a file? Just pass your test scenario directly:

```bash
tww run "Go to www.testwithwords.com and verify the heading says Write tests in words"
```

Perfect for one-off checks or when you're just experimenting.

### Interactive Mode (Explore as You Go)

Run scenarios one at a time — great for debugging or exploring a site:

```bash
tww interactive
```

```
  🧪 TestWithWords — Interactive Mode
  ──────────────────────────────
  ✓ Connected to Chromium (standalone)

  Type a test scenario and press Enter to run it.
  Start with a URL: "url:https://www.testwithwords.com" to navigate first.
  Type "quit" or "exit" to stop.

  ▶ url:https://www.testwithwords.com Verify the heading says "Write tests in words"
```

The `url:` prefix navigates to a page first, then runs your scenario.

---

## Understanding the Output

### Terminal

The CLI shows Jest-style results you'll recognize:

| Symbol | Meaning |
|--------|---------|
| **✓** | Test passed |
| **✗** | Test failed (with a reason) |
| **○** | Test skipped |
| **Time** | How long each test took |
| **Tokens** | LLM tokens consumed (hide with `--no-tokens`) |

### HTML Report

Open `results/report.html` in your browser for the full story:

- Pass/fail status for every test
- Collapsible step-by-step flow showing every AI action
- Screenshots at each step in a lightbox viewer
- Token usage breakdown per step, test, and suite
- Model and provider info

**Pro tip:** The HTML report is great for sharing with your team — it's a single self-contained file.

---

## Testing Sites That Need Login (Attach Mode)

If your app requires login, SSO, or has cookies you need to preserve, attach mode is your friend:

```bash
tww run tests/ --attach
```

Here's what happens — TWW connects to your Chrome or Edge browser (auto-detected):

1. Closes your existing browser windows
2. Relaunches the browser with remote debugging enabled
3. Connects and runs tests **with all your sessions intact**

You can pick which browser:

```bash
tww run tests/ --attach --browser edge
tww run tests/ --attach --browser chrome
```

Or launch the browser separately first:

```bash
tww launch --browser edge
# Then in another terminal:
tww run tests/ --attach
```

> **What this did:** Attach mode reuses your real browser profile — cookies, sessions, saved passwords. This lets you test apps behind SSO or corporate auth without building login automation. The AI sees exactly what you would see in that browser.

---

## Set Up a Config File

As your test suite grows, you'll want shared defaults. Create a `.twwrc.json`:

```bash
tww init
```

This creates:

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

CLI flags always override config file values. See the [Configuration Reference](CONFIG.md) for all options.

---

## Run a Whole Directory

Put all your `.tww` files in a folder and run the whole suite:

```bash
tww run tests/
```

TWW discovers all `.tww` files in that folder and runs them as a suite.

---

## What's Next?

Here's where to go next:

| Want to... | Read... |
|-----------|---------|
| Learn every CLI command and flag | [CLI Reference](CLI.md) |
| Master the `.tww` file format | [.tww File Format](TWW-FORMAT.md) |
| Customize your project config | [Configuration](CONFIG.md) |
| Fix something that's not working | [Troubleshooting](TROUBLESHOOTING.md) |

More examples, patterns, and guides at [testwithwords.com](https://testwithwords.com).
