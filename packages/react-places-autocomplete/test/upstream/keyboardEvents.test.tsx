// Ported from react-places-autocomplete 7.3.0 src/tests/keyboardEvents.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { fireEvent } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { mountComponent, setupGoogleMock, simulateSearch } from './setup';

setupGoogleMock();

describe('keyboard events handlers', () => {
  test('pressing ArrowDown key will make the first suggestion active', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);

    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const { suggestions } = wrapper.state();
    expect(suggestions).toHaveLength(5);
    expect(suggestions[0]?.active).toEqual(true);
  });

  test('pressing ArrowUp key will make the last suggestion active', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);

    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const { suggestions } = wrapper.state();
    expect(suggestions).toHaveLength(5);
    expect(suggestions[suggestions.length - 1]?.active).toEqual(true);
  });

  test('pressing ArrowUp/ArrowDown will make activate correct suggestion item', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);

    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const { suggestions } = wrapper.state();
    expect(suggestions).toHaveLength(5);
    expect(suggestions[1]?.active).toEqual(true);
  });

  test('wraps with ArrowDown key', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);

    const input = wrapper.input();
    let { suggestions } = wrapper.state();
    expect(suggestions).toHaveLength(5);
    for (let i = 0; i < suggestions.length; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    suggestions = wrapper.state().suggestions;
    expect(suggestions[suggestions.length - 1]?.active).toEqual(true);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    suggestions = wrapper.state().suggestions;
    expect(suggestions.find((s) => s.active)).toBeUndefined();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    suggestions = wrapper.state().suggestions;
    expect(suggestions[0]?.active).toEqual(true);
  });

  test('wraps with ArrowUp key', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);

    const input = wrapper.input();
    let { suggestions } = wrapper.state();
    expect(suggestions).toHaveLength(5);
    for (let i = 0; i < suggestions.length; i++) {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    }
    suggestions = wrapper.state().suggestions;
    expect(suggestions[0]?.active).toEqual(true);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    suggestions = wrapper.state().suggestions;
    expect(suggestions.find((s) => s.active)).toBeUndefined();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    suggestions = wrapper.state().suggestions;
    expect(suggestions[suggestions.length - 1]?.active).toEqual(true);
  });

  test('pressing ESC key will clear suggestions', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);
    expect(wrapper.state().suggestions).toHaveLength(5);

    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'Escape' });
    const { suggestions } = wrapper.state();
    expect(suggestions.length).toEqual(0);
    expect(wrapper.suggestionItems()).toHaveLength(0);
  });

  test('pressing Enter key will clear suggestions', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);
    expect(wrapper.state().suggestions).toHaveLength(5);

    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'Enter' });
    const { suggestions } = wrapper.state();
    expect(suggestions.length).toEqual(0);
    expect(wrapper.suggestionItems()).toHaveLength(0);
  });
});
