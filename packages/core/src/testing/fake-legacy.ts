import { FakeLatLng, FakeLatLngBounds, toLatLngBounds } from './fake-latlng';
import {
  codeOf,
  createGeocoderClass,
  type FakeGoogle,
  GEOCODER_STATUS,
  type GeocodeReply,
  Handlers,
  installGoogle,
  mapsError,
  PLACES_STATUS,
  ReplyEngine,
  wrapGeometry,
} from './fake-shared';
import type { LegacyControl } from './types';

type LegacyCall = LegacyControl['calls'][number];
type Status = google.maps.places.PlacesServiceStatusString;
type Prediction = google.maps.places.AutocompletePrediction;
type PredictionsReply = Prediction[] | Status;
type DetailsReply = google.maps.places.PlaceResult | Status;
type PlaceResult = google.maps.places.PlaceResult;

const REJECT_STATUSES = Object.keys(PLACES_STATUS).filter((status) => status !== 'OK');

export interface CreateLegacyFakeGoogleOptions {
  places?: 'present' | 'absent';
}

interface WidgetState {
  input: HTMLInputElement;
  options: Record<string, unknown>;
  place: PlaceResult | undefined;
  listeners: { eventName: string; handler: () => void }[];
}

export function createLegacyFakeGoogle(
  opts: CreateLegacyFakeGoogleOptions = {},
): FakeGoogle<LegacyControl> {
  const engine = new ReplyEngine<LegacyCall>();
  const predictionHandlers = new Handlers<
    google.maps.places.AutocompletionRequest,
    PredictionsReply
  >();
  const detailHandlers = new Handlers<google.maps.places.PlaceDetailsRequest, DetailsReply>();
  const geocodeHandlers = new Handlers<google.maps.GeocoderRequest, GeocodeReply>();
  const widgets: Autocomplete[] = [];
  const widgetState = new WeakMap<object, WidgetState>();

  const runPredictions = (
    kind: 'predictions' | 'queryPredictions',
    request: google.maps.places.AutocompletionRequest,
    deliver: (predictions: Prediction[] | null, status: Status) => void,
  ) => {
    const seq = engine.record({ kind, request: { ...request } });
    const picked = predictionHandlers.take(request, request.input);
    engine.schedule(
      kind,
      seq,
      picked?.opts ?? {},
      () => {
        const reply = picked ? picked.reply : 'ZERO_RESULTS';
        if (Array.isArray(reply)) deliver([...reply], 'OK');
        else deliver(null, reply);
      },
      (error) => deliver(null, codeOf(error, REJECT_STATUSES, 'UNKNOWN_ERROR') as Status),
    );
  };

  class AutocompleteService {
    constructor() {
      engine.record({ kind: 'construct', target: 'AutocompleteService', request: undefined });
    }

    getPlacePredictions(
      request: google.maps.places.AutocompletionRequest,
      callback?: ((predictions: Prediction[] | null, status: Status) => void) | null,
    ): Promise<google.maps.places.AutocompleteResponse> {
      const promise = new Promise<google.maps.places.AutocompleteResponse>((resolve, reject) => {
        runPredictions('predictions', request, (predictions, status) => {
          callback?.(predictions, status);
          if (status === 'OK' || status === 'ZERO_RESULTS') {
            resolve({ predictions: predictions || [] });
          } else {
            reject(mapsError(status, 'PLACES_AUTOCOMPLETE', `PLACES_AUTOCOMPLETE: ${status}`));
          }
        });
      });
      // The callback already saw the status, so a rejection must not go unhandled.
      if (callback) promise.catch(() => {});
      return promise;
    }

    getQueryPredictions(
      request: google.maps.places.QueryAutocompletionRequest,
      callback: (
        predictions: google.maps.places.QueryAutocompletePrediction[] | null,
        status: Status,
      ) => void,
    ): void {
      runPredictions('queryPredictions', request, callback);
    }
  }

  AutocompleteService.prototype satisfies Pick<
    google.maps.places.AutocompleteService,
    'getPlacePredictions' | 'getQueryPredictions'
  >;

  class PlacesService {
    constructor(attrContainer: HTMLDivElement | google.maps.Map) {
      engine.record({ kind: 'construct', target: 'PlacesService', request: attrContainer });
    }

    getDetails(
      request: google.maps.places.PlaceDetailsRequest,
      callback: (result: PlaceResult | null, status: Status) => void,
    ): void {
      const seq = engine.record({ kind: 'details', request: { ...request } });
      const picked = detailHandlers.take(request, request.placeId);
      engine.schedule(
        'details',
        seq,
        picked?.opts ?? {},
        () => {
          const reply = picked ? picked.reply : 'NOT_FOUND';
          if (typeof reply === 'string') callback(null, reply);
          else callback(wrapGeometry(reply), 'OK');
        },
        (error) => callback(null, codeOf(error, REJECT_STATUSES, 'UNKNOWN_ERROR') as Status),
      );
    }
  }

  PlacesService.prototype satisfies Pick<google.maps.places.PlacesService, 'getDetails'>;

  const stateOf = (widget: object) => widgetState.get(widget) as WidgetState;

  const fire = (widget: Autocomplete, eventName: string) => {
    for (const listener of [...stateOf(widget).listeners]) {
      if (listener.eventName === eventName) listener.handler.call(widget);
    }
  };

  class Autocomplete {
    constructor(
      inputField: HTMLInputElement,
      options?: google.maps.places.AutocompleteOptions | null,
    ) {
      engine.record({ kind: 'construct', target: 'Autocomplete', request: options });
      inputField.setAttribute('autocomplete', 'off');
      inputField.classList.add('pac-target-input');
      if (!inputField.placeholder) inputField.placeholder = 'Enter a location';
      widgetState.set(this, {
        input: inputField,
        options: { ...options },
        place: undefined,
        listeners: [],
      });
      widgets.push(this);
    }

    getPlace(): PlaceResult {
      return stateOf(this).place as PlaceResult;
    }

    getBounds(): google.maps.LatLngBounds | undefined {
      const bounds = stateOf(this).options.bounds as google.maps.LatLngBoundsLiteral | undefined;
      return bounds ? toLatLngBounds(bounds) : undefined;
    }

    getFields(): string[] | undefined {
      return stateOf(this).options.fields as string[] | undefined;
    }

    setBounds(
      bounds: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral | undefined,
    ): void {
      engine.record({ kind: 'setter', target: 'setBounds', request: bounds });
      stateOf(this).options.bounds = bounds;
    }

    setComponentRestrictions(restrictions: google.maps.places.ComponentRestrictions | null): void {
      engine.record({ kind: 'setter', target: 'setComponentRestrictions', request: restrictions });
      stateOf(this).options.componentRestrictions = restrictions;
    }

    setFields(fields: string[] | undefined): void {
      engine.record({ kind: 'setter', target: 'setFields', request: fields });
      stateOf(this).options.fields = fields;
    }

    setOptions(options: google.maps.places.AutocompleteOptions | null): void {
      engine.record({ kind: 'setter', target: 'setOptions', request: options });
      Object.assign(stateOf(this).options, options);
    }

    setTypes(types: string[] | null): void {
      engine.record({ kind: 'setter', target: 'setTypes', request: types });
      stateOf(this).options.types = types;
    }

    addListener(eventName: string, handler: () => void): google.maps.MapsEventListener {
      const listeners = stateOf(this).listeners;
      const entry = { eventName, handler };
      listeners.push(entry);
      return {
        remove: () => {
          const index = listeners.indexOf(entry);
          if (index >= 0) listeners.splice(index, 1);
        },
      };
    }
  }

  Autocomplete.prototype satisfies Pick<
    google.maps.places.Autocomplete,
    | 'getPlace'
    | 'getBounds'
    | 'getFields'
    | 'setBounds'
    | 'setComponentRestrictions'
    | 'setFields'
    | 'setOptions'
    | 'setTypes'
    | 'addListener'
  >;

  class AutocompleteSessionToken {
    constructor() {
      engine.record({ kind: 'newToken', request: undefined });
    }
  }

  const widgetAt = (index: number): Autocomplete => {
    const widget = widgets[index];
    if (!widget) {
      throw new Error(`No Autocomplete number ${index}: ${widgets.length} constructed so far.`);
    }
    return widget;
  };

  const maps: Record<string, unknown> = {
    LatLng: FakeLatLng,
    LatLngBounds: FakeLatLngBounds,
    Geocoder: createGeocoderClass(engine, geocodeHandlers),
    GeocoderStatus: { ...GEOCODER_STATUS },
  };
  if (opts.places !== 'absent') {
    maps.places = {
      Autocomplete,
      AutocompleteService,
      AutocompleteSessionToken,
      PlacesService,
      PlacesServiceStatus: { ...PLACES_STATUS },
    };
  }
  const google = { maps } as unknown as typeof globalThis.google;

  const control: LegacyControl = {
    onPredictions(match, reply, replyOpts) {
      predictionHandlers.add(match, reply, replyOpts);
    },
    onDetails(placeId, reply, replyOpts) {
      detailHandlers.add(placeId, reply, replyOpts);
    },
    onGeocode(match, reply, replyOpts) {
      geocodeHandlers.add(match, reply, replyOpts);
    },
    pending: engine.pending,
    calls: engine.calls,
    selectPlace(place, index = 0) {
      const widget = widgetAt(index);
      stateOf(widget).place = wrapGeometry(place);
      fire(widget, 'place_changed');
    },
    enterWithoutSelection(index = 0) {
      const widget = widgetAt(index);
      const state = stateOf(widget);
      state.place = { name: state.input.value };
      fire(widget, 'place_changed');
    },
    reset() {
      predictionHandlers.clear();
      detailHandlers.clear();
      geocodeHandlers.clear();
      engine.reset();
    },
  };

  return { google, control, install: () => installGoogle(google) };
}
