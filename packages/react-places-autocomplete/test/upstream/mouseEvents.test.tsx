// Ported from react-places-autocomplete 7.3.0 src/tests/mouseEvents.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { fireEvent } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { mountComponent, setupGoogleMock, simulateSearch } from './setup';

setupGoogleMock();

describe('mouse event handlers', () => {
  test('suggesion item handles mouse enter and leave event', async () => {
    const wrapper = mountComponent();
    await simulateSearch(wrapper);

    const suggestionItem = wrapper.suggestionItems()[0] as HTMLElement;
    fireEvent.mouseEnter(suggestionItem);
    let { suggestions } = wrapper.state();
    expect(suggestions[0]?.active).toEqual(true);

    fireEvent.mouseLeave(suggestionItem);
    suggestions = wrapper.state().suggestions;
    expect(suggestions[0]?.active).toEqual(false);
  });
});
