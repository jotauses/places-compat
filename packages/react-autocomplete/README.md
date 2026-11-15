# @places-compat/react-autocomplete

A replacement for react-google-autocomplete 2.7.5 that runs on the Places API (New). You install it under the original name and keep your imports. What behaves differently is listed under [Differences from the original](#differences-from-the-original).

## Before you switch

This package keeps the imports, props, hook arguments and return values of react-google-autocomplete 2.7.5. Code that relies on one of the behaviours in [Differences from the original](#differences-from-the-original) needs a change. Your Google Cloud setup and your bill can change too, so check the following first.

Enable Places API (New) in the Google Cloud project that owns your API key. The package only calls the new API and has no fallback to the legacy Places API, so requests fail if Places API (New) is off for the key.

Load version 3.57.2 or later of the Maps JavaScript API. `AutocompleteSuggestion` first shipped in that version. With an older pinned version, or with test mocks that only provide the legacy classes, the widget logs `Google maps places API must be loaded.` followed by the line `Places API (New) must be enabled and the Maps JavaScript API must be version 3.57.2 or later.`

Install the package under the original name so that existing imports keep working:

```sh
npm i react-google-autocomplete@npm:@places-compat/react-autocomplete
pnpm add react-google-autocomplete@npm:@places-compat/react-autocomplete
yarn add react-google-autocomplete@npm:@places-compat/react-autocomplete
```

If another dependency of yours also depends on react-google-autocomplete, add an override. With npm, it goes in your root `package.json` and must match the spec that npm wrote under `dependencies`, or npm stops with `EOVERRIDE`. The `$` form points the override at that spec:

```json
{
  "overrides": {
    "react-google-autocomplete": "$react-google-autocomplete"
  }
}
```

With pnpm, put the override in `pnpm-workspace.yaml`. Older pnpm versions read it from `pnpm.overrides` in `package.json` instead.

```yaml
overrides:
  react-google-autocomplete: npm:@places-compat/react-autocomplete
```

With Yarn, use `resolutions` in `package.json`. The `npm:` form inside `resolutions` has not been tested with Yarn yet.

```json
{
  "resolutions": {
    "react-google-autocomplete": "npm:@places-compat/react-autocomplete"
  }
}
```

### Costs

Requests are billed under the Places API (New) SKUs. The widget opens an autocomplete session when the user starts typing and closes it when it fetches the details of the chosen place. The fields you ask for decide the price of the whole session. Once the details of a place are fetched with the token, a new details request for that place or for any other prediction of the same session goes out without a token and is billed as a request outside any session, until a search with a new token returns that place again.

The default `options.fields` are `address_components`, `geometry.location`, `place_id` and `formatted_address`. They map to Essentials fields plus the place ID. When a session ends with Essentials fields, the first 12 autocomplete requests of the session are billed and the rest are free.

`name` is a Pro field. If `options.fields` or the `fields` of a `placesService.getDetails` call include it, the session is billed at the Place Details Enterprise + Atmosphere rate, whatever the other fields are. The same happens with any other Pro, Enterprise or Atmosphere field.

A details request with no `fields`, with an empty list or with `['ALL']` asks for every field the package can map, which is billed at the highest rate. This applies to `placesService.getDetails` and to `options.fields: []` on the widget. If you add fields, list only the ones you read.

A session that ends with only `place_id` costs the same as no session. A session the user abandons, and every request sent without a session token, is billed per request. `usePlacesAutocompleteService` sends a token only when you pass `sessionToken: true`. A `placesService.getDetails` call for one of its predictions ends that session, so call `refreshSessionToken()` afterwards to start a new one for the next search.

## Usage

The imports, props, hook arguments and return values are those of react-google-autocomplete 2.7.5.

```jsx
import Autocomplete, { usePlacesWidget } from 'react-google-autocomplete';
import usePlacesService from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
```

The component renders an `<input>` and passes any other prop to it:

```jsx
<Autocomplete
  apiKey={YOUR_API_KEY}
  onPlaceSelected={(place, input, autocomplete) => console.log(place.formatted_address)}
  options={{ componentRestrictions: { country: 'fr' } }}
  defaultValue="Paris"
/>
```

`usePlacesWidget` takes the same props and gives you a ref for your own input:

```jsx
function AddressInput() {
  const { ref, autocompleteRef } = usePlacesWidget({
    apiKey: YOUR_API_KEY,
    onPlaceSelected: (place) => console.log(place),
  });
  return <input ref={ref} />;
}
```

`autocompleteRef.current` has the methods of `google.maps.places.Autocomplete` that the original exposed: `getPlace`, `getBounds`, `getFields`, `setBounds`, `setComponentRestrictions`, `setFields`, `setOptions`, `setTypes` and `addListener('place_changed', handler)`. It is a plain object, so `instanceof google.maps.places.Autocomplete` is false and `google.maps.event` has no effect on it.

`usePlacesAutocompleteService` returns predictions, a debounced request function and the two services:

```jsx
function Search() {
  const {
    placesService,
    placePredictions,
    getPlacePredictions,
    isPlacePredictionsLoading,
    refreshSessionToken,
  } = usePlacesService({ apiKey: YOUR_API_KEY, debounce: 300, sessionToken: true });

  const choose = (prediction) =>
    placesService?.getDetails(
      { placeId: prediction.place_id, fields: ['formatted_address', 'geometry'] },
      (details, status) => {
        console.log(status, details);
        refreshSessionToken();
      },
    );

  return (
    <>
      <input onChange={(e) => getPlacePredictions({ input: e.target.value })} />
      {isPlacePredictionsLoading && <span>Loading</span>}
      {placePredictions.map((p) => (
        <button key={p.place_id} type="button" onClick={() => choose(p)}>
          {p.description}
        </button>
      ))}
    </>
  );
}
```

`placesService` supports `getDetails` only. Its other methods (`textSearch`, `nearbySearch`, `findPlaceFromQuery`, `findPlaceFromPhoneNumber`) throw an `Error`, because the package has no Places API (New) implementation for them. `getQueryPredictions` returns place predictions.

### Loading the script

With `apiKey`, the package adds the same script tag as the original (`https://maps.googleapis.com/maps/api/js?libraries=places&key=...`), unless a script from that base URL is already on the page. Without `apiKey`, load the Maps JavaScript API yourself. If `google.maps` exists but `google.maps.places` does not when the widget mounts, the package calls `google.maps.importLibrary('places')`. A script loaded with `loading=async` therefore works, as long as it has run before the widget mounts.

## The dropdown

Google's widget used to draw the list of predictions. This package draws its own list with plain DOM and gives it the class names of Google's widget, so CSS written for the old list keeps matching.

| Class | Element |
| --- | --- |
| `pac-target-input` | Added to the input when the widget attaches. |
| `pac-container` | The list. One `div` per input, appended to `document.body`. |
| `pac-item` | One prediction. |
| `pac-item-selected` | The highlighted prediction. |
| `pac-icon`, `pac-icon-marker` | The marker icon at the start of each prediction. |
| `pac-item-query` | The main text of the prediction. The secondary text follows it in a `span` without a class. |
| `pac-matched` | The part of the main text that matches what the user typed. |
| `pac-attribution` | The `Google Maps` line at the bottom of the list. |

The list opens when predictions arrive and closes when there are none. The arrow keys move the highlight and show the highlighted text in the input, Enter selects, Escape closes the list and restores what the user typed, and Tab closes it. The input gets `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`, and each prediction has `role="option"`.

### Base styles

When the first widget on a page attaches, the package adds one `<style data-places-compat>` element as the first child of `<head>`. Every other stylesheet on the page comes after it, so your rules win over the base rules whenever their specificity is equal. Nothing is injected when the module is imported or during server rendering.

Override the base styles with ordinary rules:

```css
.pac-container {
  border-radius: 8px;
  font-family: inherit;
}

.pac-item {
  font-size: 14px;
  line-height: 36px;
}

.pac-item-selected,
.pac-item-selected:hover {
  background-color: #e8f0fe;
}
```

The widget positions `.pac-container` under the input with inline styles for `position`, `top`, `left`, `width`, `display` and `z-index` (1000). To change one of these, such as the `z-index` inside a modal, use `!important`:

```css
.pac-container {
  z-index: 2000 !important;
}
```

### Attribution

Google's policies for the Places API (New) require an attribution when predictions are shown outside a Google map. The list ends with a `.pac-attribution` line that reads `Google Maps` whenever it shows predictions. The base style is 12px Roboto in `#5E5E5E` on white. You can restyle it within Google's attribution guidelines, but keep it visible: do not hide it, cover it, translate it or remove it with CSS. No prop turns it off.

## Testing your app

Mocks of `google.maps.places.Autocomplete`, `AutocompleteService` or `PlacesService`, written by hand or taken from a mocking library, no longer drive the widget or the hooks. The package never constructs those classes. With such a mock in place, the widget logs `Google maps places API must be loaded.`

Install a fake of the classes the package does call instead: `AutocompleteSuggestion.fetchAutocompleteSuggestions`, `AutocompleteSessionToken` and `Place` with `fetchFields`. This one fits in a Jest or Vitest setup file:

```js
export function installFakePlaces({ suggestions = [], details = {} } = {}) {
  const text = (value) => (value == null ? null : { text: value, matches: [] });

  class AutocompleteSessionToken {}

  class Place {
    constructor({ id }) {
      this.id = id;
    }

    async fetchFields({ fields }) {
      const found = details[this.id];
      if (!found) throw Object.assign(new Error('Place not found'), { code: 'NOT_FOUND' });
      for (const field of fields) {
        if (field in found) this[field] = found[field];
      }
      return { place: this };
    }
  }

  const AutocompleteSuggestion = {
    async fetchAutocompleteSuggestions(request) {
      const input = request.input.toLowerCase();
      return {
        suggestions: suggestions
          .filter((s) => s.text.toLowerCase().includes(input))
          .map((s) => ({
            placePrediction: {
              placeId: s.placeId,
              text: text(s.text),
              mainText: text(s.mainText),
              secondaryText: text(s.secondaryText),
              types: s.types || [],
              distanceMeters: null,
              toPlace: () => new Place({ id: s.placeId }),
            },
          })),
      };
    },
  };

  const previous = globalThis.google;
  globalThis.google = {
    maps: {
      api: {},
      places: { AutocompleteSuggestion, AutocompleteSessionToken, Place },
    },
  };
  return () => {
    if (previous === undefined) delete globalThis.google;
    else globalThis.google = previous;
  };
}
```

`details` is keyed by place ID and uses the property names of `google.maps.places.Place`, such as `formattedAddress`, `location` and `addressComponents`. The package turns them into the legacy `PlaceResult` that `onPlaceSelected` receives. The `api` key matters when your components pass `apiKey`: with `google.maps.api` set, the package skips the script tag, which would never load in jsdom.

A test with React Testing Library:

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Autocomplete from 'react-google-autocomplete';
import { installFakePlaces } from './fake-places';

let uninstall;

beforeEach(() => {
  uninstall = installFakePlaces({
    suggestions: [
      { placeId: 'paris', text: 'Paris, France', mainText: 'Paris', secondaryText: 'France' },
    ],
    details: {
      paris: {
        formattedAddress: 'Paris, France',
        location: { lat: () => 48.8566, lng: () => 2.3522 },
        addressComponents: [{ longText: 'Paris', shortText: 'Paris', types: ['locality'] }],
      },
    },
  });
});

afterEach(() => uninstall());

test('reports the chosen place', async () => {
  const onPlaceSelected = jest.fn();
  render(<Autocomplete apiKey="test-key" onPlaceSelected={onPlaceSelected} />);

  const input = await screen.findByRole('combobox');
  fireEvent.input(input, { target: { value: 'par' } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: /Paris/ }));

  await waitFor(() => expect(onPlaceSelected).toHaveBeenCalled());
  expect(onPlaceSelected.mock.calls[0][0].formatted_address).toBe('Paris, France');
});
```

With Vitest, use `vi.fn()` in place of `jest.fn()`. Keep these points in mind when you port existing tests:

- The widget listens for `input` events. Use `fireEvent.input` or `userEvent.type`; `fireEvent.change` does not reach it.
- A prediction is selected on `mousedown`, or with the arrow keys and Enter.
- `onPlaceSelected` runs after `fetchFields` resolves, so wait for it with `waitFor` or a `findBy` query.
- With `apiKey`, the widget attaches after the script promise resolves, so find the input with `findByRole('combobox')`.

## Differences from the original

`RGA-` ids are specific to this package. `CORE-` ids come from the code that the three places-compat packages share, and only the ones that apply to this package are listed. The Test column says what covers each row: a test file, with its path relative to the package folder in the source repository; `allowlist`, for a difference that the comparison tests against the original package accept by id; or `doc`, for a row that no automated test covers.

| ID | Difference | Why | Test |
| --- | --- | --- | --- |
| RGA-01 | `autocompleteRef.current` is a plain object with the `Autocomplete` methods the original exposed. It fails `instanceof google.maps.places.Autocomplete`, is not an `MVCObject` and has no `bindTo`, `get` or `set`. | The legacy widget cannot be used with Places API (New), so the package builds its own on top of the new classes. | test:test/widget/shim.test.ts |
| RGA-02 | `google.maps.event.addListener` and `google.maps.event.clearInstanceListeners` have no effect on the widget. Use `addListener('place_changed', handler)` on the widget itself. | `google.maps.event` only works with Maps objects, and the widget is not one. | test:test/widget/shim.test.ts |
| RGA-03 | The package draws its own dropdown with plain DOM, using the `.pac-*` class names, and injects a small base stylesheet as the first child of `<head>`. | The original relied on Google's widget to draw the list, and that widget only works with the legacy API. | test:test/widget/dropdown.test.ts |
| RGA-04 | `place_changed` fires asynchronously, after `Place.fetchFields` resolves. Enter without a highlighted prediction still fires it at once with `{ name }`. | The new API returns place details through a promise. | test:test/widget/shim.test.ts |
| RGA-05 | `getQueryPredictions` returns place predictions. | Places API (New) has no query predictions. | test:test/usePlacesAutocompleteService.test.tsx |
| RGA-06 | The `placesService` returned by `usePlacesAutocompleteService` only implements `getDetails`. `textSearch`, `nearbySearch`, `findPlaceFromQuery` and `findPlaceFromPhoneNumber` throw an `Error` that names the method. | The package does not call the legacy `PlacesService`, and these methods have no implementation on Places API (New) here. | test:test/usePlacesAutocompleteService.test.tsx |
| RGA-07 | `usePlacesAutocompleteService` re-renders once its services are ready, and each request reads the current `options` and `sessionToken`. | The original kept the services in a ref without a state change, so they stayed `null` until something else rendered, and its debounced request kept the options of the first render. | test:test/usePlacesAutocompleteService.test.tsx |
| RGA-08 | `lib/usePlacesService` re-exports `usePlacesAutocompleteService`. | The original package ships `lib/usePlacesService.js` as a leftover build of an older version of the hook, with no source file and no types. Re-exporting the current hook keeps that import path working. | test:test/exports.test.ts |
| RGA-09 | The dropdown ends with a `Google Maps` text attribution, shown whenever it lists predictions. It cannot be turned off. | Google's policies require an attribution when Places predictions are shown outside a Google map. | test:test/widget/attribution.test.ts |
| RGA-11 | When the `google` global is missing, `usePlacesAutocompleteService` logs `Google has not been found. Make sure your provide apiKey prop.`, and when `google.maps.places` is missing it logs `Google maps places API must be loaded.`. The original threw a `ReferenceError` or a `TypeError` in these cases. `refreshSessionToken()` does nothing until the library has loaded instead of throwing. | The hook checks for the library the same way the widget does and logs the same messages. A thrown error would unmount the component that uses the hook. | test:test/usePlacesAutocompleteService.test.tsx |
| CORE-01 | The `terms` of each prediction are built by splitting `description` on `", "`. | The new API returns no terms. | test:../core/test/terms.test.ts |
| CORE-02 | Statuses such as `OK` and `ZERO_RESULTS` come from a mapping table. Error codes from the new API are mapped to the legacy statuses on a best-effort basis. | The new API resolves or rejects a promise and has no status field. | test:../core/test/status.test.ts |
| CORE-03 | `types` filters on the primary type of each place. `['address']` is approximated with `street_address`, `premise`, `subpremise` and `route`. | The new API filters on primary types and has no `address` collection. | test:../core/test/request.test.ts |
| CORE-04 | Ranking can differ, and a search returns at most five predictions. | The new API ranks results its own way and caps the number of suggestions at five. | doc |
| CORE-05 | `secondary_text` is `''` when the new API leaves out the secondary text. | The new API omits the secondary text for some predictions. | test:../core/test/prediction.test.ts |
| CORE-06 | The `types` of each prediction use the place types of Table A and Table B. | The new API reports place types from those tables. | test:../core/test/prediction.test.ts |
| CORE-07 | Requests are billed under the Places API (New) SKUs, which must be enabled for your key. There is no fallback to the legacy API. | The package only calls the new API. | doc |
| CORE-08 | `matched_substrings` can come from the matches in the main text. | The new API can leave the matches of the full text empty. | test:../core/test/prediction.test.ts |
| CORE-09 | Components render a different number of times, and the loading state changes at different moments. | Requests go through promises and a different call sequence. | doc |
| CORE-10 | Test mocks of the legacy classes (`AutocompleteService`, `PlacesService`, `Autocomplete`) no longer drive the package. | The package calls the new classes and never uses the legacy ones. | doc |
| CORE-11 | The Places library is loaded through `importLibrary('places')` when it is not on `google.maps` yet, and the Maps JavaScript API must be version 3.57.2 or later. If the library loads without the new classes (an older pinned version, or legacy mocks), the original error message gets an extra line that says Places API (New) must be enabled and the Maps JavaScript API must be version 3.57.2 or later. If the Places library is missing, the original message is unchanged. | The new classes are only available through `importLibrary` and from that version on. | test:../core/test/loader.test.ts |
| CORE-12 | Legacy place detail fields with no counterpart in the new API, such as `utc_offset` and `permanently_closed`, are not returned. | Those fields have no successor in the new API. | test:../core/test/fields.test.ts |
| CORE-13 | A details request with no `fields`, an empty list or `['ALL']` asks for every field the package can map, which Google bills at the highest rate. | The new API requires an explicit field list. | test:../core/test/fields.test.ts |
| CORE-14 | A details request sends the session token, and so closes the session, only when the place is in the registry of live predictions and its language and region match the session. Once the details of a place are fetched successfully with the token, every prediction of that session leaves the registry. A later details request for any of them is sent without a token and billed as a request outside any session. A later search with the same token adds nothing to the registry, and a search with a new token puts its places back. While a details request that uses the token of a session is in flight, any other details request for a prediction of that session, the same place included, is sent without a token. | In the new API, fetching a place with the session token ends the session, and Google asks not to reuse the token of a closed session. | test:../core/test/session.test.ts |
| CORE-15 | Some request keys are dropped: unknown keys, an `offset` outside the input, a `location` with no `radius` and a `radius` with no `location`. When a bias and a restriction are both given, the restriction wins. | The new request has no field for these values and takes only one of bias or restriction. | test:../core/test/request.test.ts |
| CORE-16 | Region `'uk'` is sent as `'gb'`. | The new API expects CLDR region codes. | test:../core/test/request.test.ts |

## Google Maps Platform

This package works with Google Maps Platform. It is not affiliated with or endorsed by Google. Google Maps and Google Maps Platform are trademarks of Google LLC.

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
