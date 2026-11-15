import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectStyles, STYLE_ATTRIBUTE } from '../../src/widget/styles';

const selector = `style[${STYLE_ATTRIBUTE}]`;

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('injectStyles', () => {
  it('injects nothing when the widget modules are imported', async () => {
    await import('../../src/widget/shim');
    await import('../../src/widget/dropdown');
    expect(document.querySelectorAll(selector)).toHaveLength(0);
  });

  it('inserts one stylesheet as the first child of head', () => {
    const existing = document.createElement('link');
    document.head.appendChild(existing);
    injectStyles(document);
    const styles = document.querySelectorAll(selector);
    expect(styles).toHaveLength(1);
    expect(document.head.firstChild).toBe(styles[0]);
    expect(styles[0]?.getAttribute(STYLE_ATTRIBUTE)).toBe('');
  });

  it('injects only once per document', () => {
    injectStyles();
    injectStyles(document);
    injectStyles();
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });

  it('injects separately into another document', () => {
    const other = document.implementation.createHTMLDocument('other');
    injectStyles(document);
    injectStyles(other);
    injectStyles(other);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(other.querySelectorAll(selector)).toHaveLength(1);
    expect(other.head.firstChild).toBe(other.querySelector(selector));
  });

  it('does nothing without a DOM', () => {
    vi.stubGlobal('document', undefined);
    expect(() => injectStyles()).not.toThrow();
  });

  it('does nothing for a document without head', () => {
    const bare = document.implementation.createDocument(null, null, null);
    expect(() => injectStyles(bare)).not.toThrow();
    expect(bare.querySelector(selector)).toBeNull();
  });

  it('carries the base rules and the attribution styling', () => {
    injectStyles();
    const css = document.querySelector(selector)?.textContent ?? '';
    for (const rule of [
      '.pac-container{',
      '.pac-item{',
      '.pac-item:hover{',
      '.pac-item-selected',
      '.pac-item-query{',
      '.pac-matched{font-weight:700}',
      '.pac-icon{',
      '.pac-icon-marker{',
      '.pac-attribution{',
    ]) {
      expect(css).toContain(rule);
    }
    expect(css).toContain('cursor: default');
    expect(css).not.toMatch(/url\(/);
    const attribution = /\.pac-attribution\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(attribution).toContain('font-family:Roboto,sans-serif');
    expect(attribution).toContain('font-style:normal');
    expect(attribution).toContain('font-weight:400');
    expect(attribution).toContain('font-size:12px');
    expect(attribution).toContain('letter-spacing:normal');
    expect(attribution).toContain('white-space:nowrap');
    expect(attribution).toContain('color:#5E5E5E');
    expect(css).toMatch(/\.pac-container\{[^}]*background-color:#fff/);
  });
});
