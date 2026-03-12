[![npm](https://img.shields.io/npm/v/testwithwords?style=flat-square)](https://www.npmjs.com/package/testwithwords)
[![license](https://img.shields.io/github/license/instafluff/TestWithWords?style=flat-square)](LICENSE)

# TestWithWords

UI Automation and Testing Using Words

**Write tests in words. The AI runs them in the browser.**

TestWithWords is an AI-powered UI automation and testing tool. You describe test scenarios in plain English, and an AI agent drives a real browser to execute them — clicking, typing, navigating, and verifying results. No selectors. No scripts. No maintenance when the UI changes.

🌐 **[testwithwords.com](https://testwithwords.com)**

## Quick Start

```bash
npm i -g testwithwords
tww auth
tww run "Go to https://example.com and verify the heading says Example Domain"
```

Three commands, under two minutes.

## See It In Action

Write a `.tww` file:

```
# cart.test.tww

describe "Shopping Cart"

  test "can add item to cart"
    Navigate to https://shop.example.com
    Search for "mechanical keyboard"
    Click on the first product
    Click "Add to Cart"
    Verify the cart badge shows "1"
```

Run it:

```bash
$ tww run cart.test.tww

  🧪 TestWithWords v0.1.0
  Chromium (standalone) · LLM: GitHub Models

 PASS  cart.test.tww
  Shopping Cart
    ✓ can add item to cart (8.4s)

 Tests:  1 passed, 0 failed
 Time:   8.4s
 📄 Report: results/report.html
```

The `.tww` file is both the test and its documentation. When the UI changes, the tests still work — the AI adapts to the new layout.

## Why TestWithWords?

- **Natural language tests** — if you can describe it, you can test it
- **No selectors to maintain** — the AI finds elements by understanding the page, not by fragile CSS paths
- **Resilient to UI changes** — when layouts change, the AI adapts instead of breaking
- **Screenshot evidence** — every step is captured for review and reporting
- **Free to start** — works with [GitHub Models](https://github.com/marketplace/models) out of the box
- **Any browser** — Chromium, Firefox, WebKit, or attach to your own Chrome/Edge with sessions intact

## Documentation

| Doc | What's inside |
|-----|--------------|
| [Getting Started Guide](docs/GUIDE.md) | Full walkthrough from install to first passing test |
| [CLI Reference](docs/CLI.md) | Every command and flag with examples |
| [.tww File Format](docs/TWW-FORMAT.md) | How to write test files — `describe`, `test`, hooks, reusable flows |
| [Configuration](docs/CONFIG.md) | `.twwrc.json` settings reference |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Real error messages → real fixes |

Full docs and examples at **[testwithwords.com](https://www.testwithwords.com)**

Useful utilities:
- `tww models` — see what models your current provider exposes
- `tww doctor` — check auth, model, browser, and attach-mode readiness

## How It Works

```
.tww file → Parser → Runner → AI Agent → Browser → Results
                                  ↑
                               LLM API
                        (GitHub / OpenAI / Azure)
```

You write plain English. The parser structures it into suites. The AI agent observes the page via accessibility tree, decides the next action, executes it with Playwright, and repeats until every step passes or fails. Screenshots are captured at every step for *your* review, and results land in a beautiful HTML report.

## Instafluff

TestWithWords is built by [Instafluff](https://twitch.tv/instafluff).

- [Become a sponsor](https://github.com/sponsors/instafluff)
- [Follow me on Twitch](https://twitch.tv/instafluff)

## License

MIT
