// Checks the built dist folder of each library: required files, banned imports, sourcemaps, CJS shape.
// Usage: node scripts/check-dist.mjs [package name or directory ...]
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = 'check-dist';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(repoRoot, 'packages');

const EXTRA_ENTRIES = {
  '@places-compat/react-autocomplete': [
    'lib/usePlacesAutocompleteService',
    'lib/usePlacesWidget',
    'lib/usePlacesService',
  ],
};
const ENTRY_EXTENSIONS = ['.mjs', '.cjs', '.d.mts', '.d.cts', '.d.ts'];
const INDEX_MAPS = ['index.mjs.map', 'index.cjs.map'];
const BANNED_STRINGS = [
  '@places-compat/core',
  '@testing-library',
  'react/jsx-runtime',
  'use client',
];
const CODE_FILE = /\.(mjs|cjs|d\.ts|d\.mts|d\.cts)$/;
// A relative specifier with a .cjs or .mjs extension, which node10 cannot map to a .d.ts.
const EXTENSION_SPECIFIER = /(["'])\.{1,2}\/[^"'\n]+\.[cm]js\1/g;

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

function isRelativeSource(source) {
  if (typeof source !== 'string' || source === '') return false;
  if (isAbsolute(source) || source.startsWith('/') || source.startsWith('\\')) return false;
  // Rejects URL schemes such as file:// and Windows drive letters.
  return !/^[a-z][a-z0-9+.-]*:/i.test(source);
}

async function checkPackage(pkg) {
  const problems = [];
  const dist = join(pkg.dir, 'dist');
  const isDir = await stat(dist).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (!isDir) return ['dist folder not found, run the build first'];

  const files = await walk(dist);
  const rel = (file) => relative(pkg.dir, file).split(sep).join('/');
  const present = new Set(files.map(rel));

  const entries = ['index', ...(EXTRA_ENTRIES[pkg.name] ?? [])];
  const required = entries.flatMap((entry) => ENTRY_EXTENSIONS.map((ext) => `dist/${entry}${ext}`));
  required.push(...INDEX_MAPS.map((map) => `dist/${map}`));
  for (const file of required) {
    if (!present.has(file)) problems.push(`missing ${file}`);
  }
  for (const file of present) {
    if (!file.endsWith('.d.cts')) continue;
    const sibling = `${file.slice(0, -'.d.cts'.length)}.d.ts`;
    if (!present.has(sibling) && !required.includes(sibling)) {
      problems.push(`missing ${sibling} next to ${file}`);
    }
  }

  for (const file of files) {
    const name = rel(file);
    if (CODE_FILE.test(name)) {
      const text = await readFile(file, 'utf8');
      for (const banned of BANNED_STRINGS) {
        if (text.includes(banned)) problems.push(`${name} contains "${banned}"`);
      }
      if (name.endsWith('.d.ts')) {
        for (const [specifier] of text.matchAll(EXTENSION_SPECIFIER)) {
          problems.push(`${name} imports ${specifier} with an extension node10 cannot resolve`);
        }
      }
    } else if (name.endsWith('.map')) {
      let map;
      try {
        map = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) {
        problems.push(`${name} is not valid JSON (${error.message})`);
        continue;
      }
      if (!Array.isArray(map.sources)) {
        problems.push(`${name} has no "sources" array`);
        continue;
      }
      for (const source of map.sources) {
        if (!isRelativeSource(source)) {
          problems.push(`${name} has a non-relative source ${JSON.stringify(source)}`);
        }
      }
      if (map.sourceRoot && !isRelativeSource(map.sourceRoot)) {
        problems.push(`${name} has a non-relative sourceRoot ${JSON.stringify(map.sourceRoot)}`);
      }
    }
  }

  for (const entry of entries) {
    const name = `dist/${entry}.cjs`;
    if (!present.has(name)) continue;
    const text = await readFile(join(pkg.dir, name), 'utf8');
    if (!text.includes('exports.default')) problems.push(`${name} does not set exports.default`);
    if (!text.includes('__esModule')) problems.push(`${name} does not mark __esModule`);
  }
  return problems;
}

let failed = false;
for (const pkg of await resolveTargets(process.argv.slice(2))) {
  const problems = await checkPackage(pkg);
  for (const problem of problems) console.error(`${SCRIPT}: ${pkg.name}: ${problem}`);
  if (problems.length > 0) failed = true;
  else console.log(`${SCRIPT}: ${pkg.name}: ok`);
}
process.exit(failed ? 1 : 0);
