import chalk from 'chalk';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

interface SponsorState {
  successfulRunCount?: number;
}

const SPONSOR_STATE_DIR = join(homedir(), '.testwithwords');
const SPONSOR_STATE_FILE = join(SPONSOR_STATE_DIR, 'sponsor-state.json');
export const SPONSOR_MESSAGE_INTERVAL = 1;

export function shouldShowSponsorMessage(successfulRunCount: number, interval = SPONSOR_MESSAGE_INTERVAL): boolean {
  const safeInterval = Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : SPONSOR_MESSAGE_INTERVAL;
  return successfulRunCount > 0 && successfulRunCount % safeInterval === 0;
}

async function readSponsorState(): Promise<SponsorState> {
  try {
    const raw = await readFile(SPONSOR_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as SponsorState;
    return typeof parsed.successfulRunCount === 'number'
      ? { successfulRunCount: Math.max(0, Math.floor(parsed.successfulRunCount)) }
      : {};
  } catch {
    return {};
  }
}

async function writeSponsorState(state: SponsorState): Promise<void> {
  await mkdir(SPONSOR_STATE_DIR, { recursive: true });
  await writeFile(SPONSOR_STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

async function recordSuccessfulRun(): Promise<number> {
  const state = await readSponsorState();
  const successfulRunCount = (state.successfulRunCount ?? 0) + 1;
  await writeSponsorState({ successfulRunCount });
  return successfulRunCount;
}

export async function maybeShowSponsorMessage(enabled: boolean): Promise<void> {
  const successfulRunCount = await recordSuccessfulRun();
  if (!enabled || !shouldShowSponsorMessage(successfulRunCount)) {
    return;
  }

  console.log(chalk.dim('  ─'.repeat(29)));
  console.log(chalk.magenta('  ♥ ') + chalk.white('TestWithWords is free and open source.'));
  console.log(chalk.dim('    Sponsor the project: https://github.com/sponsors/instafluff'));
  console.log('');
}