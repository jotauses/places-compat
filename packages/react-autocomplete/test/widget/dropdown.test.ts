import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createDropdown, type Dropdown } from '../../src/widget/dropdown';

type Prediction = google.maps.places.AutocompletePrediction;

function prediction(
  id: string,
  main: string,
  secondary: string,
  matched: { offset: number; length: number }[] = [],
): Prediction {
  return {
    description: `${main}, ${secondary}`,
    place_id: id,
    matched_substrings: [],
    structured_formatting: {
      main_text: main,
      main_text_matched_substrings: matched,
      secondary_text: secondary,
    },
    terms: [],
    types: [],
  };
}

const LIST = [
  prediction('paris', 'Paris', 'France', [{ offset: 0, length: 3 }]),
  prediction('parma', 'Parma', 'Italy', [{ offset: 0, length: 3 }]),
  prediction('paros', 'Paros', 'Greece'),
];

let input: HTMLInputElement;
let dropdown: Dropdown;
let onSelect: Mock<(p: Prediction) => void>;
let onEnterWithoutSelection: Mock<() => void>;

const container = () => document.querySelector('.pac-container') as HTMLDivElement;
const items = () => Array.from(document.querySelectorAll<HTMLDivElement>('.pac-item'));
const selected = () => items().filter((item) => item.classList.contains('pac-item-selected'));
const key = (name: string) => fireEvent.keyDown(input, { key: name });
const type = (value: string) => fireEvent.input(input, { target: { value } });

beforeEach(() => {
  input = document.createElement('input');
  document.body.appendChild(input);
  onSelect = vi.fn<(p: Prediction) => void>();
  onEnterWithoutSelection = vi.fn<() => void>();
  dropdown = createDropdown(input, { onSelect, onEnterWithoutSelection });
});

afterEach(() => {
  dropdown.destroy();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('createDropdown markup', () => {
  it('appends one hidden listbox to body and wires the input as a combobox', () => {
    const list = container();
    expect(document.querySelectorAll('.pac-container')).toHaveLength(1);
    expect(list.parentElement).toBe(document.body);
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.id).toMatch(/^pac-listbox-\d+$/);
    expect(list.style.display).toBe('none');
    expect(list.style.position).toBe('absolute');
    expect(list.style.zIndex).toBe('1000');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('gives each widget its own listbox id', () => {
    const other = document.createElement('input');
    document.body.appendChild(other);
    const second = createDropdown(other, { onSelect() {}, onEnterWithoutSelection() {} });
    const ids = Array.from(document.querySelectorAll('.pac-container')).map((el) => el.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(other.getAttribute('aria-controls')).toBe(ids[1]);
    second.destroy();
  });

  it('renders predictions with icon, matched query and secondary text', () => {
    dropdown.setPredictions(LIST);
    expect(container().style.display).toBe('');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const rendered = items();
    expect(rendered).toHaveLength(3);
    const first = rendered[0] as HTMLDivElement;
    expect(first.getAttribute('role')).toBe('option');
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(new Set(rendered.map((item) => item.id)).size).toBe(3);
    const [icon, query, secondary] = Array.from(first.children);
    expect(icon?.className).toBe('pac-icon pac-icon-marker');
    expect(icon?.tagName).toBe('SPAN');
    expect(query?.className).toBe('pac-item-query');
    expect(query?.innerHTML).toBe('<span class="pac-matched">Par</span>is');
    expect(secondary?.tagName).toBe('SPAN');
    expect(secondary?.textContent).toBe('France');
    expect(rendered[2]?.querySelector('.pac-matched')).toBeNull();
    expect(rendered[2]?.querySelector('.pac-item-query')?.textContent).toBe('Paros');
  });

  it('treats prediction text as text, never as markup', () => {
    dropdown.setPredictions([prediction('x', '<img src=x onerror=alert(1)>', '<b>bold</b>')]);
    const item = items()[0] as HTMLDivElement;
    expect(item.querySelector('img')).toBeNull();
    expect(item.querySelector('b')).toBeNull();
    expect(item.querySelector('.pac-item-query')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('marks several, unsorted, overlapping and out-of-range matches', () => {
    dropdown.setPredictions([
      prediction('x', 'San Francisco', 'CA', [
        { offset: 4, length: 4 },
        { offset: 0, length: 3 },
        { offset: 1, length: 1 },
        { offset: 20, length: 2 },
        { offset: 2, length: 0 },
      ]),
    ]);
    const query = document.querySelector('.pac-item-query') as HTMLElement;
    expect(query.innerHTML).toBe(
      '<span class="pac-matched">San</span> <span class="pac-matched">Fran</span>cisco',
    );
  });

  it('falls back to the description without structured formatting', () => {
    const bare = { description: 'Somewhere', place_id: 'x' } as Prediction;
    dropdown.setPredictions([bare]);
    expect(document.querySelector('.pac-item-query')?.textContent).toBe('Somewhere');
    expect(items()[0]?.lastElementChild?.textContent).toBe('');
  });

  it('stays hidden without predictions and hides when they go away', () => {
    dropdown.setPredictions([]);
    expect(container().style.display).toBe('none');
    expect(container().childElementCount).toBe(0);
    dropdown.setPredictions(LIST);
    expect(container().style.display).toBe('');
    dropdown.setPredictions(undefined as unknown as Prediction[]);
    expect(container().style.display).toBe('none');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('clear empties and hides the list', () => {
    dropdown.setPredictions(LIST);
    dropdown.clear();
    expect(container().childElementCount).toBe(0);
    expect(container().style.display).toBe('none');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('createDropdown position', () => {
  function placeInput(rect: Partial<DOMRect>) {
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
      ...rect,
    } as DOMRect);
  }

  function scrollTo(x: number, y: number) {
    Object.defineProperty(window, 'scrollX', { configurable: true, value: x });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  }

  afterEach(() => {
    scrollTo(0, 0);
  });

  it('sits below the input with its width', () => {
    placeInput({ left: 10, bottom: 40, width: 200 });
    scrollTo(5, 100);
    dropdown.setPredictions(LIST);
    const style = container().style;
    expect(style.top).toBe('140px');
    expect(style.left).toBe('15px');
    expect(style.width).toBe('200px');
  });

  it('is recalculated on resize and on scroll anywhere', () => {
    placeInput({ left: 10, bottom: 40, width: 200 });
    dropdown.setPredictions(LIST);
    placeInput({ left: 20, bottom: 60, width: 300 });
    window.dispatchEvent(new Event('resize'));
    expect(container().style.width).toBe('300px');
    expect(container().style.top).toBe('60px');

    placeInput({ left: 30, bottom: 70, width: 320 });
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);
    scroller.dispatchEvent(new Event('scroll'));
    expect(container().style.left).toBe('30px');
    expect(container().style.top).toBe('70px');
  });

  it('is not recalculated while hidden', () => {
    dropdown.setPredictions([]);
    const spy = vi.spyOn(input, 'getBoundingClientRect');
    window.dispatchEvent(new Event('resize'));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('createDropdown pointer', () => {
  it('highlights an item on hover', () => {
    dropdown.setPredictions(LIST);
    fireEvent.mouseEnter(items()[1] as HTMLElement);
    expect(selected()).toEqual([items()[1]]);
    expect(items()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(items()[1]?.id);
    fireEvent.mouseOver(items()[2] as HTMLElement);
    expect(selected()).toEqual([items()[2]]);
    expect(items()[1]?.getAttribute('aria-selected')).toBe('false');
    expect(input.value).toBe('');
  });

  it('selects on mousedown, prevents the default and hides the list', () => {
    type('par');
    dropdown.setPredictions(LIST);
    const target = items()[1] as HTMLElement;
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(LIST[1]);
    expect(container().style.display).toBe('none');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('hides on blur and ignores late predictions until the user types again', () => {
    dropdown.setPredictions(LIST);
    fireEvent.blur(input);
    expect(container().style.display).toBe('none');
    dropdown.setPredictions(LIST);
    expect(container().style.display).toBe('none');
    expect(items()).toHaveLength(3);
    fireEvent.focus(input);
    dropdown.setPredictions(LIST);
    expect(container().style.display).toBe('');
    fireEvent.blur(input);
    type('pa');
    dropdown.setPredictions(LIST);
    expect(container().style.display).toBe('');
  });
});

describe('createDropdown keyboard', () => {
  beforeEach(() => {
    type('par');
    dropdown.setPredictions(LIST);
  });

  it('ArrowDown walks the items and wraps through a no-selection slot', () => {
    key('ArrowDown');
    expect(selected()).toEqual([items()[0]]);
    expect(input.value).toBe('Paris, France');
    expect(input.getAttribute('aria-activedescendant')).toBe(items()[0]?.id);
    key('ArrowDown');
    key('ArrowDown');
    expect(selected()).toEqual([items()[2]]);
    expect(input.value).toBe('Paros, Greece');
    key('ArrowDown');
    expect(selected()).toEqual([]);
    expect(input.value).toBe('par');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key('ArrowDown');
    expect(selected()).toEqual([items()[0]]);
  });

  it('ArrowUp walks backwards and wraps through the no-selection slot', () => {
    key('ArrowUp');
    expect(selected()).toEqual([items()[2]]);
    key('ArrowUp');
    expect(selected()).toEqual([items()[1]]);
    expect(input.value).toBe('Parma, Italy');
    key('ArrowUp');
    key('ArrowUp');
    expect(selected()).toEqual([]);
    expect(input.value).toBe('par');
  });

  it('arrows prevent the caret from moving', () => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('arrows do nothing without predictions', () => {
    dropdown.clear();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(input.value).toBe('par');
  });

  it('arrows reopen a closed list without moving', () => {
    key('Escape');
    expect(container().style.display).toBe('none');
    key('ArrowDown');
    expect(container().style.display).toBe('');
    expect(selected()).toEqual([]);
    key('ArrowDown');
    expect(selected()).toEqual([items()[0]]);
  });

  it('Enter selects the highlighted item and prevents the default', () => {
    key('ArrowDown');
    key('ArrowDown');
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(LIST[1]);
    expect(onEnterWithoutSelection).not.toHaveBeenCalled();
    expect(container().style.display).toBe('none');
  });

  it('Enter selects the hovered item', () => {
    fireEvent.mouseEnter(items()[2] as HTMLElement);
    key('Enter');
    expect(onSelect).toHaveBeenCalledWith(LIST[2]);
  });

  it('Enter without a highlight reports it and keeps the default', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onEnterWithoutSelection).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(container().style.display).toBe('none');
  });

  it('Enter while composing text is ignored', () => {
    key('ArrowDown');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onEnterWithoutSelection).not.toHaveBeenCalled();
  });

  it('Escape closes, clears the highlight and restores the typed text', () => {
    key('ArrowDown');
    key('Escape');
    expect(container().style.display).toBe('none');
    expect(selected()).toEqual([]);
    expect(input.value).toBe('par');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key('Escape');
    expect(input.value).toBe('par');
  });

  it('Tab closes the list without selecting', () => {
    key('ArrowDown');
    key('Tab');
    expect(container().style.display).toBe('none');
    expect(selected()).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('other keys are ignored', () => {
    key('ArrowDown');
    key('a');
    expect(selected()).toEqual([items()[0]]);
  });

  it('typing resets the highlight', () => {
    key('ArrowDown');
    type('pari');
    expect(selected()).toEqual([]);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    expect(input.value).toBe('pari');
  });

  it('new predictions drop the highlight and restore the typed text', () => {
    key('ArrowDown');
    dropdown.setPredictions(LIST.slice(0, 2));
    expect(selected()).toEqual([]);
    expect(input.value).toBe('par');
    expect(items()).toHaveLength(2);
  });

  it('after a selection the no-selection slot restores the selected text', () => {
    key('ArrowDown');
    onSelect.mockImplementation((p) => {
      input.value = p.description;
    });
    key('Enter');
    dropdown.setPredictions(LIST);
    key('ArrowDown');
    expect(container().style.display).toBe('');
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowUp');
    key('ArrowUp');
    expect(selected()).toEqual([]);
    expect(input.value).toBe('Paris, France');
  });

  it('a selection drops the predictions so arrows cannot reopen them', () => {
    key('ArrowDown');
    key('Enter');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(items()).toHaveLength(0);
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(container().style.display).toBe('none');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('late predictions after a selection, Escape, Tab or Enter stay hidden until the user types', () => {
    const closers: (() => void)[] = [
      () => {
        key('ArrowDown');
        key('Enter');
      },
      () => key('Escape'),
      () => key('Tab'),
      () => key('Enter'),
    ];
    for (const close of closers) {
      type('par');
      dropdown.setPredictions(LIST);
      close();
      expect(container().style.display).toBe('none');
      dropdown.setPredictions(LIST);
      expect(container().style.display).toBe('none');
      expect(input.getAttribute('aria-expanded')).toBe('false');
      type('pari');
      dropdown.setPredictions(LIST);
      expect(container().style.display).toBe('');
    }
  });

  it('a list reopened with an arrow key after it was closed stays open for late predictions', () => {
    for (const reopen of ['ArrowDown', 'ArrowUp']) {
      type('par');
      dropdown.setPredictions(LIST);
      key('Escape');
      expect(container().style.display).toBe('none');
      key(reopen);
      expect(container().style.display).toBe('');
      dropdown.setPredictions(LIST);
      expect(container().style.display).toBe('');
      expect(input.getAttribute('aria-expanded')).toBe('true');
    }
  });

  it('Escape with nothing highlighted keeps a value the page set', () => {
    input.value = 'set by page';
    key('Escape');
    expect(container().style.display).toBe('none');
    expect(input.value).toBe('set by page');
  });

  it('the Enter that commits an IME composition is ignored', () => {
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, which: 229 });
    expect(onEnterWithoutSelection).not.toHaveBeenCalled();
    expect(container().style.display).toBe('');
    key('ArrowDown');
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, which: 229 });
    expect(onSelect).not.toHaveBeenCalled();
    key('Enter');
    expect(onSelect).toHaveBeenCalledWith(LIST[0]);
  });
});

describe('createDropdown destroy', () => {
  it('removes the container, listeners and the aria attributes it added', () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    dropdown.setPredictions(LIST);
    dropdown.destroy();
    expect(document.querySelector('.pac-container')).toBeNull();
    for (const name of [
      'role',
      'aria-autocomplete',
      'aria-expanded',
      'aria-controls',
      'aria-activedescendant',
    ]) {
      expect(input.hasAttribute(name)).toBe(false);
    }
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    key('Enter');
    expect(onEnterWithoutSelection).not.toHaveBeenCalled();
    dropdown.setPredictions(LIST);
    dropdown.clear();
    dropdown.destroy();
    expect(document.querySelector('.pac-container')).toBeNull();
  });

  it('restores attributes the input already had', () => {
    const other = document.createElement('input');
    other.setAttribute('role', 'searchbox');
    other.setAttribute('aria-autocomplete', 'both');
    document.body.appendChild(other);
    const second = createDropdown(other, { onSelect() {}, onEnterWithoutSelection() {} });
    expect(other.getAttribute('role')).toBe('combobox');
    second.destroy();
    expect(other.getAttribute('role')).toBe('searchbox');
    expect(other.getAttribute('aria-autocomplete')).toBe('both');
    expect(other.hasAttribute('aria-controls')).toBe(false);
  });

  it('works for a document without a window', () => {
    const detached = document.implementation.createHTMLDocument('detached');
    const field = detached.createElement('input');
    detached.body.appendChild(field);
    const own = createDropdown(field, { onSelect() {}, onEnterWithoutSelection() {} });
    own.setPredictions(LIST);
    const list = detached.querySelector('.pac-container') as HTMLElement;
    expect(list.style.display).toBe('');
    expect(list.style.top).toBe('0px');
    own.destroy();
    expect(detached.querySelector('.pac-container')).toBeNull();
  });
});
