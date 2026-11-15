import { describe, expect, it } from 'vitest';
import { synthesizeTerms } from '../src/terms';

describe('synthesizeTerms (CORE-01)', () => {
  it('splits on ", " with the offset of each segment', () => {
    expect(synthesizeTerms('Calle Mayor 1, Madrid, Spain')).toEqual([
      { offset: 0, value: 'Calle Mayor 1' },
      { offset: 15, value: 'Madrid' },
      { offset: 23, value: 'Spain' },
    ]);
  });

  it('gives one empty term for an empty string', () => {
    expect(synthesizeTerms('')).toEqual([{ offset: 0, value: '' }]);
  });

  it('gives one term when there is no comma', () => {
    expect(synthesizeTerms('Madrid')).toEqual([{ offset: 0, value: 'Madrid' }]);
  });

  it('does not split on a comma without a space', () => {
    expect(synthesizeTerms('1,5 km, Madrid')).toEqual([
      { offset: 0, value: '1,5 km' },
      { offset: 8, value: 'Madrid' },
    ]);
  });

  it('uses the position of each occurrence for repeated segments', () => {
    expect(synthesizeTerms('Paris, Paris, France')).toEqual([
      { offset: 0, value: 'Paris' },
      { offset: 7, value: 'Paris' },
      { offset: 14, value: 'France' },
    ]);
  });

  it('keeps empty segments as terms, each at its own offset', () => {
    expect(synthesizeTerms('a, , b')).toEqual([
      { offset: 0, value: 'a' },
      { offset: 3, value: '' },
      { offset: 5, value: 'b' },
    ]);
    expect(synthesizeTerms('Madrid, Spain, ')).toEqual([
      { offset: 0, value: 'Madrid' },
      { offset: 8, value: 'Spain' },
      { offset: 15, value: '' },
    ]);
    expect(synthesizeTerms(', , Spain')).toEqual([
      { offset: 0, value: '' },
      { offset: 2, value: '' },
      { offset: 4, value: 'Spain' },
    ]);
  });

  it('counts offsets in UTF-16 code units', () => {
    const text = '𝔸 Street, Town';
    const terms = synthesizeTerms(text);
    expect(terms).toEqual([
      { offset: 0, value: '𝔸 Street' },
      { offset: 11, value: 'Town' },
    ]);
    expect(text.slice(11, 15)).toBe('Town');
  });
});
