import { getPlaces, loadPlaces, NEW_API_HINT } from '@places-compat/core';
import { GOOGLE_NOT_FOUND, PLACES_NOT_LOADED, SCRIPT_CALLBACK } from './constants';

type GoogleGlobal = { maps?: { api?: unknown } };

function currentGoogle(): GoogleGlobal | undefined {
  return (globalThis as { google?: GoogleGlobal }).google;
}

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && Boolean(window.document);
}

export function loadGoogleMapScript(baseUrl: string, url: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve();

  if (currentGoogle()?.maps?.api) return Promise.resolve();

  const scriptElements = document.querySelectorAll(`script[src*="${baseUrl}"]`);
  const existing = scriptElements[0];
  if (existing) {
    return new Promise((resolve) => {
      if (typeof currentGoogle() !== 'undefined') return resolve();
      existing.addEventListener('load', () => resolve());
    });
  }

  const scriptUrl = new URL(url);
  scriptUrl.searchParams.set('callback', SCRIPT_CALLBACK);
  const el = document.createElement('script');
  el.src = scriptUrl.toString();

  return new Promise((resolve) => {
    (window as unknown as Record<string, unknown>)[SCRIPT_CALLBACK] = resolve;
    document.body.appendChild(el);
  });
}

function failureMessage(error: unknown): string {
  const reason = (error as { reason?: unknown } | null)?.reason;
  return reason === 'no-new-api' ? `${PLACES_NOT_LOADED}\n${NEW_API_HINT}` : PLACES_NOT_LOADED;
}

export function withPlaces(
  onReady: (places: google.maps.PlacesLibrary) => void,
  onError: (message: string) => void,
): { cancel(): void } {
  let cancelled = false;
  const handle = {
    cancel() {
      cancelled = true;
    },
  };

  if (typeof currentGoogle() === 'undefined') {
    onError(GOOGLE_NOT_FOUND);
    return handle;
  }

  const ready = getPlaces();
  if (ready) {
    onReady(ready);
    return handle;
  }

  loadPlaces().then(
    (places) => {
      if (!cancelled) onReady(places);
    },
    (error: unknown) => {
      if (!cancelled) onError(failureMessage(error));
    },
  );
  return handle;
}
