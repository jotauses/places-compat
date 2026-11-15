# @places-compat/use-places-autocomplete

A replacement for [use-places-autocomplete](https://github.com/wellyshen/use-places-autocomplete) 4.0.1 that gets its predictions and place details from the Places API (New). You install it under the original name, and your imports, types and options keep working. What behaves differently is listed under [Differences from the original](#differences-from-the-original).

## Before you switch

- Enable Places API (New) in the Google Cloud project that owns your key. This package never calls the legacy Places API and has no fallback to it, so a project with only the legacy API enabled gets errors instead of predictions.
- Load version 3.57.2 or later of the Maps JavaScript API. `AutocompleteSuggestion` first shipped in that version. If you pin an older `v=`, the hook logs the original "library must be loaded" error followed by the line `Places API (New) must be enabled and the Maps JavaScript API must be version 3.57.2 or later.` The hook then keeps `ready` at `false`.
- Pass `fields` to `getDetails`. Without them the request asks for every field this package can map, and Google bills the session or request at the Place Details Enterprise + Atmosphere rate.
- Install it under the original package name with an npm alias (see [Install](#install)), so your imports stay the same.
- If your tests mock `AutocompleteService` or `PlacesService`, those mocks no longer drive the hook. [Testing your app](#testing-your-app) shows a fake of the new classes that you can use instead.

## Install

```sh
npm i use-places-autocomplete@npm:@places-compat/use-places-autocomplete
pnpm add use-places-autocomplete@npm:@places-compat/use-places-autocomplete
yarn add use-places-autocomplete@npm:@places-compat/use-places-autocomplete
```

If another package depends on use-places-autocomplete, point that dependency at this one too. With npm, add an `overrides` entry to your root `package.json` that uses the same specification as your direct dependency (npm stops with `EOVERRIDE` if they differ):

```json
{
  "dependencies": {
    "use-places-autocomplete": "npm:@places-compat/use-places-autocomplete@^0.1.0"
  },
  "overrides": {
    "use-places-autocomplete": "$use-places-autocomplete"
  }
}
```

With pnpm, put the override in `pnpm-workspace.yaml` (older pnpm versions read `pnpm.overrides` in `package.json`):

```yaml
overrides:
  use-places-autocomplete: npm:@places-compat/use-places-autocomplete@^0.1.0
```

Yarn uses `resolutions` with the same value. The `npm:` form in `resolutions` has not been tested here.

You still install `@types/google.maps` yourself if you use TypeScript, as with the original.

## Usage

The API is the one documented by the original package. A short example:

```tsx
import usePlacesAutocomplete, { getDetails, getGeocode, getLatLng } from 'use-places-autocomplete';

function PlacesInput() {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({ requestOptions: { componentRestrictions: { country: 'fr' } } });

  const select = async (description: string, placeId: string) => {
    setValue(description, false);
    clearSuggestions();
    const [result] = await getGeocode({ address: description });
    const { lat, lng } = getLatLng(result);
    const details = await getDetails({ placeId, fields: ['formatted_address', 'name'] });
    console.log(lat, lng, details);
  };

  return (
    <div>
      <input value={value} disabled={!ready} onChange={(e) => setValue(e.target.value)} />
      {status === 'OK' && (
        <ul>
          {data.map(({ place_id, description }) => (
            <li key={place_id} onClick={() => select(description, place_id)}>
              {description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Defaults are unchanged: `debounce` 200 ms, `cache` 86400 seconds, `cacheKey` `"upa"`, `defaultValue` `""` and `initOnMount` `true`. Suggestions keep the legacy `AutocompletePrediction` shape, statuses keep the `PlacesServiceStatus` strings, and the cache in `sessionStorage` keeps the original key and format, so entries written by the original package are still read.

## Loading the Maps JavaScript API

The hook looks for the Places library on the `googleMaps` option first and on `window.google.maps` second.

- With a script tag that loads `libraries=places`, the library is already there and `ready` turns `true` during mount, as before.
- With the dynamic bootstrap loader, `google.maps` exists before the Places library does. The hook calls `google.maps.importLibrary('places')` and `ready` turns `true` once it resolves.
- `callbackName` works as before: when neither `googleMaps` nor `window.google.maps` exists at mount, the hook puts `init` on `window[callbackName]` for the script to call.

## Sessions and billing

The hook never creates session tokens. If you pass `sessionToken` in `requestOptions`, it goes to the new autocomplete request unchanged. A later `getDetails` for a place from those predictions, with the same `language` and `region` or none, fetches the place through the prediction, which sends the token and closes the session. Once that fetch succeeds, the hook forgets every prediction that came with that token, so a later `getDetails` for any of them goes out without a token and is billed as a request outside any session. Searches that reuse the same token do not bring them back; pass a new token to start a new session. Any other `getDetails` call also goes out without a token. Predictions served from the cache have no live prediction behind them, so a `getDetails` after a cache hit is billed as a request outside any session, unless the same place came from a live search earlier on the page and that session has not been closed yet.

How Google bills a session depends on the fields you fetch at the end:

- Only Essentials fields (`address_components`, `formatted_address`, `geometry`, `types` and the like): the first 12 autocomplete requests of the session are billed and the rest are not.
- Any Pro, Enterprise or Atmosphere field (`name` is Pro): the session is billed at the Place Details Enterprise + Atmosphere rate, whatever fields you asked for.
- Only IDs Only fields: the same as not using a session.
- A session that ends without `getDetails`, or requests without a token: billed per request.

## Testing your app

Mocks of `AutocompleteService` and `PlacesService` have no effect on this package. Stub the new classes instead. Plain objects are enough:

```ts
const prediction = (placeId: string, text: string) => {
  const [main, ...rest] = text.split(', ');
  return {
    placeId,
    text: { text, matches: [] },
    mainText: { text: main, matches: [] },
    secondaryText: { text: rest.join(', '), matches: [] },
    types: ['geocode'],
    distanceMeters: null,
    toPlace: () => new window.google.maps.places.Place({ id: placeId }),
  };
};

class FakePlace {
  id: string;
  formattedAddress?: string;
  constructor({ id }: { id: string }) {
    this.id = id;
  }
  async fetchFields() {
    this.formattedAddress = '1 Example Street, Paris, France';
    return { place: this };
  }
}

window.google = {
  maps: {
    places: {
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: async ({ input }: { input: string }) => ({
          suggestions: [{ placePrediction: prediction('place-1', `${input}, Paris, France`) }],
        }),
      },
      AutocompleteSessionToken: class {},
      Place: FakePlace,
    },
  },
} as unknown as typeof window.google;
```

To test an error, make `fetchAutocompleteSuggestions` reject with an `Error` whose `code` is a status such as `REQUEST_DENIED`; the hook reports it as `suggestions.status`. Remember that the hook debounces input by 200 ms, so advance fake timers or wait before you assert.

## Differences from the original

`UPA-` ids are specific to this package. `CORE-` ids come from the code that the three places-compat packages share, and only the ones that apply to this package are listed. The Test column says what covers each row: a test file, with its path relative to the package folder in the source repository; `allowlist`, for a difference that the comparison tests against the original package accept by id; or `doc`, for a row that no automated test covers.

| ID | Difference | Why | Test |
| --- | --- | --- | --- |
| UPA-01 | `ready` can turn `true` after mount instead of during it. When the Places library is not on `google.maps` yet but `importLibrary` is, the hook loads it and sets `ready` once the load resolves. If the load fails, it logs the original "library must be loaded" message with the 3.57.2 requirement line from [Before you switch](#before-you-switch) on a second line. | With the dynamic bootstrap loader, the new classes only arrive through `importLibrary('places')`. | test:test/hook.test.tsx |
| UPA-02 | A response is dropped, and not written to the cache, when a later search has already been shown (its response, a cache hit, or the clear for an empty value) or when a later response is being held while the tree is hidden. The original shows whichever response arrives last and caches it over the newer entry. A response that arrives before the later one is still shown, as in the original. | Requests now go through promises, and a slow earlier request should not replace newer suggestions or a cleared input. | allowlist |
| UPA-03 | While the hook's effects are detached (after unmount, or while a React `<Activity>` tree is hidden) it does not update its state and does not send searches. A response already in flight is still written to the cache. When a hidden tree is shown again, the hook applies the newest response it held, then sends the held search after the usual debounce, with the hook's current options; a response that arrived after that search was held is only cached. Typing while hidden replaces the held search. After unmount nothing is applied. | The original updated state on an unmounted component, which React 17 reports as a warning, and it sent requests nobody would see. | allowlist |
| UPA-04 | A cache hit needs an own key of the stored object, so inputs such as `constructor` or `toString` are fetched instead of returning `data: undefined`. When the stored value is `null`, or one of its entries is `null`, the search runs normally; the original threw inside the debounce timer. | The original looked inputs up on a plain object and read each entry's `maxAge` without checking it. | allowlist |
| UPA-05 | With only the legacy Places library loaded (no `AutocompleteSuggestion` and no `importLibrary`), the hook logs the original "library must be loaded" message with the 3.57.2 requirement line from [Before you switch](#before-you-switch) on a second line and stays not ready. The original became ready and used `AutocompleteService`. | The package only calls Places API (New). This is also what happens in consumer tests that mock the legacy classes. | allowlist |
| UPA-06 | `getDetails` still throws a `TypeError` synchronously when `window.google` or `window.google.maps` is missing. When `google.maps` exists but the Places library cannot be loaded, it logs the original "library must be loaded" message with the 3.57.2 requirement line from [Before you switch](#before-you-switch) on a second line and rejects with `"UNKNOWN_ERROR"`. Without a `placeId` it logs and rejects with the place Id message before it tries to load the library. The original threw a `TypeError` in both cases as soon as `google.maps.places` was missing. | The library may arrive later through `importLibrary`, so a missing `google.maps.places` is no longer an error by itself. | test:test/utils.test.ts |
| UPA-07 | `getLatLng` calls `lat()` and `lng()` as methods of `geometry.location`. The original called them detached from the object, which throws for a `LatLng` implementation that reads `this`. | Calling them as methods works with any `LatLng`, including test doubles. | test:test/utils.test.ts |
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
