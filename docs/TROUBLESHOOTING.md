# Troubleshooting

Real errors and real fixes, organized by when they typically occur.

Can't find your issue here? Check [testwithwords.com](https://testwithwords.com) for the latest guides.

---

## Setup Issues

These typically occur during initial installation.

### "Command not found: tww"

You installed TestWithWords but your terminal doesn't recognize the command.

**Fix:** Make sure you installed globally:

```bash
npm i -g testwithwords
```

Check it's in your PATH:

```bash
where tww     # Windows
which tww     # macOS/Linux
```

Still nothing? Try running with `npx` instead:

```bash
npx testwithwords run tests/
```

If you're using `nvm` or a Node version manager, make sure you're in the same Node version where you installed TWW.

### "Failed to launch chromium" / Playwright browser not installed

```
  ✗ Failed to launch chromium
    Make sure Playwright browsers are installed:
      npx playwright install chromium
```

The Playwright browser binaries weren't downloaded during install. This can happen on CI servers or fresh machines.

**Fix:**

```bash
npx playwright install chromium
```

Need Firefox or WebKit too?

```bash
npx playwright install firefox
npx playwright install webkit
```

---

## Auth Issues

### "Not authenticated" / "LLM not initialized"

```
  ✗ Not authenticated. Run:

    tww auth
```

No LLM provider is configured, or your credentials have expired.

**Fix:**

```bash
tww auth
```

Pick a provider and follow the prompts. GitHub Models is free with any GitHub account. Credentials are saved to `~/.testwithwords/config.json`.

Already authenticated but still seeing this? Your token might have expired:

```bash
tww auth --logout
tww auth
```

### "Model not found" / 401 / 403 errors

The model name doesn't match what your provider supports, or your API key is bad.

**Fix:** Check what you're connected to:

```bash
tww auth --status
```

For GitHub Models, these models are available: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3-mini`, `o1-mini`.

If your key expired or got revoked:

```bash
tww auth --logout
tww auth
```

### Rate limit errors

Your provider's rate limit has been reached.

**Fix:** Wait a moment and try again. For heavier test suites, consider:

- Using a faster/cheaper model (`gpt-4o-mini` or `gpt-4.1-nano`)
- Reducing `--max-steps` so each test uses fewer tokens
- Running fewer tests at once

---

## Runtime Issues

These happen while tests are actually running.

### Browser won't connect in attach mode

```
  ✗ Could not connect to Edge
    Edge launched but debugging connection failed on port 9222.
    This usually means another process is using that port.
```

Something's blocking the debug port, or an old browser process is lingering.

**Fix 1 — Close everything and try again:**

Close all browser windows manually (check the system tray too!), then retry. TWW tries to handle this, but sometimes old processes hang around.

**Fix 2 — Just use standalone mode:**

```bash
tww run tests/
```

Skip `--attach` entirely. Standalone mode launches its own Chromium with no port conflicts.

**Fix 3 — Try a different port:**

```bash
tww run tests/ --attach 9333
```

### "Opening in existing browser session" / Browser reuse issues

Chrome or Edge opens a new tab in your existing window instead of launching a debug session.

**Why:** Another browser instance is already running and grabbed the profile.

**Fix:**

1. Close **all** Chrome/Edge windows (system tray too!)
2. Run `tww launch --browser edge` (or `chrome`) to start a clean debug session
3. Then `tww run tests/ --attach`

### Tests timing out

```
  ✗ my test name (60.0s)
    → Test timed out after 60000ms
```

The test took longer than the allowed timeout.

**Fix — increase the timeout:**

```bash
tww run tests/ --timeout 120000
```

Or set it in your `.twwrc.json` so you don't have to type it every time (see [Configuration](CONFIG.md)):

```json
{
  "timeout": 120000
}
```

**Common culprits:**
- Slow website or network
- Complex scenario with many steps
- The AI getting stuck (see "Test stuck in a loop" below)

### Test stuck in a loop

The test runs for ages, repeating similar actions without making progress.

**Why:** The AI detected it's in a cycle but can't break out. Usually the scenario is ambiguous or the page isn't in the expected state.

**Fix 1 — Be more specific in your test:**

```tww
# ❌ Vague — the AI has to guess
test "fill in the form"
  Fill in the form

# ✅ Specific — the AI knows exactly what to do
test "fill in the form"
  Type "John" in the First Name field
  Type "Doe" in the Last Name field
  Type "john@example.com" in the Email field
```

**Fix 2 — Use verbose mode to see what's happening:**

```bash
tww run tests/ -v
```

This shows every AI action in real time so you can spot where it's getting stuck.

**Fix 3 — Lower the step limit** to fail faster:

```bash
tww run tests/ --max-steps 15
```

---

## Output Issues

### Screenshots not appearing

The test runs but you can't find the screenshots.

**Check 1 — Where are they being saved?**

```bash
tww run tests/ --output ./my-results
```

Default is `./results`. Look for a `results/` folder in your working directory.

**Check 2 — Are screenshots enabled?**

```bash
# ❌ This disables screenshots
tww run tests/ --no-screenshots

# ✅ This keeps them on (default)
tww run tests/
```

**Check 3 —** Make sure `screenshotEveryStep` isn't `false` in your `.twwrc.json`. See [Configuration](CONFIG.md).

### Invalid JSON in .twwrc.json

```
Invalid JSON in .twwrc.json: Unexpected token ...
```

Your config file has a syntax error. Common mistakes:

- **Trailing commas:** `{ "model": "gpt-4o-mini", }` — delete the last comma
- **Missing quotes on keys:** `{ model: "gpt-4o-mini" }` — keys need quotes too
- **Comments:** JSON doesn't support `//` or `/* */` comments — remove them

Nuclear option — start fresh:

```bash
rm .twwrc.json
tww init
```

---

## CI / Pipeline Issues

### Tests pass locally but fail in CI

This is almost always one of these four things:

**1. Auth not configured in CI.**

Set your provider credentials as environment variables in your CI config, or run `tww auth` as a setup step.

**2. No browser installed.**

Add this to your CI pipeline:

```bash
npx playwright install chromium
```

**3. Need headless mode.**

CI servers usually don't have a display:

```bash
tww run tests/ --headless
```

**4. Network differences.**

Your CI environment might not have access to the same URLs as your local machine. Check that target sites are reachable from CI.

---

## Still Stuck?

If none of this helped, we want to hear about it! Open an issue and we'll figure it out together:

👉 **[github.com/instafluff/TestWithWords/issues](https://github.com/instafluff/TestWithWords/issues)**

When you open an issue, include:

1. The command you ran
2. The full error output
3. Your OS and Node.js version (`node --version`)
4. Whether you're using standalone or attach mode

The more context you provide, the faster we can help.

---

## Related Docs

- [Getting Started Guide](GUIDE.md) — initial setup walkthrough
- [CLI Reference](CLI.md) — every command and flag
- [Configuration](CONFIG.md) — `.twwrc.json` settings

More help at [testwithwords.com](https://testwithwords.com).
