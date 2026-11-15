import {
  createAutocompleteServiceShim,
  debounce as createDebounce,
  createPlacesServiceShim,
  createSession,
  getPlaces,
  type Session,
} from '@places-compat/core';
import * as React from 'react';
import { GOOGLE_MAP_SCRIPT_BASE_URL } from './constants';
import type {
  usePlacesAutocompleteServiceConfig,
  usePlacesAutocompleteServiceResponse,
} from './types';
import { isBrowser, loadGoogleMapScript, withPlaces } from './utils';

type AutocompletePrediction = google.maps.places.AutocompletePrediction;
type AutocompletionRequest = google.maps.places.AutocompletionRequest;
type QueryAutocompletePrediction = google.maps.places.QueryAutocompletePrediction;
type QueryAutocompletionRequest = google.maps.places.QueryAutocompletionRequest;
type SessionToken = google.maps.places.AutocompleteSessionToken;

interface Latest {
  options: Partial<AutocompletionRequest>;
  sessionToken: boolean | undefined;
}

function buildRequest<R extends { input: string }>(
  latest: Latest,
  token: SessionToken | null,
  optionsArg: R,
): R {
  return {
    ...(latest.sessionToken && token ? { sessionToken: token } : {}),
    ...latest.options,
    ...optionsArg,
  };
}

export default function usePlacesAutocompleteService(
  config: usePlacesAutocompleteServiceConfig,
): usePlacesAutocompleteServiceResponse {
  const {
    apiKey,
    googleMapsScriptBaseUrl = GOOGLE_MAP_SCRIPT_BASE_URL,
    debounce = 300,
    options = {},
    sessionToken,
    language,
  } = config;
  const libraries: string | string[] = config.libraries === undefined ? 'places' : config.libraries;
  const languageQueryParam = language ? `&language=${language}` : '';
  const googleMapsScriptUrl = `${googleMapsScriptBaseUrl}?key=${apiKey}&libraries=${libraries}${languageQueryParam}`;

  const [placePredictions, setPlacePredictions] = React.useState<AutocompletePrediction[]>([]);
  const [isPlacePredsLoading, setIsPlacePredsLoading] = React.useState(false);
  const [placeInputValue, setPlaceInputValue] = React.useState<string | null>(null);
  const [isQueryPredsLoading, setIsQueryPredsLoading] = React.useState(false);
  const [queryInputValue, setQueryInputValue] = React.useState<string | null | false>(false);
  const [queryPredictions, setQueryPredictions] = React.useState<QueryAutocompletePrediction[]>([]);
  const [, setLoaded] = React.useState(false);

  const placesAutocompleteService = React.useRef<google.maps.places.AutocompleteService | null>(
    null,
  );
  const placesService = React.useRef<google.maps.places.PlacesService | null>(null);
  const autocompleteSession = React.useRef<SessionToken | null>(null);
  const session = React.useRef<Session | null>(null);
  const mounted = React.useRef(false);
  const pendingPlace = React.useRef<AutocompletionRequest | null>(null);
  const pendingQuery = React.useRef<QueryAutocompletionRequest | null>(null);
  const latest = React.useRef<Latest>({ options, sessionToken });
  latest.current = { options, sessionToken };

  function ensureSession(places: google.maps.PlacesLibrary): Session {
    if (!session.current) session.current = createSession(places);
    return session.current;
  }

  const debouncedPlacePredictions = React.useMemo(
    () =>
      createDebounce((optionsArg: AutocompletionRequest) => {
        const service = placesAutocompleteService.current;
        if (service && optionsArg.input) {
          service.getPlacePredictions(
            buildRequest(latest.current, autocompleteSession.current, optionsArg),
            (r) => {
              if (!mounted.current) return;
              if (pendingPlace.current === optionsArg) pendingPlace.current = null;
              setIsPlacePredsLoading(false);
              setPlacePredictions(r || []);
            },
          );
        }
      }, debounce),
    [debounce],
  );

  const debouncedQueryPredictions = React.useMemo(
    () =>
      createDebounce((optionsArg: QueryAutocompletionRequest) => {
        const service = placesAutocompleteService.current;
        if (service && optionsArg.input) {
          service.getQueryPredictions(
            buildRequest(latest.current, autocompleteSession.current, optionsArg),
            (r) => {
              if (!mounted.current) return;
              if (pendingQuery.current === optionsArg) pendingQuery.current = null;
              setIsQueryPredsLoading(false);
              setQueryPredictions(r || []);
            },
          );
        }
      }, debounce),
    [debounce],
  );

  const debouncers = React.useRef(new Set<{ cancel(): void }>());
  const latestDebounced = React.useRef({
    place: debouncedPlacePredictions,
    query: debouncedQueryPredictions,
  });
  latestDebounced.current = { place: debouncedPlacePredictions, query: debouncedQueryPredictions };

  React.useEffect(() => {
    debouncers.current.add(debouncedPlacePredictions);
    debouncers.current.add(debouncedQueryPredictions);
  }, [debouncedPlacePredictions, debouncedQueryPredictions]);

  React.useEffect(() => {
    const { place, query } = latestDebounced.current;
    if (pendingPlace.current) place(pendingPlace.current);
    if (pendingQuery.current) query(pendingQuery.current);
    return () => {
      for (const debounced of debouncers.current) debounced.cancel();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the services load once on mount, like the original hook
  React.useEffect(() => {
    mounted.current = true;
    let active = true;
    let loading: { cancel(): void } | undefined;

    const buildService = () => {
      if (!active) return;
      loading = withPlaces(
        (places) => {
          if (!placesAutocompleteService.current) {
            const current = ensureSession(places);
            placesAutocompleteService.current = createAutocompleteServiceShim(places, current);
            placesService.current = createPlacesServiceShim(
              places,
              current,
              document.createElement('div'),
            );
            if (latest.current.sessionToken) autocompleteSession.current = current.newToken();
          }
          setLoaded(true);
        },
        (message) => console.error(message),
      );
    };

    if (isBrowser()) {
      if (apiKey) {
        loadGoogleMapScript(googleMapsScriptBaseUrl, googleMapsScriptUrl).then(buildService);
      } else {
        buildService();
      }
    }

    return () => {
      active = false;
      mounted.current = false;
      if (loading) loading.cancel();
    };
  }, []);

  return {
    placesService: placesService.current,
    autocompleteSessionToken: autocompleteSession.current as SessionToken,
    placesAutocompleteService: placesAutocompleteService.current,
    placePredictions: placeInputValue ? placePredictions : [],
    isPlacePredictionsLoading: isPlacePredsLoading,
    getPlacePredictions: (opt) => {
      if (opt.input) {
        pendingPlace.current = opt;
        setPlaceInputValue(opt.input);
        setIsPlacePredsLoading(true);
        debouncedPlacePredictions(opt);
        return;
      }
      pendingPlace.current = null;
      setPlacePredictions([]);
      setPlaceInputValue(null);
      debouncedPlacePredictions(opt);
      setIsPlacePredsLoading(false);
    },
    queryPredictions: queryInputValue ? queryPredictions : [],
    isQueryPredictionsLoading: isQueryPredsLoading,
    getQueryPredictions: (opt) => {
      if (opt.input) {
        pendingQuery.current = opt;
        setQueryInputValue(opt.input);
        setIsQueryPredsLoading(true);
        debouncedQueryPredictions(opt);
        return;
      }
      pendingQuery.current = null;
      setQueryPredictions([]);
      setQueryInputValue(null);
      debouncedQueryPredictions(opt);
      setIsQueryPredsLoading(false);
    },
    refreshSessionToken: () => {
      const places = getPlaces();
      const current = session.current || (places ? ensureSession(places) : null);
      if (current) autocompleteSession.current = current.newToken();
    },
  };
}
