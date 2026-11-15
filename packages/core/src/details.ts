import { toPlaceFields } from './fields';
import type { Session } from './session';
import { type LegacyStatus, toLegacyStatus } from './status';

type Place = google.maps.places.Place;
type PlaceResult = google.maps.places.PlaceResult;

const PRICE_LEVELS: Readonly<Record<string, number>> = {
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlLink(uri: string | null | undefined, text: string): string {
  return uri ? `<a href="${escapeHtml(uri)}">${escapeHtml(text)}</a>` : escapeHtml(text);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function point(p: google.maps.places.OpeningHoursPoint): google.maps.places.PlaceOpeningHoursTime {
  return { day: p.day, hours: p.hour, minutes: p.minute, time: pad2(p.hour) + pad2(p.minute) };
}

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

function mapList<T, R>(list: readonly T[] | null | undefined, fn: (item: T) => R): R[] | undefined {
  return list ? list.map(fn) : undefined;
}

type Converter = (place: Place, names: readonly string[]) => unknown;

const CONVERTERS: Readonly<Record<string, Converter>> = {
  address_components: (place) =>
    mapList(place.addressComponents, (c) => ({
      long_name: c.longText ?? '',
      short_name: c.shortText ?? '',
      types: c.types.slice(),
    })),
  adr_address: (place) => orUndefined(place.adrFormatAddress),
  formatted_address: (place) => orUndefined(place.formattedAddress),
  geometry: (place, names) =>
    geometry(
      place,
      names.indexOf('geometry') !== -1 || names.indexOf('geometry.location') !== -1,
      names.indexOf('geometry') !== -1 || names.indexOf('geometry.viewport') !== -1,
    ),
  plus_code: (place) => {
    const code = place.plusCode;
    if (!code) return undefined;
    const plus: google.maps.places.PlacePlusCode = { global_code: code.globalCode ?? '' };
    if (code.compoundCode !== null && code.compoundCode !== undefined) {
      plus.compound_code = code.compoundCode;
    }
    return plus;
  },
  types: (place) => mapList(place.types, (t) => t),
  place_id: (place) => orUndefined(place.id),
  photos: (place) =>
    mapList(
      place.photos,
      (photo): google.maps.places.PlacePhoto => ({
        height: photo.heightPx,
        html_attributions: photo.authorAttributions.map((a) => htmlLink(a.uri, a.displayName)),
        width: photo.widthPx,
        getUrl: (opts) => photo.getURI(opts),
      }),
    ),
  name: (place) => orUndefined(place.displayName),
  business_status: (place) => orUndefined(place.businessStatus),
  utc_offset_minutes: (place) => orUndefined(place.utcOffsetMinutes),
  icon_background_color: (place) => orUndefined(place.iconBackgroundColor),
  icon_mask_base_uri: (place) => orUndefined(place.svgIconMaskURI),
  opening_hours: (place) => {
    const hours = place.regularOpeningHours;
    if (!hours) return undefined;
    return {
      periods: hours.periods.map((p) => ({
        open: point(p.open),
        close: p.close && point(p.close),
      })),
      weekday_text: hours.weekdayDescriptions.slice(),
      isOpen: () => undefined,
    };
  },
  price_level: (place) => {
    const level = place.priceLevel;
    const value = level ? PRICE_LEVELS[level] : undefined;
    return typeof value === 'number' ? value : undefined;
  },
  rating: (place) => orUndefined(place.rating),
  user_ratings_total: (place) => orUndefined(place.userRatingCount),
  website: (place) => orUndefined(place.websiteURI),
  international_phone_number: (place) => orUndefined(place.internationalPhoneNumber),
  formatted_phone_number: (place) => orUndefined(place.nationalPhoneNumber),
  reviews: (place) =>
    mapList(place.reviews, (r) => ({
      author_name: r.authorAttribution?.displayName ?? '',
      author_url: r.authorAttribution?.uri,
      profile_photo_url: r.authorAttribution?.photoURI ?? '',
      language: r.textLanguageCode ?? '',
      rating: r.rating,
      relative_time_description: r.relativePublishTimeDescription ?? '',
      text: r.text ?? '',
      time: r.publishTime ? Math.floor(r.publishTime.getTime() / 1000) : 0,
    })),
  url: (place) => orUndefined(place.googleMapsURI),
  vicinity: (place) => orUndefined(place.shortFormattedAddress),
  html_attributions: (place) =>
    mapList(place.attributions, (a) => htmlLink(a.providerURI, a.provider ?? '')),
};

function geometry(place: Place, location: boolean, viewport: boolean): PlaceResult['geometry'] {
  const geo: google.maps.places.PlaceGeometry = {};
  const loc = location ? place.location : undefined;
  const view = viewport ? place.viewport : undefined;
  if (loc) geo.location = loc;
  if (view) geo.viewport = view;
  return loc || view ? geo : undefined;
}

export function toLegacyPlaceResult(place: Place, legacy?: string[]): PlaceResult {
  const all = !legacy || legacy.length === 0 || legacy.indexOf('ALL') !== -1;
  const names = all ? Object.keys(CONVERTERS) : legacy;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(CONVERTERS)) {
    const wanted = key === 'geometry' || names.indexOf(key) !== -1;
    const value = wanted ? (CONVERTERS[key] as Converter)(place, names) : undefined;
    if (value !== undefined) result[key] = value;
  }
  return result as PlaceResult;
}

export async function fetchDetails(
  places: google.maps.PlacesLibrary,
  req: google.maps.places.PlaceDetailsRequest,
  opts?: { session?: Session },
): Promise<{ status: LegacyStatus; result: PlaceResult | null }> {
  try {
    const placeId: unknown = req?.placeId;
    if (typeof placeId !== 'string' || placeId === '') {
      return { status: 'INVALID_REQUEST', result: null };
    }
    const { fields } = toPlaceFields(req.fields);
    const lookup: { placeId: string; language?: string; region?: string } = { placeId };
    if (typeof req.language === 'string') lookup.language = req.language;
    if (typeof req.region === 'string') lookup.region = req.region;
    const session = opts?.session;
    const place = session ? session.placeFor(lookup) : newPlace(places, lookup);
    let fetched = false;
    try {
      if (fields.length > 0) {
        await place.fetchFields({ fields });
        fetched = fields.some((field) => field !== 'id');
      }
    } finally {
      session?.release(place, fetched);
    }
    return { status: 'OK', result: toLegacyPlaceResult(place, req.fields) };
  } catch (error) {
    return { status: toLegacyStatus(error), result: null };
  }
}

function newPlace(
  places: google.maps.PlacesLibrary,
  lookup: { placeId: string; language?: string; region?: string },
): Place {
  const options: google.maps.places.PlaceOptions = { id: lookup.placeId };
  if (lookup.language !== undefined) options.requestedLanguage = lookup.language;
  if (lookup.region !== undefined) options.requestedRegion = lookup.region;
  return new places.Place(options);
}
