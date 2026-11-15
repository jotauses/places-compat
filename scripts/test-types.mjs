#!/usr/bin/env node
// Type tests for one package. Run from the package dir: node ../../scripts/test-types.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = process.cwd();
const pkgRequire = createRequire(join(pkgDir, 'package.json'));

function fail(message) {
  console.error(`test-types: ${message}`);
  process.exit(1);
}

function resolveTsc() {
  for (const base of [pkgDir, repoRoot]) {
    try {
      return createRequire(join(base, 'package.json')).resolve('typescript/bin/tsc');
    } catch {
      // Try the next location.
    }
  }
  return fail('cannot resolve typescript/bin/tsc from the package or the repo root');
}

function reactTypesMajor() {
  let file;
  try {
    file = pkgRequire.resolve('@types/react/package.json');
  } catch {
    return fail(`cannot resolve @types/react from ${pkgDir}`);
  }
  const { version } = JSON.parse(readFileSync(file, 'utf8'));
  const major = Number.parseInt(String(version).split('.')[0] ?? '', 10);
  if (!Number.isInteger(major)) fail(`unexpected @types/react version "${version}"`);
  return { major, version };
}

if (!existsSync(join(pkgDir, 'test', 'types', 'tsconfig.json'))) {
  fail(`no test/types/tsconfig.json in ${pkgDir}; run this from a package dir`);
}

// The tsconfig excludes test/types/react*, so only react<major>/ folders may use that prefix.
const typesDir = join(pkgDir, 'test', 'types');
const reserved = [];
for (const entry of readdirSync(typesDir, { withFileTypes: true })) {
  if (!/^react/i.test(entry.name)) continue;
  if (!entry.isDirectory() || !/^react\d+$/.test(entry.name)) {
    reserved.push(
      `test/types/${entry.name} is skipped by the react* exclude; rename it or move it into test/types/react<major>/`,
    );
  } else if (!existsSync(join(typesDir, entry.name, 'tsconfig.json'))) {
    reserved.push(`test/types/${entry.name} has no tsconfig.json, so its type tests never run`);
  }
}
if (reserved.length > 0) {
  for (const message of reserved) console.error(`test-types: ${message}`);
  process.exit(1);
}

const tsc = resolveTsc();
const { major, version } = reactTypesMajor();
const projects = ['test/types'];
const versioned = `test/types/react${major}`;
if (existsSync(join(pkgDir, versioned, 'tsconfig.json'))) projects.push(versioned);

const relPath = relative(repoRoot, pkgDir);
const name = relPath && !relPath.startsWith('..') ? relPath : pkgDir;
console.log(`test-types: ${name} (@types/react ${version}): ${projects.join(', ')}`);

for (const project of projects) {
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', project], {
    cwd: pkgDir,
    stdio: 'inherit',
  });
  if (result.error) fail(`could not run tsc for ${project}: ${result.error.message}`);
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`test-types: tsc -p ${project} failed with exit code ${code}`);
    process.exit(code);
  }
}

console.log(`test-types: ok, ${projects.length} project(s) passed in ${name}`);
