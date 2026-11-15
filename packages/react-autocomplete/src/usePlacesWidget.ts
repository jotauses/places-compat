import * as React from 'react';
import { GOOGLE_MAP_SCRIPT_BASE_URL, INPUT_NOT_HTML } from './constants';
import type { ReactGoogleAutocompleteProps } from './types';
import { isBrowser, loadGoogleMapScript, withPlaces } from './utils';
import { type AutocompleteShim, createAutocompleteShim } from './widget/shim';

type Options = google.maps.places.AutocompleteOptions;
type Listener = { remove(): void };
type PlaceSelected = (
  place: google.maps.places.PlaceResult,
  input: HTMLInputElement | null,
  autocomplete: AutocompleteShim,
) => void;

const { useEffect, useRef } = React;

export default function usePlacesWidget<T = null>(
  props: ReactGoogleAutocompleteProps,
): {
  ref: React.RefObject<T>;
  autocompleteRef: React.RefObject<google.maps.places.Autocomplete>;
} {
  const {
    ref,
    onPlaceSelected: onPlaceSelectedProp,
    apiKey,
    libraries = 'places',
    inputAutocompleteValue = 'new-password',
    options: {
      types = ['(cities)'],
      componentRestrictions,
      fields = ['address_components', 'geometry.location', 'place_id', 'formatted_address'],
      bounds,
      ...options
    } = {} as Options,
    googleMapsScriptBaseUrl = GOOGLE_MAP_SCRIPT_BASE_URL,
    language,
  } = props as ReactGoogleAutocompleteProps & { ref?: unknown };
  const onPlaceSelected = onPlaceSelectedProp as PlaceSelected | undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const event = useRef<Listener | null>(null);
  const autocompleteRef = useRef<AutocompleteShim | null>(null);
  const live = useRef<AutocompleteShim | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const languageQueryParam = language ? `&language=${language}` : '';
  const googleMapsScriptUrl = `${googleMapsScriptBaseUrl}?libraries=${libraries}&key=${apiKey}${languageQueryParam}`;

  useEffect(() => {
    if (
      !isBrowser() ||
      !window.MutationObserver ||
      !inputRef.current ||
      !(inputRef.current instanceof HTMLInputElement)
    ) {
      return undefined;
    }
    const observerHack = new MutationObserver(() => {
      observerHack.disconnect();
      if (inputRef.current) inputRef.current.autocomplete = inputAutocompleteValue as AutoFill;
    });
    observerHack.observe(inputRef.current, {
      attributes: true,
      attributeFilter: ['autocomplete'],
    });
    return () => observerHack.disconnect();
  }, [inputAutocompleteValue]);

  useEffect(() => {
    const config: Record<string, unknown> = { ...options, fields, types, bounds };
    if (componentRestrictions) config.componentRestrictions = componentRestrictions;

    if (live.current || !inputRef.current || !isBrowser()) return undefined;

    if (ref && typeof ref === 'object' && !(ref as { current?: unknown }).current) {
      (ref as { current: unknown }).current = inputRef.current;
    }

    let active = true;
    let pending: { cancel(): void } | null = null;

    const handleAutoComplete = () => {
      if (!active) return;
      pending = withPlaces(
        (places) => {
          const input = inputRef.current;
          if (!(input instanceof HTMLInputElement)) {
            console.error(INPUT_NOT_HTML);
            return;
          }
          const shim = createAutocompleteShim(input, places, config as Options);
          live.current = shim;
          autocompleteRef.current = shim;
          event.current = shim.addListener('place_changed', () => {
            if (onPlaceSelected && autocompleteRef.current) {
              onPlaceSelected(
                autocompleteRef.current.getPlace(),
                inputRef.current,
                autocompleteRef.current,
              );
            }
          });
        },
        (message) => {
          console.error(message);
        },
      );
    };

    if (apiKey) {
      if (!loading.current) {
        loading.current = loadGoogleMapScript(googleMapsScriptBaseUrl, googleMapsScriptUrl);
      }
      loading.current.then(handleAutoComplete);
    } else {
      handleAutoComplete();
    }

    return () => {
      active = false;
      if (pending) pending.cancel();
      if (event.current) event.current.remove();
      event.current = null;
      if (live.current) {
        live.current.destroy();
        live.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (autocompleteRef.current && onPlaceSelected) {
      event.current = autocompleteRef.current.addListener('place_changed', () => {
        if (onPlaceSelected && autocompleteRef.current) {
          onPlaceSelected(
            autocompleteRef.current.getPlace(),
            inputRef.current,
            autocompleteRef.current,
          );
        }
      });
    }
    return () => {
      if (event.current) event.current.remove();
    };
  }, [onPlaceSelected]);

  useEffect(() => {
    if (autocompleteRef.current) autocompleteRef.current.setFields(fields);
  }, [fields]);

  useEffect(() => {
    if (autocompleteRef.current) autocompleteRef.current.setBounds(bounds);
  }, [bounds]);

  useEffect(() => {
    if (autocompleteRef.current) {
      autocompleteRef.current.setComponentRestrictions(
        componentRestrictions as google.maps.places.ComponentRestrictions | null,
      );
    }
  }, [componentRestrictions]);

  useEffect(() => {
    if (autocompleteRef.current) autocompleteRef.current.setOptions(options);
  }, [options]);

  return {
    ref: inputRef as unknown as React.RefObject<T>,
    autocompleteRef: autocompleteRef as unknown as React.RefObject<google.maps.places.Autocomplete>,
  };
}
