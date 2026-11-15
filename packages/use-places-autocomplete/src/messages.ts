import { NEW_API_HINT } from '@places-compat/core';

export const loadApiErr =
  '💡 use-places-autocomplete: Google Maps Places API library must be loaded. See: https://github.com/wellyshen/use-places-autocomplete#load-the-library';

export const geocodeErr =
  '💡 use-places-autocomplete: Please provide an address when using getGeocode() with the componentRestrictions.';

export const getDetailsErr =
  '💡 use-places-autocomplete: Please provide a place Id when using getDetails() either as a string or as part of an Autocomplete Prediction.';

export const newApiErr = `${loadApiErr}\n${NEW_API_HINT}`;
