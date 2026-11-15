import { describe, expect, it } from 'vitest';
import { compareTraces, joinPath } from '../../src/testing/compare';
import type { AllowEntry, Trace, TraceEntry } from '../../src/testing/types';

function entry(step: number, overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    step,
    label: `step ${step}`,
    settled: { suggestions: { data: [{ terms: [{ offset: 0, value: 'Paris' }] }] } },
    loading: [false],
    callbacks: [],
    console: [],
    ...overrides,
  };
}

const allow = (path: string | RegExp, id = 'D-1'): AllowEntry => ({ id, path, reason: 'test' });

describe('joinPath', () => {
  it('uses .key for identifiers, ["key"] for other keys and [n] for indexes', () => {
    expect(joinPath('', 'settled')).toBe('settled');
    expect(joinPath('settled', 'suggestions')).toBe('settled.suggestions');
    expect(joinPath('settled.data', 0)).toBe('settled.data[0]');
    expect(joinPath('settled.inputProps', 'aria-expanded')).toBe(
      'settled.inputProps["aria-expanded"]',
    );
    expect(joinPath('settled', '0')).toBe('settled["0"]');
    expect(joinPath('settled', '$ok_1')).toBe('settled.$ok_1');
  });
});

describe('compareTraces', () => {
  it('gives no diffs and no unused entries for equal traces', () => {
    const trace: Trace = [entry(0), entry(1)];
    expect(compareTraces(trace, structuredClone(trace), [])).toEqual({
      diffs: [],
      unusedAllow: [],
    });
  });

  it('reports a nested difference with its JSON-path-like path', () => {
    const replacement = entry(1, {
      settled: { suggestions: { data: [{ terms: [{ offset: 0, value: 'París' }] }] } },
    });
    const { diffs } = compareTraces([entry(0), entry(1)], [entry(0), replacement], []);
    expect(diffs).toEqual([
      {
        step: 1,
        path: 'settled.suggestions.data[0].terms[0].value',
        original: 'Paris',
        replacement: 'París',
      },
    ]);
  });

  it('walks step, label, settled, loading, callbacks and console', () => {
    const original = entry(3);
    const replacement = entry(4, {
      label: 'other',
      loading: [true],
      callbacks: [{ name: 'onSelect', args: [] }],
      console: [{ level: 'warn', args: ['careful'] }],
    });
    const paths = compareTraces([original], [replacement], []).diffs.map((diff) => diff.path);
    expect(paths).toEqual(['step', 'label', 'loading[0]', 'callbacks[0]', 'console[0]']);
  });

  it('lists a key present on one side only with undefined on the other', () => {
    const original = entry(0, { settled: { a: 1 } });
    const replacement = entry(0, { settled: { b: '[undefined]' } });
    expect(compareTraces([original], [replacement], []).diffs).toEqual([
      { step: 0, path: 'settled.a', original: 1, replacement: undefined },
      { step: 0, path: 'settled.b', original: undefined, replacement: '[undefined]' },
    ]);
  });

  it('reports array length differences index by index', () => {
    const original = entry(0, { loading: [true, false] });
    const replacement = entry(0, { loading: [true] });
    expect(compareTraces([original], [replacement], []).diffs).toEqual([
      { step: 0, path: 'loading[1]', original: false, replacement: undefined },
    ]);
  });

  it('reports a change of shape at the path where it happens', () => {
    const original = entry(0, { settled: { value: [1] } });
    const replacement = entry(0, { settled: { value: { 0: 1 } } });
    expect(compareTraces([original], [replacement], []).diffs).toEqual([
      { step: 0, path: 'settled.value', original: [1], replacement: { 0: 1 } },
    ]);
    const nullCase = compareTraces([entry(0, { settled: null })], [entry(0)], []).diffs;
    expect(nullCase.map((diff) => diff.path)).toEqual(['settled']);
  });

  it('reports traces of different lengths with one diff per missing entry', () => {
    const longer: Trace = [entry(0), entry(1), entry(2)];
    const { diffs } = compareTraces(longer, [entry(0)], []);
    expect(diffs).toEqual([
      { step: 1, path: '', original: longer[1], replacement: undefined },
      { step: 2, path: '', original: longer[2], replacement: undefined },
    ]);
    const reverse = compareTraces([entry(0)], longer, []).diffs;
    expect(reverse.map((diff) => [diff.step, diff.original])).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
  });

  it('drops a diff whose path equals a string allow entry', () => {
    const replacement = entry(0, { label: 'renamed' });
    const entryAllow = allow('label');
    expect(compareTraces([entry(0)], [replacement], [entryAllow])).toEqual({
      diffs: [],
      unusedAllow: [],
    });
  });

  it('does not treat a string allow entry as a prefix', () => {
    const replacement = entry(0, { loading: [true] });
    const result = compareTraces([entry(0)], [replacement], [allow('loading')]);
    expect(result.diffs.map((diff) => diff.path)).toEqual(['loading[0]']);
    expect(result.unusedAllow).toEqual([allow('loading')]);
  });

  it('drops diffs whose path matches a RegExp allow entry', () => {
    const replacement = entry(0, { loading: [true, true] });
    const pattern = allow(/^loading\[\d+\]$/g);
    const result = compareTraces([entry(0)], [replacement], [pattern]);
    expect(result).toEqual({ diffs: [], unusedAllow: [] });
    expect(compareTraces([entry(0)], [replacement], [pattern]).diffs).toEqual([]);
  });

  it('keeps diffs that no allow entry matches and lists the unused entries', () => {
    const replacement = entry(0, { label: 'renamed' });
    const unused = allow(/^console/, 'D-9');
    const result = compareTraces([entry(0)], [replacement], [unused]);
    expect(result.diffs).toEqual([
      { step: 0, path: 'label', original: 'step 0', replacement: 'renamed' },
    ]);
    expect(result.unusedAllow).toEqual([unused]);
  });

  it('counts every allow entry that matches a diff as used', () => {
    const replacement = entry(0, { label: 'renamed' });
    const first = allow('label', 'D-1');
    const second = allow(/label/, 'D-2');
    expect(compareTraces([entry(0)], [replacement], [first, second]).unusedAllow).toEqual([]);
  });

  it('can allow a missing entry with the empty path', () => {
    const result = compareTraces([entry(0), entry(1)], [entry(0)], [allow('')]);
    expect(result).toEqual({ diffs: [], unusedAllow: [] });
  });
});
