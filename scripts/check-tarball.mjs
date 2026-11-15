// Packs each library and checks the tarball from the point of view of a consumer project.
// Usage: node scripts/check-tarball.mjs [package name or directory ...]
// Set KEEP_TMP=1 to keep the temporary directories for inspection.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT = 'check-tarball';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(repoRoot, 'packages');
const repoRequire = createRequire(join(repoRoot, 'package.json'));
const keepTmp = process.env.KEEP_TMP === '1';

const REGISTRY = 'http://127.0.0.1:4873';
const REPO_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
const REQUIRED_FILES = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md'];
const DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
];
const BANNED_DEPENDENCY_TEXT = ['@places-compat/core', 'workspace:'];
// Names check-dist bans in dist, searched here in every shipped file except .map files and those below.
const BANNED_STRINGS = [
  '@places-compat/core',
  '@testing-library',
  'react/jsx-runtime',
  'use client',
];
// Docs may name these freely, and package.json dependency fields are checked separately.
const BANNED_STRINGS_EXEMPT = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json'];
const ABSOLUTE_PATH_MARKERS = ['/Users/', '/home/', '/private/'];
const CONSUMER_VERSIONS = {
  react: '19.3.1',
  'react-dom': '19.3.1',
  '@types/react': '19.3.0',
  '@types/google.maps': '3.66.10',
};
// This package ships @types/google.maps as a dependency, so its types must bring the namespace themselves.
const TYPES_FROM_DEPENDENCY = new Set(['@places-compat/react-places-autocomplete']);
const ORIGINAL_NAMES = {
  '@places-compat/use-places-autocomplete': 'use-places-autocomplete',
  '@places-compat/react-places-autocomplete': 'react-places-autocomplete',
  '@places-compat/react-autocomplete': 'react-google-autocomplete',
};
const SUBPATHS = {
  '@places-compat/react-autocomplete': [
    'lib/usePlacesAutocompleteService',
    'lib/usePlacesWidget',
    'lib/usePlacesService',
    'lib/index',
  ],
};
// Subpath whose default export the type check calls, per package.
const TYPED_CALL_SUBPATH = {
  '@places-compat/react-autocomplete': 'lib/usePlacesAutocompleteService',
};
// Physical files loaded by path, bypassing exports, as tools that ignore exports do.
const PHYSICAL_FORWARDERS = {
  '@places-compat/react-autocomplete': [
    'lib/index.js',
    'lib/usePlacesAutocompleteService.js',
    'lib/usePlacesWidget.js',
    'lib/usePlacesService.js',
  ],
};
function forwarderStub(name, target) {
  return {
    [`lib/${name}.js`]: `module.exports = require('../dist/${target}.cjs');`,
    [`lib/${name}.d.ts`]: `export * from '../dist/${target}';\nexport { default } from '../dist/${target}';`,
  };
}
// Exact content of the physical stubs, compared after trimming trailing whitespace on each line.
const PHYSICAL_STUBS = {
  '@places-compat/react-autocomplete': {
    ...forwarderStub('index', 'index'),
    ...forwarderStub('usePlacesAutocompleteService', 'lib/usePlacesAutocompleteService'),
    ...forwarderStub('usePlacesWidget', 'lib/usePlacesWidget'),
    ...forwarderStub('usePlacesService', 'lib/usePlacesService'),
    'index.d.ts': "export * from './dist/index';\nexport { default } from './dist/index';",
  },
};
const ACCEPTED_PUBLINT_WARNINGS = ['CJS_WITH_ESMODULE_DEFAULT_EXPORT'];
// attw reads the lib/*.js forwarders as module.exports =, missing the inherited exports.default shape.
const ATTW_IGNORED_RULES = ['false-export-default'];

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

async function hashRepoFiles() {
  const hashes = {};
  for (const file of REPO_FILES) {
    const data = await readFile(join(repoRoot, file));
    hashes[file] = createHash('sha256').update(data).digest('hex');
  }
  return hashes;
}

// Environment for child pnpm runs without the settings pnpm injects into its own scripts.
function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(npm_config_|npm_package_|npm_lifecycle_|pnpm_)/i.test(key)) continue;
    if (key === 'INIT_CWD' || key === 'PNPM_SCRIPT_SRC_DIR') continue;
    env[key] = value;
  }
  return env;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: cleanEnv(), encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { status: result.error ? -1 : result.status, output: result.error?.message ?? output };
}

function binPath(packageName, binName) {
  const manifestPath = repoRequire.resolve(`${packageName}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binName];
  return join(dirname(manifestPath), bin);
}

function checkPackedManifest(manifest, problems) {
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value === undefined) continue;
    const entries = Array.isArray(value)
      ? value.map((name) => [name, ''])
      : Object.entries(value).map(([name, range]) => [name, String(range)]);
    for (const [name, range] of entries) {
      for (const banned of BANNED_DEPENDENCY_TEXT) {
        if (name.includes(banned) || range.includes(banned)) {
          problems.push(`packed package.json ${field} has "${name}": "${range}"`);
        }
      }
    }
  }
}

const RUNTIME_CHECK = `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const specifiers = JSON.parse(process.argv[2]);
const alias = process.argv[3];
const forwarders = JSON.parse(process.argv[4]);
const problems = [];
const packageRequire = createRequire(new URL('./node_modules/' + alias + '/package.json', import.meta.url));
for (const file of forwarders) {
  const label = alias + ' file ' + file;
  try {
    const cjs = packageRequire('./' + file);
    if (cjs.__esModule !== true) problems.push(label + ': require() result has no __esModule');
    if (!('default' in cjs) || cjs.default === undefined) problems.push(label + ': require() result has no default');
  } catch (error) {
    problems.push(label + ': require() failed: ' + error.message);
  }
}
for (const specifier of specifiers) {
  try {
    const cjs = require(specifier);
    if (cjs.__esModule !== true) problems.push(specifier + ': require() result has no __esModule');
    if (!('default' in cjs) || cjs.default === undefined) problems.push(specifier + ': require() result has no default');
  } catch (error) {
    problems.push(specifier + ': require() failed: ' + error.message);
  }
  try {
    const esm = await import(specifier);
    if (!('default' in esm) || esm.default === undefined) problems.push(specifier + ': import() namespace has no default');
  } catch (error) {
    problems.push(specifier + ': import() failed: ' + error.message);
  }
}
for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);
`;

function typeCheckSource(pkgName, alias) {
  const imports = [`import Default from '${alias}';`];
  const lines = [
    '',
    'type IsAny<T> = 0 extends 1 & T ? true : false;',
    'export const defaultIsTyped: IsAny<typeof Default> = false;',
    "export const hasDefault: boolean = typeof Default !== 'undefined';",
  ];
  (SUBPATHS[pkgName] ?? []).forEach((subpath, index) => {
    imports.push(`import subpath${index} from '${alias}/${subpath}';`);
    lines.push(`export const subpath${index}IsTyped: IsAny<typeof subpath${index}> = false;`);
  });
  const subpath = TYPED_CALL_SUBPATH[pkgName];
  if (subpath) {
    imports.push(`import subpathDefault from '${alias}/${subpath}';`);
    lines.push(
      'export const subpathIsTyped: IsAny<typeof subpathDefault> = false;',
      'export function neverCalled(): void {',
      '  // The argument mirrors the required options parameter of the original signature.',
      '  subpathDefault({});',
      '}',
    );
  }
  return `${[...imports, ...lines].join('\n')}\n`;
}

function tsconfigFor(module, moduleResolution, typesFromDependency) {
  const compilerOptions = {
    target: 'ES2020',
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
    module,
    moduleResolution,
    strict: true,
    noImplicitAny: true,
    skipLibCheck: false,
    noEmit: true,
    types: typesFromDependency ? [] : ['google.maps'],
  };
  // TypeScript 6 deprecates node10 resolution; this silences that for the consumer check only.
  if (moduleResolution === 'node') compilerOptions.ignoreDeprecations = '6.0';
  return { compilerOptions, files: ['index.ts'] };
}

async function checkPackage(pkg, tmpRoot) {
  const problems = [];
  const versioned = JSON.parse(await readFile(join(pkg.dir, 'package.json'), 'utf8'));
  if (versioned.publishConfig?.registry !== REGISTRY) {
    problems.push(`package.json publishConfig.registry must be "${REGISTRY}"`);
  }
  const alias = ORIGINAL_NAMES[pkg.name];
  if (!alias) return [...problems, 'no original package name is configured for this library'];

  const work = await mkdtemp(join(tmpRoot, `${basename(pkg.dir)}-`));
  const packDir = join(work, 'pack');
  const extractDir = join(work, 'extract');
  const consumerDir = join(work, 'consumer');
  for (const dir of [packDir, extractDir, consumerDir]) {
    await mkdir(dir, { recursive: true });
  }

  const packed = run('pnpm', ['pack', '--pack-destination', packDir], pkg.dir);
  const tarballs = (await readdir(packDir)).filter((file) => file.endsWith('.tgz'));
  if (packed.status !== 0 || tarballs.length !== 1) {
    return [...problems, `pnpm pack failed (exit ${packed.status}):\n${packed.output}`];
  }
  const tarball = join(packDir, tarballs[0] ?? '');
  console.log(`${SCRIPT}: ${pkg.name}: packed ${basename(tarball)}`);

  const extracted = run('tar', ['-xzf', tarball, '-C', extractDir], work);
  if (extracted.status !== 0) return [...problems, `tar failed:\n${extracted.output}`];
  const packageRoot = join(extractDir, 'package');

  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  checkPackedManifest(manifest, problems);

  const files = await walk(packageRoot);
  const names = new Set(files.map((file) => relative(packageRoot, file).split(sep).join('/')));
  for (const file of REQUIRED_FILES) {
    if (!names.has(file)) problems.push(`tarball is missing ${file}`);
  }
  for (const file of files) {
    const name = relative(packageRoot, file).split(sep).join('/');
    const text = (await readFile(file)).toString('latin1');
    for (const marker of ABSOLUTE_PATH_MARKERS) {
      if (text.includes(marker)) {
        problems.push(`tarball file ${name} contains an absolute path`);
        break;
      }
    }
    if (name.endsWith('.map') || BANNED_STRINGS_EXEMPT.includes(name)) continue;
    for (const banned of BANNED_STRINGS) {
      if (text.includes(banned)) problems.push(`tarball file ${name} contains "${banned}"`);
    }
  }
  const stubs = PHYSICAL_STUBS[pkg.name];
  if (stubs) {
    const trimLines = (text) => text.replace(/[ \t\r]+$/gm, '').replace(/\n+$/, '');
    for (const [name, expected] of Object.entries(stubs)) {
      if (!names.has(name)) {
        problems.push(`tarball is missing ${name}`);
        continue;
      }
      const actual = await readFile(join(packageRoot, name), 'utf8');
      if (trimLines(actual) !== expected) {
        problems.push(`tarball file ${name} differs from its expected content:\n${actual}`);
      }
    }
    for (const name of names) {
      if (name.startsWith('lib/') && !(name in stubs)) {
        problems.push(`tarball file ${name} is not an expected physical stub`);
      }
    }
  }

  const consumerDependencies = { [alias]: `file:${tarball}`, ...CONSUMER_VERSIONS };
  const typesFromDependency = TYPES_FROM_DEPENDENCY.has(pkg.name);
  if (typesFromDependency) delete consumerDependencies['@types/google.maps'];
  const consumerManifest = {
    name: 'tarball-consumer',
    version: '0.0.0',
    private: true,
    dependencies: consumerDependencies,
  };
  await writeFile(
    join(consumerDir, 'package.json'),
    `${JSON.stringify(consumerManifest, null, 2)}\n`,
  );
  const installed = run(
    'pnpm',
    ['install', '--prefer-offline', '--ignore-scripts', '--ignore-workspace'],
    consumerDir,
  );
  if (installed.status !== 0) {
    return [...problems, `consumer install failed:\n${installed.output}`];
  }

  const specifiers = [alias];
  for (const subpath of SUBPATHS[pkg.name] ?? []) {
    specifiers.push(`${alias}/${subpath}`, `${alias}/${subpath}.js`);
  }
  const forwarders = PHYSICAL_FORWARDERS[pkg.name] ?? [];
  await writeFile(join(consumerDir, 'runtime-check.mjs'), RUNTIME_CHECK);
  const runtime = run(
    process.execPath,
    ['runtime-check.mjs', JSON.stringify(specifiers), alias, JSON.stringify(forwarders)],
    consumerDir,
  );
  if (runtime.status !== 0) problems.push(`runtime check failed:\n${runtime.output}`);
  else
    console.log(
      `${SCRIPT}: ${pkg.name}: runtime ok for ${[...specifiers, ...forwarders].join(', ')}`,
    );

  await writeFile(join(consumerDir, 'index.ts'), typeCheckSource(pkg.name, alias));
  const tsc = repoRequire.resolve('typescript/bin/tsc');
  const variants = [
    ['tsconfig.node.json', 'commonjs', 'node'],
    ['tsconfig.bundler.json', 'esnext', 'bundler'],
  ];
  for (const [file, module, moduleResolution] of variants) {
    const config = tsconfigFor(module, moduleResolution, typesFromDependency);
    await writeFile(join(consumerDir, file), `${JSON.stringify(config, null, 2)}\n`);
    const compiled = run(
      process.execPath,
      [tsc, '--noEmit', '--noImplicitAny', '-p', file],
      consumerDir,
    );
    const label = `${module} + ${moduleResolution}`;
    if (compiled.status !== 0) problems.push(`tsc (${label}) failed:\n${compiled.output}`);
    else console.log(`${SCRIPT}: ${pkg.name}: tsc ok (${label})`);
  }

  const { publint } = await import(pathToFileURL(repoRequire.resolve('publint')).href);
  const { formatMessage } = await import(pathToFileURL(repoRequire.resolve('publint/utils')).href);
  const data = await readFile(tarball);
  const lint = await publint({
    pack: { tarball: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) },
  });
  for (const message of lint.messages) {
    const text = `publint ${message.type} ${message.code}: ${formatMessage(message, lint.pkg, { color: false })}`;
    const accepted =
      message.type === 'suggestion' ||
      (message.type === 'warning' && ACCEPTED_PUBLINT_WARNINGS.includes(message.code));
    if (accepted) console.log(`${SCRIPT}: ${pkg.name}: ${text}`);
    else problems.push(text);
  }

  const attwArgs = [binPath('@arethetypeswrong/cli', 'attw'), tarball, '--format', 'table'];
  attwArgs.push('--no-color', '--no-emoji');
  if (ATTW_IGNORED_RULES.length > 0) attwArgs.push('--ignore-rules', ...ATTW_IGNORED_RULES);
  const attw = run(process.execPath, attwArgs, work);
  console.log(`${SCRIPT}: ${pkg.name}: attw output:\n${attw.output}`);
  if (attw.status !== 0) problems.push(`attw failed (exit ${attw.status})`);

  return problems;
}

const targets = await resolveTargets(process.argv.slice(2));
if (targets.length === 0) process.exit(0);

const before = await hashRepoFiles();
// The real path keeps the tarball path short and stable for the pnpm store index.
const tmpRoot = await realpath(await mkdtemp(join(tmpdir(), 'places-compat-tarball-')));
let failed = false;
try {
  for (const pkg of targets) {
    let problems;
    try {
      problems = await checkPackage(pkg, tmpRoot);
    } catch (error) {
      problems = [`unexpected error: ${error.stack ?? error}`];
    }
    for (const problem of problems) console.error(`${SCRIPT}: ${pkg.name}: ${problem}`);
    if (problems.length > 0) failed = true;
    else console.log(`${SCRIPT}: ${pkg.name}: ok`);
  }
} finally {
  if (keepTmp) console.log(`${SCRIPT}: temporary files kept in ${tmpRoot}`);
  else await rm(tmpRoot, { recursive: true, force: true });
}

const after = await hashRepoFiles();
for (const file of REPO_FILES) {
  if (before[file] !== after[file]) {
    console.error(`${SCRIPT}: repository file ${file} changed during the check`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
