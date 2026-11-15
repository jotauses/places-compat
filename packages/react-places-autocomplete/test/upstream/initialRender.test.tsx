// Ported from react-places-autocomplete 7.3.0 src/tests/initialRender.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { renderCompat } from '@places-compat/core/testing';
import * as React from 'react';
import { expect, test } from 'vitest';
import PlacesAutocomplete from '../../src';
import { setupGoogleMock } from './setup';

setupGoogleMock();

const DEFAULT_PROPS = {
  debounce: 200,
  highlightFirstSuggestion: false,
  onError: expect.any(Function),
  searchOptions: {},
  shouldFetchSuggestions: true,
};

const INPUT_PROPS = {
  'aria-autocomplete': 'list',
  'aria-expanded': false,
  autoComplete: 'off',
  disabled: false,
  onBlur: expect.any(Function),
  onChange: expect.any(Function),
  onKeyDown: expect.any(Function),
  role: 'combobox',
  type: 'text',
};

function defaultPropsOf(component: unknown): unknown {
  return (component as { defaultProps?: unknown }).defaultProps;
}

function expectRenderedInput(container: HTMLElement, value: string): HTMLInputElement {
  const root = container.firstElementChild as HTMLElement;
  expect(root.tagName).toBe('DIV');
  expect(Array.from(root.children).map((child) => child.tagName)).toEqual(['INPUT', 'DIV']);
  expect(root.children[1]?.childElementCount).toBe(0);

  const input = root.children[0] as HTMLInputElement;
  expect(input.getAttribute('type')).toBe('text');
  expect(input.getAttribute('autocomplete')).toBe('off');
  expect(input.getAttribute('role')).toBe('combobox');
  expect(input.getAttribute('aria-autocomplete')).toBe('list');
  expect(input.getAttribute('aria-expanded')).toBe('false');
  expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  expect(input.disabled).toBe(false);
  expect(input.value).toBe(value);
  return input;
}

test('initial render', () => {
  let state = {
    address: '',
  };
  const onChangeFunc = (newAddress: string) => {
    state = { address: newAddress };
  };
  let inputProps: unknown;

  const { container } = renderCompat(
    <PlacesAutocomplete value={state.address} onChange={onChangeFunc}>
      {({ getInputProps, suggestions, getSuggestionItemProps }) => {
        inputProps = getInputProps();
        return (
          <div>
            <input {...getInputProps()} />
            <div>
              {suggestions.map((suggestion) => (
                // biome-ignore lint/correctness/useJsxKeyInIterable: getSuggestionItemProps supplies the key
                <div {...getSuggestionItemProps(suggestion)}>
                  <span>{suggestion.description}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </PlacesAutocomplete>,
  );

  expect(defaultPropsOf(PlacesAutocomplete)).toEqual(DEFAULT_PROPS);
  expect(inputProps).toEqual({ ...INPUT_PROPS, value: '' });
  expectRenderedInput(container, '');
});

test('initial render with options to props-getter', () => {
  let state = {
    address: '',
  };
  const onChangeFunc = (newAddress: string) => {
    state = { address: newAddress };
  };
  let inputProps: unknown;

  const { container } = renderCompat(
    <PlacesAutocomplete value={state.address} onChange={onChangeFunc}>
      {({ getInputProps, suggestions, getSuggestionItemProps }) => {
        const options = {
          placeholder: 'Search Places...',
          className: 'my-input-classname',
        };
        inputProps = getInputProps(options);
        return (
          <div>
            <input {...getInputProps(options)} />
            <div>
              {suggestions.map((suggestion) => (
                // biome-ignore lint/correctness/useJsxKeyInIterable: getSuggestionItemProps supplies the key
                <div
                  {...getSuggestionItemProps(suggestion, {
                    className: 'my-suggestion-item-className',
                  })}
                >
                  <span>{suggestion.description}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </PlacesAutocomplete>,
  );

  expect(defaultPropsOf(PlacesAutocomplete)).toEqual(DEFAULT_PROPS);
  expect(inputProps).toEqual({
    ...INPUT_PROPS,
    className: 'my-input-classname',
    placeholder: 'Search Places...',
    value: '',
  });
  const input = expectRenderedInput(container, '');
  expect(input.className).toBe('my-input-classname');
  expect(input.getAttribute('placeholder')).toBe('Search Places...');
});

test('initial render with initial input value', () => {
  let state = {
    address: 'San Francisco, CA',
  };
  const onChangeFunc = (newAddress: string) => {
    state = { address: newAddress };
  };
  let inputProps: unknown;

  const { container } = renderCompat(
    <PlacesAutocomplete value={state.address} onChange={onChangeFunc}>
      {({ getInputProps, suggestions, getSuggestionItemProps }) => {
        inputProps = getInputProps();
        return (
          <div>
            <input {...getInputProps()} />
            <div>
              {suggestions.map((suggestion) => (
                // biome-ignore lint/correctness/useJsxKeyInIterable: getSuggestionItemProps supplies the key
                <div {...getSuggestionItemProps(suggestion)}>
                  <span>{suggestion.description}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </PlacesAutocomplete>,
  );

  expect(defaultPropsOf(PlacesAutocomplete)).toEqual(DEFAULT_PROPS);
  expect(inputProps).toEqual({ ...INPUT_PROPS, value: 'San Francisco, CA' });
  expectRenderedInput(container, 'San Francisco, CA');
});
