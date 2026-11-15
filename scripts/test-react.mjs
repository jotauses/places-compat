#!/usr/bin/env node
// Runs the test suites against React 17, 18 or 19.
// 19 runs in place; 17 and 18 run in a temporary copy with pnpm overrides.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: node scripts/test-react.mjs <17|18|19>';
const GUARDED = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];

const OVERRIDES = {
  17: {
    react: '17.0.2',
    'react-dom': '17.0.2',
    '@types/react': '^17',
    '@types/react-dom': '^17',
    '@testing-library/react': '12.1.5',
  },
  18: {
    react: '18.3.1',
    'react-dom': '18.3.1',
    '@types/react': '^18.3',
    '@types/react-dom': '^18.3',
  },
};

function log(message) {
  console.log(`test-react: ${message}`);
}

function run(cwd, args) {
  log(`$ pnpm ${args.join(' ')}`);
  const result = spawnSync('pnpm', args, { cwd, stdio: 'inherit' });
  if (result.error) {
    console.error(`test-react: could not start pnpm: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`test-react: "pnpm ${args.join(' ')}" failed with exit code ${result.status}`);
    return false;
  }
  return true;
}

function runAll(cwd, steps) {
  for (const step of steps) if (!run(cwd, step)) return false;
  return true;
}

function hashGuarded() {
  return GUARDED.map((file) => {
    const path = join(repoRoot, file);
    if (!existsSync(path)) return 'missing';
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  });
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
  });
  return out
    .toString('utf8')
    .split('\0')
    .map((entry) => entry.replace(/\/+$/, ''))
    .filter((entry) => entry && !entry.split('/').includes('node_modules'));
}

function copyTree(dest) {
  let copied = 0;
  for (const entry of listFiles()) {
    const src = join(repoRoot, entry);
    let stat;
    try {
      stat = lstatSync(src);
    } catch {
      continue;
    }
    if (stat.isDirectory()) continue;
    const target = join(dest, entry);
    mkdirSync(dirname(target), { recursive: true });
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(src), target);
    else copyFileSync(src, target);
    copied++;
  }
  return copied;
}

function overridesYaml(overrides) {
  const lines = Object.entries(overrides).map(([name, range]) => `  '${name}': '${range}'`);
  return `\noverrides:\n${lines.join('\n')}\n`;
}

function runInPlace() {
  log('React 19, running in place');
  return runAll(repoRoot, [
    ['-r', 'test:nocov'],
    ['-r', 'test:types'],
  ]);
}

function runInCopy(major) {
  const before = hashGuarded();
  const keep = process.env.KEEP_TMP === '1';
  const dir = mkdtempSync(join(tmpdir(), `places-compat-react${major}-`));
  const cleanup = () => {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  };
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  let ok = false;
  try {
    const count = copyTree(dir);
    log(`React ${major}, copied ${count} files to ${dir}`);
    const workspace = join(dir, 'pnpm-workspace.yaml');
    if (/^overrides:/m.test(readFileSync(workspace, 'utf8'))) {
      throw new Error('pnpm-workspace.yaml already has an overrides key; merge it by hand');
    }
    appendFileSync(workspace, overridesYaml(OVERRIDES[major]));
    const steps = [
      ['install', '--no-frozen-lockfile', '--prefer-offline'],
      ['-r', 'test:nocov'],
    ];
    if (major === '18') steps.push(['-r', 'test:types']);
    ok = runAll(dir, steps);
  } catch (error) {
    console.error(`test-react: ${error instanceof Error ? error.message : String(error)}`);
    ok = false;
  }

  const after = hashGuarded();
  GUARDED.forEach((file, i) => {
    if (before[i] !== after[i]) {
      console.error(`test-react: ${file} changed in the checkout during the run`);
      ok = false;
    }
  });

  if (keep) log(`kept temp dir ${dir}`);
  else if (!ok) log(`failed in ${dir} (removed; set KEEP_TMP=1 to keep it)`);
  cleanup();
  return ok;
}

const args = process.argv.slice(2);
const major = args[0];
if (args.length !== 1 || !major || !['17', '18', '19'].includes(major)) {
  console.error(`test-react: expected one argument, 17, 18 or 19\n${USAGE}`);
  process.exit(1);
}

const ok = major === '19' ? runInPlace() : runInCopy(major);
if (!ok) {
  console.error(`test-react: React ${major} failed`);
  process.exit(1);
}
log(`ok, React ${major} passed`);
