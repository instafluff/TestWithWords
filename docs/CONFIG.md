# Configuration

Set project-level defaults in a `.twwrc.json` file so you don't need to repeat CLI flags.

Full examples at [testwithwords.com](https://testwithwords.com).

---

## Create a Config File

The fastest way:

```bash
tww init
```

This drops a `.twwrc.json` in your current directory:

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

You can also create one by hand — it's just JSON.

---

## All Options

| Key | Type | Default | What it does |
|-----|------|---------|-------------|
| `model` | `string` | `"gpt-4o-mini"` | LLM model name. Must match what your provider offers. |
| `timeout` | `number` | `60000` | Per-test timeout in milliseconds. If a test takes longer, it fails. |
| `retries` | `number` | `0` | How many times to retry a failed test before calling it failed for real. |
| `output` | `string` | `"./results"` | Where screenshots and HTML reports go. Created automatically. |
| `port` | `number` | `9222` | Remote debugging port for `tww launch` and `--attach` mode. |
| `browser` | `"edge"` \| `"chrome"` | auto-detected | Which browser to use in attach mode. Only matters with `--attach`. |
| `screenshotEveryStep` | `boolean` | `true` | Capture a screenshot after every AI action. Turn off to save disk space. |
| `maxSteps` | `number` | `25` | Max AI actions per test. Prevents the AI from looping forever. |
| `showTokenUsage` | `boolean` | `true` | Show LLM token usage in terminal and HTML reports. |
| `showSponsorMessage` | `boolean` | `true` | Show the small GitHub Sponsors reminder after successful `tww run` commands. |

---

## How Settings Get Resolved

Here's the priority chain — the highest one wins:

```
CLI flags  >  .twwrc.json  >  Built-in defaults
  (highest)                      (lowest)
```

**CLI flags always win.** If you pass `--timeout 30000` on the command line, it overrides whatever's in your config file.

TWW searches for `.twwrc.json` starting from your current directory, then walks up parent directories until it finds one (or hits the filesystem root). This means you can have a project-level config and override it per-directory.

### Example in action

Given this config:

```json
{
  "model": "gpt-4o",
  "timeout": 120000,
  "retries": 1,
  "output": "./test-output"
}
```

And this command:

```bash
tww run tests/ --timeout 30000
```

Here's what TWW actually uses:

| Option | Value | Where it came from |
|--------|-------|--------------------|
| model | `gpt-4o` | `.twwrc.json` |
| timeout | `30000` | CLI flag (overrides config) |
| retries | `1` | `.twwrc.json` |
| output | `./test-output` | `.twwrc.json` |
| maxSteps | `25` | Built-in default (not in config) |

---

## Starter Configs

Don't want to figure it out from scratch? Here are some ready-to-go configs for common setups. Copy the one that fits and tweak from there.

### Quick & cheap (great for getting started)

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

This is the default — fast model, reasonable timeout, screenshots enabled.

### CI pipeline

```json
{
  "model": "gpt-4o-mini",
  "timeout": 90000,
  "retries": 1,
  "output": "./test-results",
  "screenshotEveryStep": true,
  "maxSteps": 30,
  "showTokenUsage": false,
  "showSponsorMessage": false
}
```

Longer timeout for CI machines, one retry for flaky network conditions, token output hidden to keep logs clean, sponsor reminder disabled for non-interactive logs.

### Corporate intranet (via Edge + attach mode)

```json
{
  "model": "gpt-4o-mini",
  "timeout": 90000,
  "retries": 2,
  "output": "./test-results",
  "browser": "edge",
  "screenshotEveryStep": true,
  "maxSteps": 40,
  "showTokenUsage": true
}
```

Uses Edge with attach mode for SSO/corporate auth, more retries for internal app reliability, higher max steps for complex enterprise UIs.

### Complex test scenarios (more power)

```json
{
  "model": "gpt-4o",
  "timeout": 120000,
  "retries": 1,
  "output": "./results",
  "screenshotEveryStep": true,
  "maxSteps": 50
}
```

Stronger model for complex multi-step scenarios, generous timeout and step limit.

### Minimal / disk-conscious

```json
{
  "model": "gpt-4.1-nano",
  "timeout": 45000,
  "retries": 0,
  "output": "./results",
  "screenshotEveryStep": false,
  "maxSteps": 15,
  "showTokenUsage": false,
  "showSponsorMessage": false
}
```

Fastest model, no screenshots, lower step limit. Suitable for quick smoke tests.

---

## Validation

TWW validates your config on load and tells you exactly what's wrong:

```
.twwrc.json: "timeout" must be a positive number (ms)
```

```
.twwrc.json: "browser" must be "edge" or "chrome"
```

Bad JSON? You'll get a clear message:

```
Invalid JSON in .twwrc.json: Unexpected token ...
```

If your config gets into a bad state, delete it and start fresh:

```bash
rm .twwrc.json
tww init
```

---

## Related Docs

- [CLI Reference](CLI.md) — every flag that can override config values
- [Getting Started Guide](GUIDE.md) — walkthrough including config setup
- [Troubleshooting](TROUBLESHOOTING.md) — config-related errors and fixes

More at [testwithwords.com](https://testwithwords.com).
