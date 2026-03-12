import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { generateDefaultConfig } from './config.js';

const STARTER_TEST_FILE = 'hello.test.tww';
const CONFIG_FILE = '.twwrc.json';

const STARTER_TEST_CONTENT = `# My first TestWithWords test

url https://www.wikipedia.org

test "Wikipedia loads successfully"
  Verify the page shows "Wikipedia"
  Verify the search field is visible
`;

type ScaffoldStatus = 'created' | 'skipped';

async function writeIfMissing(filePath: string, content: string): Promise<ScaffoldStatus> {
  if (existsSync(filePath)) {
    return 'skipped';
  }

  await writeFile(filePath, content, 'utf-8');
  return 'created';
}

function printScaffoldResult(filePath: string, status: ScaffoldStatus): void {
  if (status === 'created') {
    console.log(chalk.green('  ✓ ') + `Created ${filePath}`);
    return;
  }

  console.log(chalk.yellow('  - ') + `${filePath} already exists, skipping`);
}

export async function runInit(): Promise<void> {
  const testStatus = await writeIfMissing(STARTER_TEST_FILE, STARTER_TEST_CONTENT);
  const configStatus = await writeIfMissing(CONFIG_FILE, generateDefaultConfig());

  console.log('');
  printScaffoldResult(STARTER_TEST_FILE, testStatus);
  printScaffoldResult(CONFIG_FILE, configStatus);
  console.log('');
  console.log(chalk.bold('  Next steps:'));
  console.log(`    ${chalk.cyan('tww auth')}          Set up your LLM provider`);
  console.log(`    ${chalk.cyan('tww run hello.test.tww')}   Run your first test!`);
  console.log('');
}