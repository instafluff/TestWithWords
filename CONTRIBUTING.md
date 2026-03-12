# Contributing to TestWithWords

Thanks for your interest in contributing! 💜

TestWithWords is open source and community contributions make it better for everyone. Whether you're fixing a bug, suggesting a feature, or improving docs — you're welcome here.

## How to Help

### Report Bugs

Open an issue using the **Bug Report** template. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, browser, LLM provider)

Good bug reports save everyone time. Screenshots and terminal output are especially helpful.

### Suggest Features

Open an issue using the **Feature Request** template. Focus on the use case — what problem does it solve? The best feature requests describe the "why" clearly.

### Submit Code

1. **Open an issue first** to discuss the change — this avoids wasted effort
2. Fork the repo and create a branch from `main`
3. Make your changes (small, focused PRs are easiest to review)
4. Run `npm test` to make sure nothing breaks
5. Submit a PR referencing the issue

### Improve Docs

Found a typo? Missing info? Something confusing? Docs PRs are always welcome — no issue needed. Just open the PR.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/instafluff/TestWithWords.git
cd TestWithWords

# Install dependencies
npm install

# Build the project (TypeScript → JavaScript)
npm run build

# Run tests
npm test

# Build and run the CLI in one step
npm run dev
```

**Requirements:** Node.js >= 18. Playwright's Chromium is installed automatically via `postinstall`.

## Code Style

- TypeScript with ESM modules
- No lint config yet — just keep it clean and readable
- Comments explain **why**, not what
- Prefer small, focused functions over large ones

## Project Structure

```
src/
  cli.ts        — CLI entry point
  parser.ts     — .tww file parser
  runner.ts     — Test execution engine
  agent.ts      — AI agent (observe-act loop)
  browser.ts    — Playwright browser management
  llm.ts        — LLM provider integration
  report.ts     — HTML report generation
  types.ts      — Shared TypeScript types
```

## Questions?

Open an issue or join the [Comfy Discord](http://discord.instafluff.tv) — we're happy to help.
