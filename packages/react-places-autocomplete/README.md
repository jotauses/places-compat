# @places-compat/react-places-autocomplete

A replacement for react-places-autocomplete 7.3.0 that gets its predictions from the Places API (New). You install it under the original name and keep your imports. What behaves differently is listed under [Differences from the original](#differences-from-the-original).

## Before you switch

Enable Places API (New) in the Google Cloud project that owns your API key. The component asks only the new API for predictions and never calls the legacy Places API. According to Google's documentation, the new API rejects requests when Places API (New) is not enabled for the key, so with only the legacy API enabled every search ends in `onError`. The geocoding helpers still use `google.maps.Geocoder`, which Google's documentation says needs the Geocoding API, as before.

The component needs `google.maps.places.AutocompleteSuggestion`, so load the Maps JavaScript API at version 3.57.2 or later. If an older version is pinned, or only the legacy Places library is available, the component reports its original Places error with this extra line:

```text
Places API (New) must be enabled and the Maps JavaScript API must be version 3.57.2 or later.
```

Install the package under the original name with an npm alias, so existing imports of `react-places-autocomplete` keep working:

```sh
npm i react-places-autocomplete@npm:@places-compat/react-places-autocomplete
pnpm add react-places-autocomplete@npm:@places-compat/react-places-autocomplete
yarn add react-places-autocomplete@npm:@places-compat/react-places-autocomplete
```

If another dependency pulls in react-places-autocomplete, override it too. With npm, add `overrides` to your root `package.json`. The override must use the same specification as your direct dependency, or npm stops with `EOVERRIDE`. The `$` form points it at that specification:

```json
{
  "overrides": {
    "react-places-autocomplete": "$react-places-autocomplete"
  }
}
```

With pnpm, in `pnpm-workspace.yaml` (older pnpm versions read the same map from `pnpm.overrides` in `package.json`):

```yaml
overrides:
  react-places-autocomplete: npm:@places-compat/react-places-autocomplete
```

Yarn takes the same map under `resolutions` in `package.json`. That setup has not been tested.

The types ship inside the package, so remove `@types/react-places-autocomplete`:

```sh
npm rm @types/react-places-autocomplete
```

## Usage

The API is the same as in react-places-autocomplete 7.3.0. The script tag from the original README still works:

```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"></script>
```

```jsx
import React, { useState } from 'react';
import PlacesAutocomplete, { geocodeByAddress, getLatLng } from 'react-places-autocomplete';

function LocationSearchInput() {
  const [address, setAddress] = useState('');

  const handleSelect = (selected) => {
    setAddress(selected);
    geocodeByAddress(selected)
      .then((results) => getLatLng(results[0]))
      .then((latLng) => console.log('Success', latLng))
      .catch((error) => console.error('Error', error));
  };

  return (
    <PlacesAutocomplete value={address} onChange={setAddress} onSelect={handleSelect}>
      {({ getInputProps, suggestions, getSuggestionItemProps, loading }) => (
        <div>
          <input {...getInputProps({ placeholder: 'Search Places ...' })} />
          <div>
            {loading && <div>Loading...</div>}
            {suggestions.map((suggestion) => {
              const { key, ...itemProps } = getSuggestionItemProps(suggestion, {
                className: suggestion.active ? 'suggestion-item--active' : 'suggestion-item',
              });
              return (
                <div key={key} {...itemProps}>
                  {suggestion.description}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PlacesAutocomplete>
  );
}
```

Taking `key` out of the item props before spreading them avoids the warning React 18.3 and 19 print for a spread `key`. Spreading everything, as the original README does, still works and prints that warning.

## What stays the same

- The default export is still a class component, so refs to the instance keep working.
- Props, `propTypes` and default props are unchanged, and the render prop gets the same arguments. What `suggestion` and the item props hold changes as RPA-01 to RPA-03 describe.
- Keyboard, mouse, touch and blur handling follow 7.3.0.
- `onError(status, clearSuggestions)` runs for every status other than `OK`, `ZERO_RESULTS` included, and leaves the suggestions as they were.
- Error messages keep their original text, apart from the extra line of CORE-11, and `googleCallbackName` works as before.
- `geocodeByAddress`, `geocodeByPlaceId` and `getLatLng` still call `google.maps.Geocoder`.

## Differences from the original

The changes most code will notice:

- `suggestion.id` is `undefined` (RPA-01). Item props take `key` from `placeId` (RPA-02), and each item gets its own DOM id (RPA-03).
- Predictions arrive after a promise, so the number of renders and the timing of `loading` change (CORE-09).
- Suggestions are built from the new API's place predictions. `terms` come from splitting the description on `", "` (CORE-01), `secondaryText` can be `''` (CORE-05), ranking can differ and a search returns at most five (CORE-04).
- `searchOptions` is mapped to the new request. `types` filters on the primary type (CORE-03), some keys are dropped (CORE-15) and region `uk` is sent as `gb` (CORE-16).
- If the page loads the Maps JavaScript API without `libraries=places`, the component loads Places through `importLibrary`. A search typed in the meantime runs once Places is ready, with the current value, and a load failure is logged with `console.error` (RPA-05). When Places lacks the new classes, the Places error message ends with the extra line shown above (CORE-11).
- On unmount the pending search is cancelled and late responses are ignored (RPA-07).
- Mocks of `google.maps.places.AutocompleteService` no longer drive the component (CORE-10). See [Testing your app](#testing-your-app).
- RPA-04, RPA-06, RPA-08, RPA-09 and RPA-10 cover smaller changes: a check moved into a `setState` callback, the error for a missing `google.maps`, internal instance fields, packaging and types.

`RPA-` ids are specific to this package. `CORE-` ids come from the code that the three places-compat packages share, and only the ones that apply to this package are listed. The Test column says what covers each row: a test file, with its path relative to the package folder in the source repository; `allowlist`, for a difference that the comparison tests against the original package accept by id; or `doc`, for a row that no automated test covers.

| ID | Difference | Why | Test |
| --- | --- | --- | --- |
| RPA-01 | `suggestion.id` is `undefined`. | The new API has no prediction id. | allowlist |
| RPA-02 | `getSuggestionItemProps` returns `key: suggestion.placeId`, as upstream master does. React 18.3 and 19 still warn when a props object that contains `key` is spread into JSX, so take `key` out and pass it on its own. | 7.3.0 used `suggestion.id`, which is now `undefined` (RPA-01). | allowlist |
| RPA-03 | Each suggestion item gets its own DOM id, `PlacesAutocomplete__suggestion-<placeId>`. In 7.3.0 every item got the id of the active suggestion, or `undefined` when none was active. | `aria-activedescendant` on the input then points at the active item, and no two items share an id. | allowlist |
| RPA-04 | `handleInputChange` clears the suggestions for an empty value and checks `shouldFetchSuggestions` in its `setState` callback, as upstream master does. | The check reads the props of the render that follows the change, so a rule such as `shouldFetchSuggestions={value.length > 2}` applies on the keystroke that crosses the limit. | test:test/component/search.test.tsx |
| RPA-05 | When the Places library is missing and `google.maps.importLibrary` exists, the component loads Places asynchronously. Searches requested before Places is ready run once it is, with the current `value`. If loading fails, the Places error message is logged with `console.error` and nothing is thrown. | A page that loads the Maps JavaScript API without `libraries=places` can only reach the new classes through `importLibrary` (CORE-11). An error thrown after a promise settles would not reach an error boundary. | test:test/component/init.test.tsx |
| RPA-06 | When `window.google` exists without `google.maps`, `init()` throws the Places error message. 7.3.0 threw a `TypeError` while reading `google.maps.places`. | The component checks `google.maps` before it reads from it. | test:test/component/init.test.tsx |
| RPA-07 | On unmount the pending debounced search is cancelled and responses that arrive later are ignored. When React mounts the same instance again, as StrictMode, Suspense and Activity do, a response that arrived in between is applied then. | 7.3.0 kept the timer running, so a late response could call `setState` and `onError` on an unmounted component. | test:test/component/search.test.tsx |
| RPA-08 | The instance has no `autocompleteService` or `autocompleteOK` fields. `autocompleteCallback` takes one `{ status, predictions }` object instead of the arguments `(predictions, status)`. | The component asks the new API for predictions through the core and never creates an `AutocompleteService`. | doc |
| RPA-09 | The package ships ESM and CommonJS builds and no UMD bundle. The React peer range is `>=16.8.0`, where 7.3.0 declared `>=0.14.7`. `lodash.debounce` is no longer a dependency. | The debounce comes from the core, and every package in this repository declares the same React range. | doc |
| RPA-10 | Types ship inside the package. They are a copy of `@types/react-places-autocomplete` 7.2.14 with its inaccuracies, and `@types/google.maps` is a dependency. Remove `@types/react-places-autocomplete` from your project. | TypeScript reads the types from the package itself, so the separate types package is no longer used. Existing code keeps the types it was written against. | test:test/types/exports.test-d.ts |
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
| CORE-15 | Some request keys are dropped: unknown keys, an `offset` outside the input, a `location` with no `radius` and a `radius` with no `location`. When a bias and a restriction are both given, the restriction wins. | The new request has no field for these values and takes only one of bias or restriction. | test:../core/test/request.test.ts |
| CORE-16 | Region `'uk'` is sent as `'gb'`. | The new API expects CLDR region codes. | test:../core/test/request.test.ts |

## Billing and session tokens

Searches are billed under the Places API (New) SKUs (CORE-07). This package never creates a session token. When you pass one in `searchOptions.sessionToken`, it is sent with each request, and you decide when to start a new one. The geocoding helpers do not take a session token. See Google's pricing pages for how tokens change what you pay.

## Testing your app

A jest mock of `google.maps.places.AutocompleteService` no longer reaches the component. The component calls `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)` and reads these fields from each `suggestion.placePrediction`: `placeId`, `text.text`, `text.matches`, `mainText`, `secondaryText`, `types` and `distanceMeters`. An empty `suggestions` list reaches `onError` as `ZERO_RESULTS`, and a rejected promise reaches it with a status mapped from the error's `code` (CORE-02).

This fake covers the component and the geocoding helpers. Install it before the component mounts, because the component reads `window.google` at mount:

```js
const PLACES = [
  {
    placeId: 'fake-place-san-francisco',
    mainText: 'San Francisco',
    secondaryText: 'CA, USA',
    location: { lat: 37.7749295, lng: -122.4194155 },
  },
  {
    placeId: 'fake-place-san-jose',
    mainText: 'San Jose',
    secondaryText: 'CA, USA',
    location: { lat: 37.3382082, lng: -121.8863286 },
  },
];

const fullText = (place) => `${place.mainText}, ${place.secondaryText}`;

function toSuggestion(place, input) {
  const match = { startOffset: 0, endOffset: input.length };
  return {
    placePrediction: {
      placeId: place.placeId,
      text: { text: fullText(place), matches: [match] },
      mainText: { text: place.mainText, matches: [match] },
      secondaryText: { text: place.secondaryText, matches: [] },
      types: ['locality', 'political', 'geocode'],
      distanceMeters: null,
    },
  };
}

function installFakeGoogle() {
  window.google = {
    maps: {
      places: {
        AutocompleteSuggestion: {
          async fetchAutocompleteSuggestions(request) {
            const input = request.input.toLowerCase();
            const found = PLACES.filter((place) => fullText(place).toLowerCase().startsWith(input));
            return { suggestions: found.map((place) => toSuggestion(place, request.input)) };
          },
        },
      },
      GeocoderStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      Geocoder: class {
        geocode(request, callback) {
          const place = PLACES.find(
            (p) => p.placeId === request.placeId || fullText(p) === request.address,
          );
          if (!place) {
            callback(null, 'ZERO_RESULTS');
            return;
          }
          const { lat, lng } = place.location;
          callback(
            [
              {
                place_id: place.placeId,
                formatted_address: fullText(place),
                geometry: { location: { lat: () => lat, lng: () => lng } },
              },
            ],
            'OK',
          );
        }
      },
    },
  };
}
```

A test with Testing Library and the `LocationSearchInput` from the usage example:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';

beforeEach(() => installFakeGoogle());
afterEach(() => {
  delete window.google;
});

test('shows suggestions from the fake', async () => {
  render(<LocationSearchInput />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'San' } });
  expect(await screen.findByText('San Francisco, CA, USA')).toBeTruthy();
});
```

## Google Maps Platform

This package works with Google Maps Platform. It is not affiliated with or endorsed by Google. Google Maps and Google Maps Platform are trademarks of Google LLC.

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
