import { afterEach, describe, expect, it } from 'vitest';
import { createAttribution } from '../../src/widget/attribution';
import { createDropdown } from '../../src/widget/dropdown';

function prediction(id: string, main: string): google.maps.places.AutocompletePrediction {
  return {
    description: `${main}, Somewhere`,
    place_id: id,
    matched_substrings: [],
    structured_formatting: {
      main_text: main,
      main_text_matched_substrings: [],
      secondary_text: 'Somewhere',
    },
    terms: [],
    types: [],
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('createAttribution', () => {
  it('builds the text attribution', () => {
    const element = createAttribution(document);
    expect(element.tagName).toBe('DIV');
    expect(element.className).toBe('pac-attribution');
    expect(element.textContent).toBe('Google Maps');
    expect(element.getAttribute('translate')).toBe('no');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(element.hasAttribute('tabindex')).toBe(false);
    expect(element.hasAttribute('role')).toBe(false);
    expect(element.tabIndex).toBe(-1);
    expect(element.querySelector('img, svg')).toBeNull();
    expect(element.getAttribute('style')).toBeNull();
  });

  it('is the last child of the dropdown, after every option, and not an option', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const dropdown = createDropdown(input, {
      onSelect() {},
      onEnterWithoutSelection() {},
    });
    dropdown.setPredictions([prediction('a', 'Alpha'), prediction('b', 'Beta')]);

    const container = document.querySelector('.pac-container') as HTMLElement;
    const attribution = container.lastElementChild as HTMLElement;
    expect(attribution.className).toBe('pac-attribution');
    expect(attribution.textContent).toBe('Google Maps');
    expect(container.querySelectorAll('.pac-attribution')).toHaveLength(1);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(attribution.closest('[role="option"]')).toBeNull();
    const children = Array.from(container.children);
    const options = children.filter((child) => child.getAttribute('role') === 'option');
    for (const option of options) {
      expect(children.indexOf(option)).toBeLessThan(children.indexOf(attribution));
    }
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.style.display).not.toBe('none');
  });

  it('is removed when the dropdown has no predictions', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const dropdown = createDropdown(input, {
      onSelect() {},
      onEnterWithoutSelection() {},
    });
    dropdown.setPredictions([prediction('a', 'Alpha')]);
    dropdown.setPredictions([]);
    expect(document.querySelector('.pac-attribution')).toBeNull();
  });
});
