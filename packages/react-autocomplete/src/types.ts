// Types mirrored from react-google-autocomplete 2.7.5 (index.d.ts, lib/usePlacesAutocompleteService.d.ts). MIT License, Copyright (c) 2016 Ven Korolev.
import type * as React from 'react';

export interface ReactGoogleAutocompleteProps {
  onPlaceSelected?: (
    places: google.maps.places.PlaceResult,
    ref: React.RefObject<HTMLInputElement>,
    autocompleteRef: React.RefObject<google.maps.places.Autocomplete>,
  ) => void;
  inputAutocompleteValue?: string;
  options?: google.maps.places.AutocompleteOptions;
  libraries?: string[];
  apiKey?: string;
  language?: string;
  googleMapsScriptBaseUrl?: string;
}

export interface ReactGoogleAutocompleteInputProps
  extends ReactGoogleAutocompleteProps,
    React.DetailedHTMLProps<React.HTMLAttributes<HTMLInputElement>, HTMLInputElement> {}

export type ReactGoogleAutocompleteComponent = <T>(
  props: ReactGoogleAutocompleteInputProps & T,
) => React.JSX.Element;

export interface usePlacesAutocompleteServiceConfig {
  apiKey?: string;
  libraries?: string[];
  googleMapsScriptBaseUrl?: string;
  debounce?: number;
  options?: google.maps.places.AutocompletionRequest;
  sessionToken?: boolean;
  language?: string;
}

export interface usePlacesAutocompleteServiceResponse {
  placesService: google.maps.places.PlacesService | null;
  autocompleteSessionToken: google.maps.places.AutocompleteSessionToken | undefined;
  placesAutocompleteService: google.maps.places.AutocompleteService | null;
  placePredictions: google.maps.places.AutocompletePrediction[];
  isPlacePredictionsLoading: boolean;
  getPlacePredictions: (opt: google.maps.places.AutocompletionRequest) => void;
  queryPredictions: google.maps.places.QueryAutocompletePrediction[];
  isQueryPredictionsLoading: boolean;
  getQueryPredictions: (opt: google.maps.places.QueryAutocompletionRequest) => void;
  refreshSessionToken: () => void;
}
