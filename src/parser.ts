// .tww file parser — reads natural language test files into a structured test tree
// Indentation-based scoping (2 spaces per level), like Python.
//
// Keywords:
//   url <url>             — default starting URL
//   describe "name"       — test group
//   test "name"           — test case
//   before each           — runs before every test in the group
//   after each            — runs after every test in the group
//   before all            — runs once before all tests in the group
//   after all             — runs once after all tests in the group
//   use "path/to/flow"    — inline steps from another .tww file
//   # comment             — ignored

import { readFile } from 'fs/promises';
import { dirname, resolve, extname } from 'path';
import type { TestSuite, TestGroup, TestCase } from './types.js';

/** Errors thrown during parsing include line numbers and file paths */
export class ParseError extends Error {
  constructor(
    message: string,
    public filePath: string,
    public line: number,
  ) {
    super(`${filePath}:${line}: ${message}`);
    this.name = 'ParseError';
  }
}

// ─── Public API ───

/**
 * Parse a .tww file into a TestSuite.
 * Resolves `use` imports recursively.
 */
export async function parseTWWFile(filePath: string): Promise<TestSuite> {
  const absPath = resolve(filePath);
  const content = await readFile(absPath, 'utf-8');
  return parseTWW(content, absPath, new Set([absPath]));
}

/**
 * Parse .tww content from a string (useful for testing).
 * Does not resolve `use` imports by default.
 */
export async function parseTWWString(content: string, filePath = '<string>'): Promise<TestSuite> {
  return parseTWW(content, filePath, new Set());
}

// ─── Internal ───

interface Line {
  /** Original line number (1-based) */
  num: number;
  /** Indentation level (number of leading spaces) */
  indent: number;
  /** Trimmed content (no leading/trailing whitespace) */
  text: string;
}

/** Parse lines from raw text, stripping comments and blanks */
function tokenize(content: string): Line[] {
  const lines: Line[] = [];
  const rawLines = content.split(/\r?\n/);

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    // Count leading spaces
    const match = raw.match(/^( *)/);
    const indent = match ? match[1].length : 0;
    const text = raw.trim();

    // Skip empty lines and comments
    if (!text || text.startsWith('#')) continue;

    lines.push({ num: i + 1, indent, text });
  }

  return lines;
}

/** Extract a quoted string: "name" or 'name' */
function extractQuoted(text: string, keyword: string, filePath: string, lineNum: number): string {
  // Match keyword followed by quoted string
  const match = text.match(new RegExp(`^${keyword}\\s+(?:"([^"]+)"|'([^']+)')\\s*$`));
  if (!match) {
    throw new ParseError(
      `Expected ${keyword} followed by a quoted name, got: ${text}`,
      filePath,
      lineNum,
    );
  }
  return match[1] ?? match[2];
}

/** Get the block of lines that are children of a line at a given indent */
function getChildBlock(lines: Line[], startIdx: number, parentIndent: number): Line[] {
  const children: Line[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].indent <= parentIndent) break;
    children.push(lines[i]);
  }
  return children;
}

/** Collect body text lines (non-keyword lines) from a block into a single scenario string */
function collectBodyText(block: Line[]): string {
  return block.map(l => l.text).join('\n');
}

/** Main parser */
async function parseTWW(
  content: string,
  filePath: string,
  seenFiles: Set<string>,
): Promise<TestSuite> {
  const lines = tokenize(content);
  const suite: TestSuite = {
    filePath,
    groups: [],
  };

  let i = 0;

  // Parse top-level directives and describe blocks
  while (i < lines.length) {
    const line = lines[i];

    // url directive (top-level only)
    if (line.text.startsWith('url ') && line.indent === 0) {
      suite.defaultUrl = line.text.slice(4).trim();
      i++;
      continue;
    }

    // describe block
    if (line.text.startsWith('describe ')) {
      const result = await parseDescribe(lines, i, filePath, seenFiles);
      suite.groups.push(result.group);
      i = result.nextIndex;
      continue;
    }

    // Top-level test (no describe wrapper) — wrap in implicit group
    if (line.text.startsWith('test ')) {
      const result = await parseTest(lines, i, filePath, seenFiles);
      // Find or create an implicit group
      let implicitGroup = suite.groups.find(g => g.name === '(root)');
      if (!implicitGroup) {
        implicitGroup = { name: '(root)', line: line.num, tests: [], children: [] };
        suite.groups.push(implicitGroup);
      }
      implicitGroup.tests.push(result.test);
      i = result.nextIndex;
      continue;
    }

    // Top-level before each/all (applies to all groups — rare but allowed)
    if (line.text === 'before each' || line.text === 'before all' ||
        line.text === 'after each' || line.text === 'after all') {
      // Not inside a describe — skip with a warning (or we could apply globally)
      throw new ParseError(
        `"${line.text}" must be inside a describe block`,
        filePath,
        line.num,
      );
    }

    // use directive at top level
    if (line.text.startsWith('use ')) {
      throw new ParseError(
        '"use" at the top level is not allowed. Place it inside a test or before each/after each block.',
        filePath,
        line.num,
      );
    }

    // Unknown top-level content — error
    throw new ParseError(
      `Unexpected content at top level: "${line.text}". Expected: url, describe, test, or #comment.`,
      filePath,
      line.num,
    );
  }

  return suite;
}

/** Parse a describe block and its children */
async function parseDescribe(
  lines: Line[],
  startIdx: number,
  filePath: string,
  seenFiles: Set<string>,
): Promise<{ group: TestGroup; nextIndex: number }> {
  const line = lines[startIdx];
  const name = extractQuoted(line.text, 'describe', filePath, line.num);
  const parentIndent = line.indent;

  const group: TestGroup = {
    name,
    line: line.num,
    tests: [],
    children: [],
  };

  let i = startIdx + 1;

  while (i < lines.length && lines[i].indent > parentIndent) {
    const child = lines[i];

    // Nested describe
    if (child.text.startsWith('describe ')) {
      const result = await parseDescribe(lines, i, filePath, seenFiles);
      group.children.push(result.group);
      i = result.nextIndex;
      continue;
    }

    // Test case
    if (child.text.startsWith('test ')) {
      const result = await parseTest(lines, i, filePath, seenFiles);
      group.tests.push(result.test);
      i = result.nextIndex;
      continue;
    }

    // Hooks
    if (child.text === 'before each' || child.text === 'before all' ||
        child.text === 'after each' || child.text === 'after all') {
      const hookBlock = getChildBlock(lines, i + 1, child.indent);
      if (hookBlock.length === 0) {
        throw new ParseError(`"${child.text}" has no body`, filePath, child.num);
      }
      const hookText = await resolveUseDirectives(hookBlock, filePath, seenFiles);

      const hookKey = child.text === 'before each' ? 'beforeEach'
        : child.text === 'after each' ? 'afterEach'
        : child.text === 'before all' ? 'beforeAll'
        : 'afterAll';

      if (group[hookKey]) {
        throw new ParseError(
          `Duplicate "${child.text}" in describe "${name}"`,
          filePath,
          child.num,
        );
      }
      group[hookKey] = hookText;

      i += 1 + hookBlock.length;
      continue;
    }

    // Unexpected content inside describe
    throw new ParseError(
      `Unexpected inside describe "${name}": "${child.text}". Expected: test, describe, before each/all, after each/all.`,
      filePath,
      child.num,
    );
  }

  return { group, nextIndex: i };
}

/** Parse a test case and its body */
async function parseTest(
  lines: Line[],
  startIdx: number,
  filePath: string,
  seenFiles: Set<string>,
): Promise<{ test: TestCase; nextIndex: number }> {
  const line = lines[startIdx];
  const name = extractQuoted(line.text, 'test', filePath, line.num);
  const bodyBlock = getChildBlock(lines, startIdx + 1, line.indent);

  if (bodyBlock.length === 0) {
    throw new ParseError(`test "${name}" has no body`, filePath, line.num);
  }

  const scenario = await resolveUseDirectives(bodyBlock, filePath, seenFiles);

  return {
    test: { name, scenario, line: line.num },
    nextIndex: startIdx + 1 + bodyBlock.length,
  };
}

/** Resolve `use` directives in a block of lines, returning the concatenated text */
async function resolveUseDirectives(
  block: Line[],
  filePath: string,
  seenFiles: Set<string>,
): Promise<string> {
  const parts: string[] = [];

  for (const line of block) {
    const useMatch = line.text.match(/^use\s+(?:"([^"]+)"|'([^']+)')\s*$/);
    if (useMatch) {
      const importPath = useMatch[1] ?? useMatch[2];
      const resolvedPath = resolve(dirname(filePath), importPath);
      // Add .tww extension if not present
      const fullPath = extname(resolvedPath) ? resolvedPath : resolvedPath + '.tww';

      // Circular import detection
      if (seenFiles.has(fullPath)) {
        throw new ParseError(
          `Circular use: "${importPath}" (already imported in this chain)`,
          filePath,
          line.num,
        );
      }

      try {
        const importContent = await readFile(fullPath, 'utf-8');
        const importLines = tokenize(importContent);
        // Flow files are just plain steps — inline them directly
        parts.push(importLines.map(l => l.text).join('\n'));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new ParseError(
            `Cannot find file: "${importPath}" (resolved to ${fullPath})`,
            filePath,
            line.num,
          );
        }
        throw err;
      }
    } else {
      parts.push(line.text);
    }
  }

  return parts.join('\n');
}
