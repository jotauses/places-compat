import {
  debounce as createDebounce,
  fetchPredictions as fetchLegacyPredictions,
  getPlaces,
  loadPlaces,
  sharedSession,
} from '@places-compat/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadApiErr, newApiErr } from './messages';
import type { HookArgs, HookReturn, SetValue, Suggestion, Suggestions } from './types';
import useLatest from './useLatest';

type Maps = typeof google.maps;
type Places = google.maps.PlacesLibrary;
type CacheEntry = { data: Suggestion[]; maxAge: number };
type CacheData = Record<string, CacheEntry>;

function globals(): Record<string, unknown> & { google?: { maps?: Maps } } {
  return window as unknown as Record<string, unknown> & { google?: { maps?: Maps } };
}

function readCache(cacheKey: string): CacheData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sessionStorage.getItem(cacheKey) || '{}');
  } catch {
    return Object.create(null);
  }
  const data: CacheData = Object.create(null);
  if (typeof parsed !== 'object' || parsed === null) return data;
  for (const key of Object.keys(parsed)) {
    data[key] = (parsed as CacheData)[key] as CacheEntry;
  }
  return data;
}

function isFresh(entry: unknown): entry is CacheEntry {
  return (
    typeof entry === 'object' && entry !== null && (entry as CacheEntry).maxAge - Date.now() >= 0
  );
}

const usePlacesAutocomplete = ({
  requestOptions,
  debounce = 200,
  cache = 24 * 60 * 60,
  cacheKey = 'upa',
  googleMaps,
  callbackName,
  defaultValue = '',
  initOnMount = true,
}: HookArgs = {}): HookReturn => {
  const [ready, setReady] = useState(false);
  const [value, setVal] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestions>({
    loading: false,
    status: '',
    data: [],
  });
  const placesRef = useRef<Places | null>(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(false);
  const searchRef = useRef(0);
  const shownRef = useRef(0);
  const heldSearchRef = useRef<string | null>(null);
  const heldShowRef = useRef<{ search: number; show: () => void } | null>(null);
  const requestOptionsRef = useLatest(requestOptions);
  const googleMapsRef = useLatest(googleMaps);

  const init = useCallback(() => {
    if (placesRef.current || loadingRef.current) return;

    const candidates: Maps[] = [];
    for (const maps of [googleMapsRef.current as Maps | undefined, globals().google?.maps]) {
      if (maps) candidates.push(maps);
    }

    for (const maps of candidates) {
      const places = getPlaces(maps);
      if (places) {
        placesRef.current = places;
        if (mountedRef.current) setReady(true);
        return;
      }
    }

    const loader = candidates.find((maps) => typeof maps.importLibrary === 'function');
    if (loader) {
      loadingRef.current = true;
      loadPlaces(loader).then(
        (places) => {
          loadingRef.current = false;
          placesRef.current = places;
          if (mountedRef.current) setReady(true);
        },
        () => {
          loadingRef.current = false;
          console.error(newApiErr);
        },
      );
      return;
    }

    console.error(candidates.some((maps) => maps.places) ? newApiErr : loadApiErr);
  }, [googleMapsRef]);

  const clearSuggestions = useCallback(() => {
    setSuggestions({ loading: false, status: '', data: [] });
  }, []);

  const clearCache = useCallback(
    (key = cacheKey) => {
      try {
        sessionStorage.removeItem(key);
      } catch {}
    },
    [cacheKey],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce stays out of the list, as in the original
  const fetchPredictions = useCallback(
    createDebounce((val: string) => {
      if (!mountedRef.current) {
        heldSearchRef.current = val;
        return;
      }
      const search = ++searchRef.current;

      if (!val) {
        shownRef.current = search;
        clearSuggestions();
        return;
      }

      const places = placesRef.current;
      if (!places) return;

      setSuggestions((prevState) => ({ ...prevState, loading: true }));

      let cachedData = readCache(cacheKey);

      if (cache) {
        const fresh: CacheData = Object.create(null);
        for (const key of Object.keys(cachedData)) {
          const entry = cachedData[key];
          if (isFresh(entry)) fresh[key] = entry;
        }
        cachedData = fresh;

        const hit = cachedData[val];
        if (hit) {
          shownRef.current = search;
          setSuggestions({ loading: false, status: 'OK', data: hit.data });
          return;
        }
      }

      fetchLegacyPredictions(
        places,
        { ...requestOptionsRef.current, input: val },
        { session: sharedSession(places) },
      ).then(({ status, predictions }) => {
        const held = heldShowRef.current;
        if (search < shownRef.current || (held && held.search > search)) return;

        if (cache && status === 'OK') {
          cachedData[val] = { data: predictions, maxAge: Date.now() + cache * 1000 };
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(cachedData));
          } catch {}
        }

        const show = () => {
          if (search < shownRef.current) return;
          shownRef.current = search;
          setSuggestions({ loading: false, status, data: predictions });
        };
        if (mountedRef.current) show();
        else if (heldSearchRef.current === null || heldShowRef.current) {
          heldShowRef.current = { search, show };
        }
      });
    }, debounce),
    [cache, cacheKey, clearSuggestions, requestOptionsRef],
  );

  const setValue: SetValue = useCallback(
    (val, shouldFetchData = true) => {
      setVal(val);
      if (placesRef.current && shouldFetchData) {
        heldSearchRef.current = null;
        fetchPredictions(val);
      }
    },
    [fetchPredictions],
  );

  const fetchRef = useLatest(fetchPredictions);

  useEffect(() => {
    mountedRef.current = true;
    if (placesRef.current) setReady(true);
    const held = heldShowRef.current;
    const search = heldSearchRef.current;
    heldShowRef.current = null;
    heldSearchRef.current = null;
    if (held) held.show();
    if (search !== null) fetchRef.current(search);
    return () => {
      mountedRef.current = false;
    };
  }, [fetchRef]);

  useEffect(() => {
    if (!initOnMount) return () => null;

    const scope = globals();

    if (!googleMapsRef.current && !scope.google?.maps && callbackName) {
      scope[callbackName] = init;
    } else {
      init();
    }

    return () => {
      const key = callbackName as string;
      if (scope[key]) delete scope[key];
    };
  }, [callbackName, googleMapsRef, init, initOnMount]);

  return {
    ready,
    value,
    suggestions,
    setValue,
    clearSuggestions,
    clearCache,
    init,
  };
};

export default usePlacesAutocomplete;
