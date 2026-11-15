import * as React from 'react';
import { renderToString } from 'react-dom/server';
import * as upstream from 'upstream-rpa';
import { afterEach, describe, expect, it } from 'vitest';
import PlacesAutocomplete from '../../src/index';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;

const CALLBACK = 'initPlacesOnServer';
const globals = window as unknown as Record<string, unknown>;
const Upstream = upstream.default as unknown as typeof PlacesAutocomplete;

const children: Props['children'] = ({ getInputProps, suggestions, loading }) => (
  <div>
    <input {...getInputProps({ placeholder: 'Search places' })} />
    {loading ? <span>loading</span> : null}
    <span>{suggestions.length}</span>
  </div>
);

function markup(Component: typeof PlacesAutocomplete, extra: Partial<Props> = {}): string {
  return renderToString(
    <Component value="Paris" onChange={() => {}} {...extra}>
      {children}
    </Component>,
  );
}

describe('renderToString', () => {
  let reads = 0;

  afterEach(() => {
    delete globals.google;
    delete globals[CALLBACK];
  });

  function trapGoogle(): void {
    reads = 0;
    Object.defineProperty(window, 'google', {
      configurable: true,
      get() {
        reads += 1;
        return undefined;
      },
    });
  }

  it('renders the input without reading window.google', () => {
    trapGoogle();
    const html = markup(PlacesAutocomplete);

    expect(reads).toBe(0);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('value="Paris"');
    expect(html).toContain('placeholder="Search places"');
    expect(html).not.toContain('disabled');
  });

  it('renders a disabled input with googleCallbackName and registers no callback', () => {
    trapGoogle();
    const html = markup(PlacesAutocomplete, { googleCallbackName: CALLBACK });

    expect(reads).toBe(0);
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(globals[CALLBACK]).toBeUndefined();
  });

  it('produces the same markup as react-places-autocomplete 7.3.0', () => {
    expect(markup(PlacesAutocomplete)).toBe(markup(Upstream));
    expect(markup(PlacesAutocomplete, { googleCallbackName: CALLBACK })).toBe(
      markup(Upstream, { googleCallbackName: CALLBACK }),
    );
  });
});
