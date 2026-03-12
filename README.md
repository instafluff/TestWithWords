[![npm](https://img.shields.io/npm/v/testwithwords?style=flat-square)](https://www.npmjs.com/package/testwithwords)
[![license](https://img.shields.io/github/license/instafluff/TestWithWords?style=flat-square)](LICENSE)

# TestWithWords

**Write tests in words. The AI runs them in the browser.**

Turn plain-English test ideas into real browser runs, real screenshots, and real confidence.

🌐 **[testwithwords.com](https://testwithwords.com)**

<!-- TODO: Replace with real demo GIF -->
> 🎬 *Demo coming soon — imagine watching an AI drive your browser from just words!*

TestWithWords is an AI-powered UI testing tool that feels a little bit like magic the first time you use it.
You describe what should happen. The AI opens a real browser, clicks around, fills things in, verifies results, and gives you a report with screenshots.
No brittle selectors. No giant Playwright file. No "welp, the button moved so the whole suite exploded."

## Quick Start

```bash
npm i -g testwithwords
tww auth
tww run "Go to www.testwithwords.com and verify the heading says Write tests in words"
```

That's the whole hello-world.

Then peek inside the packaged `examples/` folder and try files like `examples/basic.test.tww`, `examples/form.test.tww`, and `examples/full-suite.test.tww`.

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

  🧪 TestWithWords v0.1.5
  Chromium (standalone) · LLM: GitHub Models

 PASS  cart.test.tww
  Shopping Cart
    ✓ can add item to cart (8.4s)

 Tests:  1 passed, 0 failed
 Time:   8.4s
 📄 Report: results/report.html
```

That little `.tww` file is the test and the documentation.
When the UI shifts around, the AI adapts to the page instead of hard-crashing on a stale selector.

## Why You'll Love This

- **You can start fast** — if you can describe the test, you can run the test.
- **You stop babysitting selectors** — the AI finds things by understanding the page, not by clinging to fragile CSS paths.
- **You get evidence, not vibes** — every run gives you screenshots and an HTML report.
- **You can use what already works** — GitHub Models gets you started for free, and other OpenAI-compatible providers work too.
- **You can test real flows** — forms, navigation, dashboards, internal tools, and multi-step browser tasks.
- **You can explore instead of guessing** — the package ships with `examples/` so you can open a file and instantly see the format.

## Documentation

| Doc | What's inside |
|-----|--------------|
| [Website](https://testwithwords.com) | Overview, positioning, and launch-ready landing page |
| [Getting Started Guide](docs/GUIDE.md) | Full walkthrough from install to first passing test |
| [CLI Reference](docs/CLI.md) | Every command and flag with examples |
| [.tww File Format](docs/TWW-FORMAT.md) | How to write test files — `describe`, `test`, hooks, reusable flows |
| [Configuration](docs/CONFIG.md) | `.twwrc.json` settings reference |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Real error messages → real fixes |
| [Examples](examples/) | Runnable `.tww` files you can copy, tweak, and learn from |

If you want the quick overview, start at **[testwithwords.com](https://testwithwords.com)**.
If you want the deeper stuff, the docs are all here in the repo.

## How It Works

```
.tww file → Parser → Runner → AI Agent → Browser → Results
                                  ↑
                               LLM API
                        (GitHub / OpenAI / Azure)
```

You write words.
The parser turns them into test suites.
The AI watches the page, decides the next action, uses Playwright to do it, and keeps going until the test passes or fails.
Then you get a clean CLI summary plus a visual HTML report with screenshots.

## Instafluff

TestWithWords is built by [Instafluff](https://twitch.tv/instafluff), the same human behind [ComfyJS](https://github.com/instafluff/ComfyJS).

> ComfyJS has been free for years and still gets about 3.4 million requests a year on jsDelivr.
>
> TestWithWords is the next one: a tool built to make something intimidating feel friendly, powerful, and SUPER EASILY usable.
>
> If that kind of open source makes your day better, the best way to help is to sponsor the work.

> [Become a sponsor](https://github.com/sponsors/instafluff)
>
> [Come hang out on Twitch](https://twitch.tv/instafluff)

## License

MIT
