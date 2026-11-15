#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(repoRoot, 'packages');
const coreDir = join(packagesDir, 'core');

const USAGE = 'usage: node scripts/check-docs.mjs differences';

const LIBRARIES = {
  'use-places-autocomplete': 'UPA',
  'react-places-autocomplete': 'RPA',
  'react-autocomplete': 'RGA',
};

const SECTION_HEADING = '## Differences from the original';
const DIFF_HEADER = ['ID', 'Difference', 'Why', 'Test'];
const ALLOWLIST_ID = /^(?:CORE|UPA|RPA|RGA)-\d{2}$/;
const CORE_COUNT = 16;
const TEST_FILE = /\.test(?:-d)?\.[cm]?[jt]sx?$/;

const errors = [];

function rel(file) {
  return relative(repoRoot, file).split(sep).join('/');
}

function report(file, line, message) {
  errors.push(line ? `${rel(file)}:${line}: ${message}` : `${rel(file)}: ${message}`);
}

function usage(message) {
  console.error(`check-docs: ${message}\n${USAGE}`);
  process.exit(1);
}

function readLines(file) {
  return readFileSync(file, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/);
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

function hasPipe(line) {
  return /(?<!\\)\|/.test(line);
}

function isSeparator(line, columns) {
  if (!hasPipe(line)) return false;
  const cells = splitRow(line);
  return (
    (columns === undefined || cells.length === columns) &&
    cells.every((cell) => /^:?-+:?$/.test(cell))
  );
}

function sameCells(a, b) {
  return a.length === b.length && a.every((cell, i) => cell === b[i]);
}

const ROW_START = /^ {0,3}\|/;
// Quote and list markers are stripped before matching so no copy of the header can hide in them.
const CONTAINER_MARKERS = /^(?:[ \t]*(?:>|[-+*]|\d{1,9}[.)])(?=[ \t]|$))+/;
const HTML_BLOCK = /^ {0,3}<[A-Za-z!?/]/;
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;
const TOP_LEVEL_FENCE = /^ {0,3}(?:`{3}|~{3})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;

function fencedLines(lines) {
  const fenced = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const bare = (lines[i] ?? '').replace(CONTAINER_MARKERS, '');
    const m = FENCE.exec(bare);
    if (open) {
      fenced[i] = true;
      if (m && m[1]?.[0] === open.char && m[1].length >= open.length && m[2]?.trim() === '') {
        open = null;
      }
      continue;
    }
    if (!m) continue;
    const marker = m[1] ?? '';
    if (marker[0] === '`' && (m[2] ?? '').includes('`')) continue;
    fenced[i] = true;
    open = { char: marker[0], length: marker.length };
  }
  return fenced;
}

function findSection(file, lines, fenced) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!fenced[i] && (lines[i] ?? '').trim() === SECTION_HEADING) found.push(i);
  }
  if (found.length === 0) {
    report(file, 0, `missing heading "${SECTION_HEADING}"`);
    return null;
  }
  if (found.length > 1) {
    const where = found.map((i) => i + 1).join(', ');
    report(
      file,
      (found[1] ?? 0) + 1,
      `heading "${SECTION_HEADING}" appears ${found.length} times (lines ${where})`,
    );
    return null;
  }
  const start = found[0] ?? 0;
  if (!/^## /.test(lines[start] ?? '')) {
    report(file, start + 1, `heading "${SECTION_HEADING}" must start at the beginning of the line`);
    return null;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = HEADING.exec(lines[i] ?? '');
    if (!fenced[i] && m && (m[1] ?? '').length <= 2) {
      end = i;
      break;
    }
  }
  return { start: start + 1, end };
}

function parseTable(file, lines, fenced, section, header) {
  const { start: from, end: to } = section;
  let ok = true;
  for (let i = from; i < to; i++) {
    const line = lines[i] ?? '';
    if (fenced[i]) {
      if (FENCE.test(line.replace(CONTAINER_MARKERS, '')) && !TOP_LEVEL_FENCE.test(line)) {
        report(file, i + 1, 'code fences in this section must not be indented or nested');
        ok = false;
      }
      continue;
    }
    if (line.includes('<!--') || HTML_BLOCK.test(line)) {
      report(file, i + 1, 'HTML comments and HTML blocks are not allowed in this section');
      ok = false;
    }
  }
  if (!ok) return null;

  const headerText = `| ${header.join(' | ')} |`;
  const found = [];
  for (let i = from; i < to; i++) {
    if (fenced[i]) continue;
    const bare = (lines[i] ?? '').replace(CONTAINER_MARKERS, '');
    if (hasPipe(bare) && sameCells(splitRow(bare), header)) found.push(i);
  }
  if (found.length === 0) {
    report(file, from, `missing table with header "${headerText}"`);
    return null;
  }
  if (found.length > 1) {
    const where = found.map((i) => i + 1).join(', ');
    report(
      file,
      (found[1] ?? 0) + 1,
      `expected exactly one header line "${headerText}", found ${found.length} (lines ${where})`,
    );
    return null;
  }
  const start = found[0] ?? 0;
  if (!ROW_START.test(lines[start] ?? '')) {
    report(file, start + 1, 'table header must start with "|" after at most 3 spaces');
    return null;
  }
  const separator = lines[start + 1] ?? '';
  if (!ROW_START.test(separator) || !isSeparator(separator, header.length)) {
    report(file, start + 2, 'table header must be followed by a separator row such as |---|');
    return null;
  }
  const rows = [];
  let i = start + 2;
  for (; i < to; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || fenced[i]) break;
    if (!ROW_START.test(line)) {
      report(
        file,
        i + 1,
        'table row must start with "|" after at most 3 spaces; end the table with a blank line',
      );
      ok = false;
      continue;
    }
    const cells = splitRow(line);
    if (cells.length !== header.length) {
      report(file, i + 1, `row has ${cells.length} cells, expected ${header.length}`);
      ok = false;
      continue;
    }
    rows.push({ line: i + 1, cells });
  }
  for (let j = from; j < to; j++) {
    if ((j >= start && j < i) || fenced[j]) continue;
    const bare = (lines[j] ?? '').replace(CONTAINER_MARKERS, '');
    if (isSeparator(bare)) {
      report(file, j + 1, 'only one table is allowed in this section');
      ok = false;
    } else if (ROW_START.test(bare)) {
      report(file, j + 1, 'table row outside the table; the table must not contain blank lines');
      ok = false;
    }
  }
  return ok ? rows : null;
}

function unquote(value) {
  const m = /^`([^`]*)`$/.exec(value);
  return m ? (m[1] ?? '').trim() : value;
}

function isInside(base, path) {
  const r = relative(base, path);
  return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r);
}

function checkTestPath(file, line, id, target, pkgDir, base) {
  const abs = resolve(pkgDir, target);
  const where = rel(base);
  if (isAbsolute(target) || !isInside(packagesDir, abs)) {
    report(file, line, `${id}: test path "${target}" must stay inside packages/`);
  } else if (!isInside(base, abs)) {
    report(file, line, `${id}: test path "${target}" must point inside ${where}`);
  } else if (!existsSync(abs) || !statSync(abs).isFile()) {
    report(file, line, `${id}: test path "${target}" is not a file`);
  } else if (!isInside(realpathSync(base), realpathSync(abs))) {
    report(file, line, `${id}: test path "${target}" resolves outside ${where}`);
  } else if (!isInside(join(base, 'test'), abs) || !TEST_FILE.test(abs)) {
    report(
      file,
      line,
      `${id}: test path "${target}" must be a .test or .test-d file under ${where}/test`,
    );
  }
}

// Removes comments from TypeScript source and returns two strings of the same length:
// `code` keeps string and regex literals, `masked` blanks their contents.
function lexSource(src) {
  let code = '';
  let masked = '';
  let prev = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? '';
    const next = src[i + 1];
    if (ch === '/' && (next === '/' || next === '*')) {
      let stop;
      if (next === '/') {
        stop = src.indexOf('\n', i);
        if (stop === -1) stop = src.length;
      } else {
        const end = src.indexOf('*/', i + 2);
        stop = end === -1 ? src.length : end + 2;
      }
      const blank = src.slice(i, stop).replace(/[^\n]/g, ' ');
      code += blank;
      masked += blank;
      i = stop;
      continue;
    }
    const regex = ch === '/' && !/[\w$)\]]/.test(prev);
    if (ch === "'" || ch === '"' || ch === '`' || regex) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        const c = src[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '\n' && ch !== '`') break;
        if (regex && c === '[') inClass = true;
        else if (regex && c === ']') inClass = false;
        else if (c === ch && !inClass) break;
        j++;
      }
      const end = Math.min(j + 1, src.length);
      const literal = src.slice(i, end);
      code += literal;
      masked +=
        ch +
        literal.slice(1, -1).replace(/[^\n]/g, ' ') +
        (literal.length > 1 ? (literal.at(-1) ?? '') : '');
      prev = regex ? 'x' : ch;
      i = end;
      continue;
    }
    code += ch;
    masked += ch;
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return { code, masked };
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}

function readAllowlist(pkgDir) {
  const file = join(pkgDir, 'test', 'differential', 'allowlist.ts');
  if (!existsSync(file)) return null;
  const { code, masked } = lexSource(readFileSync(file, 'utf8'));
  const ids = new Map();
  const key = /\bid\s*:/g;
  const literal = /\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`$\n]*)`)/y;
  const typeAnnotation = /[ \t]*string[ \t]*(?:[;,}\r\n]|$)/y;
  for (let m = key.exec(masked); m; m = key.exec(masked)) {
    const at = m.index + m[0].length;
    const line = lineAt(masked, m.index);
    literal.lastIndex = at;
    const found = literal.exec(code);
    if (!found) {
      typeAnnotation.lastIndex = at;
      if (!typeAnnotation.test(code)) report(file, line, 'id must be a string literal');
      continue;
    }
    const value = found[1] ?? found[2] ?? found[3] ?? '';
    if (ALLOWLIST_ID.test(value)) {
      if (!ids.has(value)) ids.set(value, line);
    } else report(file, line, `id "${value}" must be CORE-, UPA-, RPA- or RGA- and two digits`);
  }
  return { file, ids };
}

function checkReadme(lib, prefix, coreRows) {
  const pkgDir = join(packagesDir, lib);
  const file = join(pkgDir, 'README.md');
  if (!existsSync(file)) {
    report(file, 0, 'file is missing');
    return;
  }
  const lines = readLines(file);
  const fenced = fencedLines(lines);
  const section = findSection(file, lines, fenced);
  const rows = section ? parseTable(file, lines, fenced, section, DIFF_HEADER) : null;
  if (!rows) return;

  const ids = new Set();
  const idPattern = new RegExp(`^(?:${prefix}|CORE)-\\d{2}$`);
  for (const { line, cells } of rows) {
    const [id = '', difference, why, rawTest] = cells;
    if (!idPattern.test(id)) {
      report(file, line, `ID "${id}" must be ${prefix}- or CORE- followed by two digits`);
    } else if (id.startsWith('CORE-') && !isCoreId(id)) {
      report(file, line, `ID "${id}" is outside ${coreRange()}`);
    } else if (ids.has(id)) {
      report(file, line, `duplicate ID ${id}`);
    }
    ids.add(id);
    if (!difference) report(file, line, `${id}: Difference is empty`);
    if (!why) report(file, line, `${id}: Why is empty`);
    const test = unquote(rawTest ?? '');
    const isCore = id.startsWith('CORE-');
    if (test.startsWith('test:')) {
      const target = test.slice(5).trim();
      if (!target) report(file, line, `${id}: Test "test:" needs a path`);
      else checkTestPath(file, line, id, target, pkgDir, isCore ? coreDir : pkgDir);
    } else if (test !== 'allowlist' && test !== 'doc') {
      report(file, line, `${id}: Test "${test}" must be allowlist, doc or test:<path>`);
    }
    if (isCoreId(id)) {
      const uses = coreRows.get(id) ?? [];
      uses.push({ file, line, test });
      coreRows.set(id, uses);
    }
  }

  const allowlist = readAllowlist(pkgDir);
  if (allowlist) {
    for (const [id, line] of allowlist.ids) {
      if (!ids.has(id)) report(allowlist.file, line, `${id} has no row in ${rel(file)}`);
    }
  }
  for (const { line, cells } of rows) {
    if (unquote(cells[3] ?? '') !== 'allowlist') continue;
    if (!allowlist) {
      report(
        file,
        line,
        `${cells[0]} is marked allowlist but test/differential/allowlist.ts is missing`,
      );
    } else if (!allowlist.ids.has(cells[0] ?? '')) {
      report(file, line, `${cells[0]} is marked allowlist but is not in ${rel(allowlist.file)}`);
    }
  }
}

function coreId(n) {
  return `CORE-${String(n).padStart(2, '0')}`;
}

function coreRange() {
  return `${coreId(1)}..${coreId(CORE_COUNT)}`;
}

function isCoreId(id) {
  const m = /^CORE-(\d{2})$/.exec(id);
  const n = Number(m?.[1] ?? 0);
  return n >= 1 && n <= CORE_COUNT;
}

function checkCore(coreRows) {
  for (const [id, uses] of coreRows) {
    const [first, ...rest] = uses;
    if (!first) continue;
    for (const use of rest) {
      if (use.test !== first.test) {
        report(
          use.file,
          use.line,
          `${id}: Test "${use.test}" differs from "${first.test}" in ${rel(first.file)}:${first.line}`,
        );
      }
    }
  }
  for (let n = 1; n <= CORE_COUNT; n++) {
    const id = coreId(n);
    if (!coreRows.has(id)) {
      report(packagesDir, 0, `${id} is missing; the READMEs must cover ${coreRange()}`);
    }
  }
}

function checkDifferences() {
  const coreRows = new Map();
  for (const [lib, prefix] of Object.entries(LIBRARIES)) checkReadme(lib, prefix, coreRows);
  checkCore(coreRows);
  return `differences ok: ${Object.keys(LIBRARIES).join(', ')} (${coreRange()})`;
}

const argv = process.argv.slice(2);
const mode = argv[0];
if (mode !== 'differences') usage(mode ? `unknown mode "${mode}"` : 'missing mode');
if (argv.length > 1) usage(`unexpected argument "${argv[1]}"`);

const summary = checkDifferences();

if (errors.length > 0) {
  for (const error of errors) console.error(`check-docs: ${error}`);
  console.error(`check-docs: ${mode} failed with ${errors.length} error(s)`);
  process.exit(1);
}
console.log(summary);
