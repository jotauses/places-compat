import type { AllowEntry } from '@places-compat/core/testing';

export const widgetAllow: AllowEntry[] = [];

export const serviceHookAllow: AllowEntry[] = [];

export const serviceHookLoadAllow: AllowEntry[] = [
  {
    id: 'RGA-07',
    path: /^settled\.(placesService|placesAutocompleteService|autocompleteSessionToken)$/,
    reason:
      'The original builds its services in a ref without a state change, so they stay hidden until something else renders; the replacement renders once they exist.',
  },
  {
    id: 'RGA-07',
    path: /^settled\.placePredictions\[[1-4]\]$/,
    reason:
      'The original keeps the options of the first render inside its debounced request; the replacement sends the current options, so the restricted handler answers with a single prediction.',
  },
];
