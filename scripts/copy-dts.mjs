// Copies every dist/**/*.d.cts to a sibling .d.ts so consumers on node10 resolution find types.
// Relative ".cjs" specifiers become extensionless in the copy so node10 and TypeScript before 4.7 resolve the .d.ts.
// Usage: node scripts/copy-dts.mjs [package name or directory ...]
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = 'copy-dts';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(repoRoot, 'packages');
// Relative specifier ending in .cjs, in from '...' or import('...') form.
const CJS_SPECIFIER = /(\bfrom\s+|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"'\n]+?)\.cjs\2/g;

async function listPackages() {
  const result = [];
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    try {
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      result.push({ dir, name: pkg.name, isPrivate: pkg.private === true });
    } catch {
      // Not a package directory.
    }
  }
  return result;
}

function matches(pkg, arg) {
  if (arg === pkg.name || arg === basename(pkg.dir)) return true;
  const fromCwd = resolve(process.cwd(), arg);
  const fromRoot = resolve(repoRoot, arg);
  return fromCwd === pkg.dir || fromRoot === pkg.dir;
}

async function resolveTargets(args) {
  const all = await listPackages();
  let selected;
  if (args.length > 0) {
    selected = [];
    for (const arg of args) {
      const pkg = all.find((candidate) => matches(candidate, arg));
      if (!pkg) {
        console.error(`${SCRIPT}: unknown package "${arg}"`);
        process.exit(1);
      }
      selected.push(pkg);
    }
  } else {
    const cwd = process.cwd();
    const current = all.find((pkg) => cwd === pkg.dir || cwd.startsWith(pkg.dir + sep));
    selected = current ? [current] : all.filter((pkg) => !pkg.isPrivate);
  }
  const targets = [];
  for (const pkg of selected) {
    if (pkg.isPrivate) {
      console.log(`${SCRIPT}: ${pkg.name}: private package, skipped`);
    } else {
      targets.push(pkg);
    }
  }
  return targets;
}

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

let failed = false;
for (const pkg of await resolveTargets(process.argv.slice(2))) {
  const dist = join(pkg.dir, 'dist');
  const isDir = await stat(dist).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (!isDir) {
    console.error(`${SCRIPT}: ${pkg.name}: dist folder not found, run tsdown first`);
    failed = true;
    continue;
  }
  const sources = (await walk(dist)).filter((file) => file.endsWith('.d.cts'));
  if (sources.length === 0) {
    console.error(`${SCRIPT}: ${pkg.name}: no .d.cts files in dist`);
    failed = true;
    continue;
  }
  for (const source of sources) {
    const target = `${source.slice(0, -'.d.cts'.length)}.d.ts`;
    const text = await readFile(source, 'utf8');
    await writeFile(target, text.replace(CJS_SPECIFIER, '$1$2$3$2'));
    console.log(`${SCRIPT}: ${pkg.name}: ${relative(pkg.dir, target)}`);
  }
}
process.exit(failed ? 1 : 0);
