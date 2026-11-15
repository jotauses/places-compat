import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const roots = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const HEADING = '## Differences from the original';
const DIFF_HEAD = '| ID | Difference | Why | Test |\n| --- | --- | --- | --- |\n';

const UPA = 'packages/use-places-autocomplete';
const RPA = 'packages/react-places-autocomplete';
const RGA = 'packages/react-autocomplete';

const CORE_01 = '| CORE-01 | Shared change. | Reason. | test:../core/test/a.test.ts |\n';
const CORE_02 = '| CORE-02 | Other change. | Reason. | doc |\n';
const coreRows = (from, to) => {
  let rows = '';
  for (let n = from; n <= to; n++) rows += `| CORE-${String(n).padStart(2, '0')} | x | y | doc |\n`;
  return rows;
};
const CORE_REST = coreRows(3, 16);

function readme(rows = CORE_01, { before = '', after = '' } = {}) {
  return [
    '# Package',
    '',
    'Intro.',
    '',
    '## Usage',
    '',
    '```js',
    "const x = require('x');",
    '```',
    '',
    before,
    HEADING,
    '',
    'Some text.',
    '',
    `${DIFF_HEAD}${rows}`,
    after,
    '## License',
    '',
    'MIT',
    '',
  ].join('\n');
}

const BASE = {
  'packages/core/package.json': '{"name":"@x/core"}',
  'packages/core/test/a.test.ts': '',
  'packages/core/test/b.test.ts': '',
  [`${UPA}/package.json`]: '{"name":"@x/upa"}',
  [`${UPA}/README.md`]: readme(),
  [`${UPA}/test/a.test.ts`]: '',
  [`${RPA}/package.json`]: '{"name":"@x/rpa"}',
  [`${RPA}/README.md`]: readme(`${CORE_01}${CORE_02}${CORE_REST}`),
  [`${RGA}/package.json`]: '{"name":"@x/rga"}',
  [`${RGA}/README.md`]: readme('| RGA-01 | Change. | Reason. | doc |\n'),
  'outside.txt': 'not a test',
};

function makeRepo(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  copyFileSync(join(scriptsDir, 'check-docs.mjs'), join(root, 'scripts', 'check-docs.mjs'));
  for (const [path, content] of Object.entries({ ...BASE, ...overrides })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root, ...args) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'check-docs.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function passes(root, ...args) {
  const r = run(root, ...args);
  assert.equal(r.status, 0, r.out);
  return r.out;
}

function fails(root, args, pattern) {
  const r = run(root, ...args);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, pattern);
}

function upa(rows, options) {
  return { [`${UPA}/README.md`]: readme(rows, options) };
}

const upaRow = (test) => `${CORE_01}| UPA-01 | Change. | Reason. | ${test} |\n`;

describe('baseline', () => {
  test('a valid repo passes', () => {
    const out = passes(makeRepo(), 'differences');
    assert.match(out, /differences ok: .*\(CORE-01\.\.CORE-16\)/);
  });

  test('usage errors exit 1', () => {
    const root = makeRepo();
    fails(root, [], /missing mode/);
    fails(root, ['other'], /unknown mode "other"/);
    fails(root, ['differences', 'core'], /unexpected argument/);
  });

  test('it runs the same from inside a package', () => {
    const root = makeRepo();
    const r = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'check-docs.mjs'), 'differences'],
      {
        cwd: join(root, 'packages', 'core'),
        encoding: 'utf8',
      },
    );
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  });
});

describe('section', () => {
  test('a missing README fails', () => {
    fails(
      makeRepo({ [`${RGA}/README.md`]: null }),
      ['differences'],
      /react-autocomplete\/README\.md: file is missing/,
    );
  });

  test('a missing heading fails', () => {
    const doc = readme().replace(HEADING, '## Differences');
    fails(
      makeRepo({ [`${UPA}/README.md`]: doc }),
      ['differences'],
      /missing heading "## Differences from the original"/,
    );
  });

  test('a heading of another level does not count', () => {
    const doc = readme().replace(HEADING, `#${HEADING}`);
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /missing heading/);
  });

  test('a repeated heading fails', () => {
    const doc = readme(CORE_01, { after: `\n${HEADING}\n\n` });
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /appears 2 times/);
  });

  test('an indented heading fails', () => {
    const doc = readme().replace(HEADING, `  ${HEADING}`);
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /must start at the beginning/);
  });

  test('a heading inside a code fence does not count', () => {
    const fenced = `\`\`\`md\n${HEADING}\n\n${DIFF_HEAD}| UPA-07 | x | y | doc |\n\`\`\`\n\n`;
    const doc = `# Package\n\n${fenced}## License\n`;
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /missing heading/);
  });

  test('the table must sit before the next level-2 heading', () => {
    const doc = readme('').replace(DIFF_HEAD, '').replace('MIT', `MIT\n\n${DIFF_HEAD}${CORE_01}`);
    fails(
      makeRepo({ [`${UPA}/README.md`]: doc }),
      ['differences'],
      /:12: missing table with header/,
    );
  });

  test('a level-3 heading does not end the section', () => {
    const doc = readme().replace('Some text.', '### Notes\n\nSome text.');
    passes(makeRepo({ [`${UPA}/README.md`]: doc }), 'differences');
  });

  test('a bad header fails', () => {
    const doc = readme().replace(
      '| ID | Difference | Why | Test |',
      '| ID | Change | Why | Test |',
    );
    fails(
      makeRepo({ [`${UPA}/README.md`]: doc }),
      ['differences'],
      /missing table with header "\| ID \| Difference \| Why \| Test \|"/,
    );
  });

  test('a missing separator fails', () => {
    const doc = readme().replace('| --- | --- | --- | --- |\n', '');
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /separator row/);
  });

  test('a second table in the section fails', () => {
    const doc = readme(CORE_01, { after: '\n| A | B |\n| - | - |\n| 1 | 2 |\n\n' });
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /only one table is allowed/);
  });

  test('a header copy behind a list marker counts as a second table', () => {
    const doc = readme(CORE_01, { after: `\n- ${DIFF_HEAD.split('\n')[0]}\n\n` });
    fails(
      makeRepo({ [`${UPA}/README.md`]: doc }),
      ['differences'],
      /expected exactly one header line/,
    );
  });

  test('a header copy in a block quote counts as a second table', () => {
    const doc = readme(CORE_01, { after: `\n> ${DIFF_HEAD.split('\n')[0]}\n\n` });
    fails(
      makeRepo({ [`${UPA}/README.md`]: doc }),
      ['differences'],
      /expected exactly one header line/,
    );
  });

  test('HTML comments and blocks in the section fail', () => {
    fails(
      makeRepo(upa(CORE_01, { after: '\n<!-- note -->\n\n' })),
      ['differences'],
      /HTML comments and HTML blocks/,
    );
    fails(
      makeRepo(upa(CORE_01, { after: '\n<details>\n\n' })),
      ['differences'],
      /HTML comments and HTML blocks/,
    );
  });

  test('HTML outside the section is allowed', () => {
    const doc = readme().replace('Intro.', '<p align="center">Intro.</p>\n\n<!-- note -->');
    passes(makeRepo({ [`${UPA}/README.md`]: doc }), 'differences');
  });

  test('a table indented 4 spaces is code, not a table', () => {
    const doc = readme().replace(
      DIFF_HEAD + CORE_01,
      `${DIFF_HEAD}${CORE_01}`.replace(/^/gm, '    '),
    );
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /header must start with "\|"/);
  });

  test('a line without a pipe does not end the table', () => {
    fails(
      makeRepo(upa(`${CORE_01}not a row\n`)),
      ['differences'],
      /:19: table row must start with "\|"/,
    );
  });

  test('a wrong cell count fails', () => {
    fails(makeRepo(upa('| CORE-01 | x | doc |\n')), ['differences'], /row has 3 cells, expected 4/);
  });

  test('a blank line ends the table', () => {
    passes(makeRepo(upa(CORE_01, { after: '\nSome text | with a pipe.\n\n' })), 'differences');
  });

  test('a row after a blank line inside the table fails', () => {
    fails(
      makeRepo(upa(`${CORE_01}\n| UPA-01 | x | y | test:/etc/passwd |\n`)),
      ['differences'],
      /:20: table row outside the table/,
    );
    fails(
      makeRepo(upa(CORE_01, { after: '\n> | CORE-99 | x | y | bogus |\n\n' })),
      ['differences'],
      /table row outside the table/,
    );
  });
});

describe('code fences', () => {
  test('a table inside a code fence is ignored', () => {
    const fenced = `\`\`\`md\n${DIFF_HEAD}| UPA-99 | x | y | bogus |\n\`\`\`\n\n`;
    passes(makeRepo(upa(CORE_01, { before: '', after: `\n${fenced}` })), 'differences');
    const only = readme('').replace(DIFF_HEAD, fenced);
    fails(makeRepo({ [`${UPA}/README.md`]: only }), ['differences'], /missing table with header/);
  });

  test('a closing fence with an info string does not close the fence', () => {
    const fenced = `\`\`\`md\nexample\n\`\`\`md\n\n${DIFF_HEAD}| UPA-99 | x | y | bogus |\n\`\`\`\n\n`;
    passes(makeRepo(upa(CORE_01, { after: `\n${fenced}` })), 'differences');
  });

  test('a fence closes only with the same character and enough length', () => {
    const tilde = `~~~\n\`\`\`\n${DIFF_HEAD}| UPA-99 | x | y | bogus |\n~~~\n\n`;
    passes(makeRepo(upa(CORE_01, { after: `\n${tilde}` })), 'differences');
    const short = `\`\`\`\`\n\`\`\`\n${DIFF_HEAD}| UPA-99 | x | y | bogus |\n\`\`\`\`\n\n`;
    passes(makeRepo(upa(CORE_01, { after: `\n${short}` })), 'differences');
  });

  test('an unclosed fence hides the rest of the file', () => {
    const doc = readme().replace('## Usage', '## Usage\n\n~~~');
    fails(makeRepo({ [`${UPA}/README.md`]: doc }), ['differences'], /missing heading/);
  });

  test('an indented or nested fence in the section fails', () => {
    const indented = `    \`\`\`\n${DIFF_HEAD}| UPA-99 | x | y | bogus |\n    \`\`\`\n\n`;
    fails(
      makeRepo(upa(CORE_01, { after: `\n${indented}` })),
      ['differences'],
      /must not be indented or nested/,
    );
    const quoted = `> \`\`\`\n> x\n> \`\`\`\n\n`;
    fails(
      makeRepo(upa(CORE_01, { after: `\n${quoted}` })),
      ['differences'],
      /must not be indented or nested/,
    );
  });

  test('a fence right after the last row ends the table', () => {
    passes(makeRepo(upa(`${CORE_01}\`\`\`\ncode | here\n\`\`\`\n`)), 'differences');
  });

  test('a bare CR is a line break', () => {
    const doc = readme().replace('Some text.', 'Some\rtext.');
    passes(makeRepo({ [`${UPA}/README.md`]: doc }), 'differences');
  });
});

describe('rows', () => {
  test('a duplicate id fails', () => {
    fails(makeRepo(upa(`${CORE_01}${CORE_01}`)), ['differences'], /duplicate ID CORE-01/);
  });

  test('an id with the prefix of another library fails', () => {
    fails(
      makeRepo(upa(`${CORE_01}| RPA-01 | x | y | doc |\n`)),
      ['differences'],
      /ID "RPA-01" must be UPA- or CORE-/,
    );
  });

  test('malformed ids fail', () => {
    for (const id of ['UPA-1', 'UPA-001', 'upa-01', 'CORE-1', 'UPA01', '']) {
      fails(
        makeRepo(upa(`${CORE_01}| ${id} | x | y | doc |\n`)),
        ['differences'],
        /must be UPA- or CORE- followed by two digits/,
      );
    }
  });

  test('empty cells and unknown Test values fail', () => {
    fails(
      makeRepo(upa(`${CORE_01}| UPA-01 | | y | doc |\n`)),
      ['differences'],
      /UPA-01: Difference is empty/,
    );
    fails(
      makeRepo(upa(`${CORE_01}| UPA-01 | x | | doc |\n`)),
      ['differences'],
      /UPA-01: Why is empty/,
    );
    fails(makeRepo(upa(upaRow('maybe'))), ['differences'], /must be allowlist, doc or test:<path>/);
    fails(makeRepo(upa(upaRow('test:'))), ['differences'], /needs a path/);
  });

  test('a library test path must be a file inside its package', () => {
    passes(makeRepo(upa(upaRow('`test:test/a.test.ts`'))), 'differences');
    fails(
      makeRepo(upa(upaRow('test:test/missing.test.ts'))),
      ['differences'],
      /UPA-01: test path "test\/missing\.test\.ts" is not a file/,
    );
    fails(makeRepo(upa(upaRow('test:test'))), ['differences'], /is not a file/);
    fails(
      makeRepo(upa(upaRow('test:.'))),
      ['differences'],
      /must point inside packages\/use-places-autocomplete/,
    );
    fails(
      makeRepo(upa(upaRow('test:../core/test/a.test.ts'))),
      ['differences'],
      /must point inside packages\/use-places-autocomplete/,
    );
  });

  test('a test path may not escape packages/', () => {
    fails(
      makeRepo(upa(upaRow('test:../../outside.txt'))),
      ['differences'],
      /must stay inside packages\//,
    );
    fails(
      makeRepo(upa('| CORE-01 | x | y | test:../../outside.txt |\n')),
      ['differences'],
      /CORE-01: test path "\.\.\/\.\.\/outside\.txt" must stay inside packages\//,
    );
    const root = makeRepo();
    writeFileSync(
      join(root, UPA, 'README.md'),
      readme(upaRow(`test:${join(root, 'outside.txt')}`)),
    );
    fails(root, ['differences'], /must stay inside packages\//);
  });

  test('a test path may not escape through a symlink', () => {
    const root = makeRepo(upa(upaRow('test:test/link.test.ts')));
    symlinkSync(join(root, 'outside.txt'), join(root, UPA, 'test', 'link.test.ts'));
    fails(root, ['differences'], /resolves outside packages\/use-places-autocomplete/);
  });

  test('a CORE test path must point at the core package', () => {
    fails(
      makeRepo(upa('| CORE-01 | x | y | test:test/a.test.ts |\n')),
      ['differences'],
      /CORE-01: test path "test\/a\.test\.ts" must point inside packages\/core/,
    );
  });

  test('a test path must name a test file under test/', () => {
    const root = makeRepo(upa(upaRow('test:README.md')));
    fails(
      root,
      ['differences'],
      /UPA-01: test path "README\.md" must be a \.test or \.test-d file/,
    );
    fails(
      makeRepo({
        [`${UPA}/README.md`]: readme(upaRow('test:src/a.test.ts')),
        [`${UPA}/src/a.test.ts`]: '',
      }),
      ['differences'],
      /must be a \.test or \.test-d file under packages\/use-places-autocomplete\/test/,
    );
    fails(
      makeRepo({
        [`${UPA}/README.md`]: readme(upaRow('test:test/helpers.ts')),
        [`${UPA}/test/helpers.ts`]: '',
      }),
      ['differences'],
      /must be a \.test or \.test-d file/,
    );
    passes(
      makeRepo({
        [`${UPA}/README.md`]: readme(upaRow('test:test/types/a.test-d.ts')),
        [`${UPA}/test/types/a.test-d.ts`]: '',
      }),
      'differences',
    );
    fails(
      makeRepo({
        [`${UPA}/README.md`]: readme('| CORE-01 | x | y | test:../core/package.json |\n'),
        [`${RPA}/README.md`]: readme(
          `| CORE-01 | x | y | test:../core/package.json |\n${CORE_02}${CORE_REST}`,
        ),
      }),
      ['differences'],
      /CORE-01: test path "\.\.\/core\/package\.json" must be a \.test or \.test-d file under packages\/core\/test/,
    );
  });

  test('a CORE row whose test file is missing fails', () => {
    fails(
      makeRepo({ 'packages/core/test/a.test.ts': null }),
      ['differences'],
      /CORE-01: test path "\.\.\/core\/test\/a\.test\.ts" is not a file/,
    );
  });
});

describe('core ids', () => {
  test('a gap in the CORE ids fails', () => {
    fails(
      makeRepo({ [`${RPA}/README.md`]: readme(`${CORE_01}${CORE_REST}`) }),
      ['differences'],
      /CORE-02 is missing; the READMEs must cover CORE-01\.\.CORE-16/,
    );
  });

  test('CORE-01 must exist', () => {
    fails(
      makeRepo({
        [`${UPA}/README.md`]: readme(CORE_02),
        [`${RPA}/README.md`]: readme(`${CORE_02}${CORE_REST}`),
      }),
      ['differences'],
      /CORE-01 is missing/,
    );
  });

  test('dropping the highest CORE id fails', () => {
    fails(
      makeRepo({ [`${RPA}/README.md`]: readme(`${CORE_01}${CORE_02}${coreRows(3, 15)}`) }),
      ['differences'],
      /CORE-16 is missing/,
    );
  });

  test('CORE ids outside CORE-01..CORE-16 fail', () => {
    fails(
      makeRepo(upa(`${CORE_01}| CORE-17 | x | y | doc |\n`)),
      ['differences'],
      /ID "CORE-17" is outside CORE-01\.\.CORE-16/,
    );
    fails(
      makeRepo(upa(`${CORE_01}| CORE-00 | x | y | doc |\n`)),
      ['differences'],
      /ID "CORE-00" is outside CORE-01\.\.CORE-16/,
    );
  });

  test('a CORE id may appear in one README only', () => {
    passes(
      makeRepo({
        [`${RPA}/README.md`]: readme(`${CORE_01}${CORE_02}${coreRows(4, 16)}`),
        [`${RGA}/README.md`]: readme('| CORE-03 | x | y | test:../core/test/b.test.ts |\n'),
      }),
      'differences',
    );
  });

  test('a CORE id must have the same Test in every README', () => {
    fails(
      makeRepo({
        [`${RGA}/README.md`]: readme('| CORE-01 | x | y | test:../core/test/b.test.ts |\n'),
      }),
      ['differences'],
      /react-autocomplete\/README\.md:\d+: CORE-01: Test "test:\.\.\/core\/test\/b\.test\.ts" differs from "test:\.\.\/core\/test\/a\.test\.ts"/,
    );
    fails(
      makeRepo({ [`${RGA}/README.md`]: readme('| CORE-02 | x | y | allowlist |\n') }),
      ['differences'],
      /CORE-02: Test "allowlist" differs from "doc"/,
    );
  });
});

describe('allowlist', () => {
  const list = (body, rows = upaRow('allowlist')) => ({
    ...upa(rows),
    [`${UPA}/test/differential/allowlist.ts`]: body,
  });

  test('real id properties pass, including core ids and tricky literals', () => {
    const body = [
      "import type { AllowEntry } from './types';",
      'interface Local { id: string; path: string | RegExp; reason: string }',
      '/* UPA-99 in a block comment */',
      'export const allowlist: AllowEntry[] = [',
      "  { id: 'UPA-01', path: /^a\\/\\//, reason: 'see // not a comment' },",
      '  { id: "CORE-01", path: \'x\', reason: `uses /* no comment */` }, // UPA-98',
      '];',
    ].join('\n');
    passes(makeRepo(list(body)), 'differences');
  });

  test('an allowlist row needs a real entry, not a comment or a reason', () => {
    fails(
      makeRepo(list('// UPA-01\nexport const allowlist = [];\n')),
      ['differences'],
      /UPA-01 is marked allowlist but is not in/,
    );
    fails(
      makeRepo(
        list("export const allowlist = [{ id: 'CORE-01', path: 'x', reason: 'like UPA-01' }];\n"),
      ),
      ['differences'],
      /UPA-01 is marked allowlist but is not in packages\/use-places-autocomplete\/test\/differential\/allowlist\.ts/,
    );
    fails(makeRepo(upa(upaRow('allowlist'))), ['differences'], /allowlist\.ts is missing/);
  });

  test('an allowlist id missing from the README fails', () => {
    const body =
      "export const allowlist = [{ id: 'UPA-01', path: 'a', reason: 'r' },\n  { id: 'UPA-02', path: 'b', reason: 'r' }];\n";
    fails(
      makeRepo(list(body)),
      ['differences'],
      /allowlist\.ts:2: UPA-02 has no row in packages\/use-places-autocomplete\/README\.md/,
    );
  });

  test('a CORE id in an allowlist needs a row in that README', () => {
    const body =
      "export const allowlist = [{ id: 'UPA-01', path: 'a', reason: 'r' }, { id: 'CORE-02', path: 'b', reason: 'r' }];\n";
    fails(
      makeRepo(list(body)),
      ['differences'],
      /CORE-02 has no row in packages\/use-places-autocomplete\/README\.md/,
    );
  });

  test('an allowlist id from another library fails', () => {
    const body =
      "export const allowlist = [{ id: 'UPA-01', path: 'a', reason: 'r' }, { id: 'RPA-01', path: 'b', reason: 'r' }];\n";
    fails(
      makeRepo(list(body)),
      ['differences'],
      /RPA-01 has no row in packages\/use-places-autocomplete\/README\.md/,
    );
  });

  test('malformed ids are reported', () => {
    for (const id of ["'UPA-1'", "'upa-05'", "'CORE-1'", "'UPA-001'", "''"]) {
      const body = `export const allowlist = [{ id: 'UPA-01', path: 'a', reason: 'r' }, { id: ${id}, path: 'b', reason: 'r' }];\n`;
      fails(
        makeRepo(list(body)),
        ['differences'],
        /allowlist\.ts:1: id ".*" must be CORE-, UPA-, RPA- or RGA- and two digits/,
      );
    }
  });

  test('non-literal ids are reported', () => {
    for (const id of ['`UPA-$' + '{n}`', 'someId', "'UPA-' + '01'"]) {
      const body = `const n = 1;\nexport const allowlist = [{ id: 'UPA-01', path: 'a', reason: 'r' },\n  { id: ${id}, path: 'b', reason: 'r' }];\n`;
      const root = makeRepo(list(body));
      if (id.includes('+')) fails(root, ['differences'], /id "UPA-" must be/);
      else fails(root, ['differences'], /allowlist\.ts:3: id must be a string literal/);
    }
  });
});

describe('test-types naming check', () => {
  // Builds a package with test/types entries; the guard runs before tsc is resolved.
  function typesPackage(entries) {
    const root = mkdtempSync(join(tmpdir(), 'test-types-'));
    roots.push(root);
    mkdirSync(join(root, 'scripts'));
    copyFileSync(join(scriptsDir, 'test-types.mjs'), join(root, 'scripts', 'test-types.mjs'));
    const pkg = join(root, 'packages', 'p');
    mkdirSync(join(pkg, 'test', 'types'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"name":"p"}');
    writeFileSync(join(pkg, 'test', 'types', 'tsconfig.json'), '{}');
    for (const [path, content] of Object.entries(entries)) {
      mkdirSync(dirname(join(pkg, 'test', 'types', path)), { recursive: true });
      if (content !== null) writeFileSync(join(pkg, 'test', 'types', path), content);
    }
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'test-types.mjs')], {
      cwd: pkg,
      encoding: 'utf8',
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  }

  test('a file whose name starts with react fails', () => {
    const r = typesPackage({ 'react-places-autocomplete.test-d.ts': '' });
    assert.equal(r.status, 1, r.out);
    assert.match(
      r.out,
      /test\/types\/react-places-autocomplete\.test-d\.ts is skipped by the react\* exclude/,
    );
  });

  test('a react folder that is not react<major> fails', () => {
    const r = typesPackage({ 'react-extra/tsconfig.json': '{}' });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /test\/types\/react-extra is skipped/);
  });

  test('a react<major> folder without tsconfig.json fails', () => {
    const r = typesPackage({ 'react18/a.test-d.ts': '' });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /test\/types\/react18 has no tsconfig\.json/);
  });

  test('valid react<major> folders get past the guard', () => {
    const r = typesPackage({ 'react18/tsconfig.json': '{}', 'exports.test-d.ts': '' });
    assert.doesNotMatch(r.out, /skipped by the react|has no tsconfig/);
  });
});
