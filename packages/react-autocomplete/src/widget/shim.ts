import { createSession, fetchDetails, fetchPredictions, type Session } from '@places-compat/core';
import { createDropdown } from './dropdown';
import { injectStyles } from './styles';

type Options = google.maps.places.AutocompleteOptions;
type Bounds = google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
type PlaceResult = google.maps.places.PlaceResult;

export interface AutocompleteShim {
  getPlace(): PlaceResult;
  getBounds(): google.maps.LatLngBounds | undefined;
  getFields(): string[] | undefined;
  setBounds(bounds: Bounds | undefined): void;
  setComponentRestrictions(restrictions: google.maps.places.ComponentRestrictions | null): void;
  setFields(fields: string[] | undefined): void;
  setOptions(options: Options | null): void;
  setTypes(types: string[] | null): void;
  addListener(eventName: string, handler: () => void): { remove(): void };
  destroy(): void;
}

interface State {
  bounds?: Bounds | undefined;
  componentRestrictions?: google.maps.places.ComponentRestrictions | null | undefined;
  fields?: string[] | undefined;
  strictBounds?: boolean | undefined;
  types?: string[] | null | undefined;
}

const OPTION_KEYS = ['bounds', 'componentRestrictions', 'fields', 'strictBounds', 'types'] as const;

function invoke(handler: () => void, self: unknown): void {
  try {
    handler.call(self);
  } catch (error) {
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

function toBounds(bounds: Bounds | undefined): google.maps.LatLngBounds | undefined {
  if (!bounds) return undefined;
  const LatLngBounds = (globalThis as { google?: typeof google }).google?.maps?.LatLngBounds;
  if (typeof LatLngBounds !== 'function' || bounds instanceof LatLngBounds) {
    return bounds as google.maps.LatLngBounds;
  }
  return new LatLngBounds(bounds);
}

export function createAutocompleteShim(
  input: HTMLInputElement,
  places: google.maps.PlacesLibrary,
  options?: Options,
): AutocompleteShim {
  const state: State = {};
  const listeners: { handler: () => void }[] = [];
  const session = createSession(places);
  let token = session.newToken();
  let place: PlaceResult | undefined;
  let requestId = 0;
  let selectionId = 0;
  let destroyed = false;

  const merge = (next: Options | null | undefined) => {
    if (!next || typeof next !== 'object') return;
    const source = next as Record<string, unknown>;
    const target = state as Record<string, unknown>;
    const present = Object.keys(source);
    for (const key of OPTION_KEYS) {
      if (present.indexOf(key) !== -1) target[key] = source[key];
    }
  };
  merge(options);

  input.setAttribute('autocomplete', 'off');
  input.classList.add('pac-target-input');
  if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', 'Enter a location');
  injectStyles(input.ownerDocument);

  let shim: AutocompleteShim;

  const emit = () => {
    for (const entry of listeners.slice()) {
      if (listeners.indexOf(entry) !== -1) invoke(entry.handler, shim);
    }
  };

  const dropdown = createDropdown(input, {
    onSelect(prediction) {
      input.value = prediction.description;
      requestId += 1;
      selectionId += 1;
      const id = selectionId;
      const fields = state.fields;
      const request: google.maps.places.PlaceDetailsRequest = { placeId: prediction.place_id };
      if (fields) request.fields = fields;
      const pending = fetchDetails(places, request, { session });
      token = session.newToken();
      void pending.then(({ status, result }) => {
        if (destroyed || id !== selectionId) return;
        place = status === 'OK' && result ? result : { name: input.value };
        emit();
      });
    },
    onEnterWithoutSelection() {
      requestId += 1;
      selectionId += 1;
      place = { name: input.value };
      emit();
    },
  });

  const onInput = () => {
    requestId += 1;
    const id = requestId;
    const value = input.value;
    if (!value) {
      dropdown.clear();
      return;
    }
    const request: google.maps.places.AutocompletionRequest = { input: value, sessionToken: token };
    if (state.types) request.types = state.types;
    if (state.componentRestrictions) request.componentRestrictions = state.componentRestrictions;
    if (state.bounds) request.bounds = state.bounds;
    const requestToken = token;
    const scoped: Session = {
      newToken: () => session.newToken(),
      remember(prediction, ctx) {
        if (!destroyed && id === requestId && requestToken === token) {
          session.remember(prediction, ctx);
        }
      },
      placeFor: (req) => session.placeFor(req),
      release: (place, fetched) => session.release(place, fetched),
    };
    void fetchPredictions(places, request, {
      session: scoped,
      strictBounds: Boolean(state.strictBounds),
    }).then(({ predictions }) => {
      if (destroyed || id !== requestId) return;
      dropdown.setPredictions(predictions);
    });
  };
  input.addEventListener('input', onInput);

  shim = {
    getPlace() {
      return place ?? { name: input.value };
    },
    getBounds() {
      return toBounds(state.bounds);
    },
    getFields() {
      return state.fields;
    },
    setBounds(bounds) {
      state.bounds = bounds;
    },
    setComponentRestrictions(restrictions) {
      state.componentRestrictions = restrictions;
    },
    setFields(fields) {
      state.fields = fields;
    },
    setOptions(next) {
      merge(next);
    },
    setTypes(types) {
      state.types = types;
    },
    addListener(eventName, handler) {
      if (eventName !== 'place_changed' || typeof handler !== 'function') {
        return { remove() {} };
      }
      const entry = { handler };
      listeners.push(entry);
      return {
        remove() {
          const index = listeners.indexOf(entry);
          if (index !== -1) listeners.splice(index, 1);
        },
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      input.removeEventListener('input', onInput);
      dropdown.destroy();
      listeners.length = 0;
    },
  };
  return shim;
}
