// @vitest-environment node
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlacesAutocomplete, * as ours from '../../src/index';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;

describe('in a Node environment', () => {
  it('runs without window or document', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('imports every export', () => {
    const component = PlacesAutocomplete as unknown as {
      prototype: { isReactComponent?: unknown };
      propTypes?: object;
      defaultProps?: object;
    };
    expect(Object.keys(ours).sort()).toEqual([
      'default',
      'geocodeByAddress',
      'geocodeByPlaceId',
      'getLatLng',
    ]);
    expect(component.prototype.isReactComponent).toBeDefined();
    expect(component.propTypes).toEqual(expect.any(Object));
    expect(component.defaultProps).toEqual(expect.any(Object));
    expect(typeof ours.geocodeByAddress).toBe('function');
    expect(typeof ours.geocodeByPlaceId).toBe('function');
    expect(typeof ours.getLatLng).toBe('function');
  });

  it('renders on the server', () => {
    const children: Props['children'] = ({ getInputProps }) =>
      React.createElement('input', getInputProps());
    const html = renderToString(
      React.createElement(PlacesAutocomplete, { value: 'Paris', onChange: () => {}, children }),
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('value="Paris"');
  });
});
