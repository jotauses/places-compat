// Ported from react-places-autocomplete 7.3.0 src/tests/onSelectProp.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { mockSuggestions, mountComponent, setupGoogleMock, simulateSearch } from './setup';

setupGoogleMock();

const firstMockSuggestion = { ...mockSuggestions[0], id: undefined };

describe('onSelect prop', () => {
  test('click on suggestion item will call onSelect handler', async () => {
    const onSelectHandler = vi.fn();
    const wrapper = mountComponent({ onSelect: onSelectHandler });
    await simulateSearch(wrapper);

    const suggestionItem = wrapper.suggestionItems()[0] as HTMLElement;
    fireEvent.click(suggestionItem);
    expect(onSelectHandler).toHaveBeenCalledTimes(1);
  });

  test('pressing Enter key will call onSelect handler', () => {
    const onSelectHandler = vi.fn();
    const wrapper = mountComponent({
      value: 'San Francisco',
      onSelect: onSelectHandler,
    });

    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectHandler).toHaveBeenCalledTimes(1);
    expect(onSelectHandler).toBeCalledWith('San Francisco', null, null);
  });

  test('pressing Enter when one of the suggestion items is active', async () => {
    const onSelectHandler = vi.fn();
    const wrapper = mountComponent({
      onSelect: onSelectHandler,
    });

    await simulateSearch(wrapper);
    const input = wrapper.input();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const activeMockSuggestion = {
      ...firstMockSuggestion,
      active: true,
    };

    expect(onSelectHandler).toHaveBeenCalledTimes(1);
    expect(onSelectHandler).toBeCalledWith(
      activeMockSuggestion.description,
      activeMockSuggestion.placeId,
      activeMockSuggestion,
    );
  });

  test('pressing Enter when mouse hovers over one of the suggestion items', async () => {
    const onSelectHandler = vi.fn();
    const wrapper = mountComponent({
      onSelect: onSelectHandler,
    });

    await simulateSearch(wrapper);
    const suggestionItem = wrapper.suggestionItems()[0] as HTMLElement;
    const input = wrapper.input();
    fireEvent.mouseEnter(suggestionItem);
    fireEvent.keyDown(input, { key: 'Enter' });

    const activeMockSuggestion = {
      ...firstMockSuggestion,
      active: true,
    };

    expect(onSelectHandler).toHaveBeenCalledTimes(1);
    expect(onSelectHandler).toBeCalledWith(
      activeMockSuggestion.description,
      activeMockSuggestion.placeId,
      activeMockSuggestion,
    );
  });

  test('clicking on a suggestion will call onSelect handler with the correct arguments', async () => {
    const onSelectHandler = vi.fn();
    const wrapper = mountComponent({
      onSelect: onSelectHandler,
    });

    await simulateSearch(wrapper);
    const suggestionItem = wrapper.suggestionItems()[0] as HTMLElement;
    fireEvent.mouseEnter(suggestionItem);
    fireEvent.click(suggestionItem);

    const activeMockSuggestion = {
      ...firstMockSuggestion,
      active: true,
    };

    expect(onSelectHandler).toHaveBeenCalledTimes(1);
    expect(onSelectHandler).toBeCalledWith(
      activeMockSuggestion.description,
      activeMockSuggestion.placeId,
      activeMockSuggestion,
    );
  });
});
