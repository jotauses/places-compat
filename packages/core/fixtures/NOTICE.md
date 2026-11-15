# Fixture notices

JSON files cannot carry a header, so this file records the origin, licence and rights holder of each fixture. Each slug's `meta.json` holds the same facts.

In `meta.json`, `derived` names the half produced by running the core conversion (`toLegacyPrediction` for predictions, `toLegacyPlaceResult` for details) over the other half, the seed.

Derived pairs only test the converter. A derived half is what the converter should produce from the seed, and it says nothing about what Google would return for the same query through the other API. The two Google examples are different queries in each API, so they are not real pairs either.

## `paris-geocode`

- Source: https://developers.google.com/maps/documentation/places/web-service/legacy/autocomplete
- Licence: CC-BY-4.0 for the documentation content; code samples are Apache-2.0.
- Holder: Google LLC
- Derived half: new

The legacy half is the example response for `input=Paris&types=geocode`, without the `reference` key, which `AutocompletePrediction` in `@types/google.maps` 3.66.10 does not have. The documented terms match the ones you get by splitting each description on ", ".

## `amoeba`

- Source: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- Licence: CC-BY-4.0 for the documentation content; code samples are Apache-2.0.
- Holder: Google LLC
- Derived half: legacy

The new half is the first "Amoeba" example (circle location bias), with the two place predictions the page shows before it cuts the list. The new API returns no terms, so the legacy terms come from splitting on ", ".

## `rpa-mock-suggestions`

- Source: react-places-autocomplete 7.3.0, `src/tests/helpers/testHelpers.js` (`mockSuggestions`)
- Licence: MIT
- Holder: Copyright (c) 2016 Ken Hibino
- Derived half: new

The legacy half maps the five mock suggestions back to `AutocompletePrediction` and leaves out their `id` key. The mocks have no `main_text_matched_substrings`, so that field repeats the `matched_substrings` range, which lies inside the main text in all five. The original terms match the synthesised ones.

## `sf-geocode`

- Source: react-places-autocomplete 7.3.0, `src/tests/helpers/googlePayloads.js` (`GEOCODE_RESULT`)
- Licence: MIT
- Holder: Copyright (c) 2016 Ken Hibino
- Derived half: new

`geocode.json` is the `GEOCODE_RESULT["San Francisco"]` array, copied verbatim. The legacy prediction and the legacy details are built from that result.

## `details-full`

- Source: Synthetic data written for this project
- Licence: MIT
- Holder: Copyright (c) 2026 Joaquín
- Derived half: legacy

`details.new.json` has a value for every mapped legacy field. JSON cannot hold functions, so `details.legacy.json` leaves out `opening_hours.isOpen` and `photos[].getUrl`. Addresses, phone numbers and URLs are placeholders.

## `zero-results`

- Source: Synthetic data written for this project
- Licence: MIT
- Holder: Copyright (c) 2026 Joaquín
- Derived half: legacy

Both sides are empty and the legacy status is `ZERO_RESULTS`.

## `no-secondary-text`

- Source: Synthetic data written for this project
- Licence: MIT
- Holder: Copyright (c) 2026 Joaquín
- Derived half: legacy

The prediction has no `secondaryText`, so the legacy `secondary_text` is `''`.

## `matches-main-only`

- Source: Synthetic data written for this project
- Licence: MIT
- Holder: Copyright (c) 2026 Joaquín
- Derived half: legacy

`text.matches` is empty and `mainText.matches` is not, so the legacy `matched_substrings` come from the main text.

## Licence texts

The MIT licence for the react-places-autocomplete material is in that project's `LICENSE` file ("The MIT License (MIT)", "Copyright (c) 2016 Ken Hibino"). Google documentation content is licensed under the Creative Commons Attribution 4.0 License (https://creativecommons.org/licenses/by/4.0/), and its code samples under the Apache 2.0 License (https://www.apache.org/licenses/LICENSE-2.0).
