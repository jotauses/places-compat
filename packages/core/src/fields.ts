export const LEGACY_FIELD_MAP: Readonly<Record<string, readonly string[]>> = {
  address_components: ['addressComponents'],
  adr_address: ['adrFormatAddress'],
  formatted_address: ['formattedAddress'],
  geometry: ['location', 'viewport'],
  'geometry.location': ['location'],
  'geometry.viewport': ['viewport'],
  plus_code: ['plusCode'],
  types: ['types'],
  place_id: ['id'],
  photos: ['photos'],
  name: ['displayName'],
  business_status: ['businessStatus'],
  utc_offset_minutes: ['utcOffsetMinutes'],
  icon_background_color: ['iconBackgroundColor'],
  icon_mask_base_uri: ['svgIconMaskURI'],
  opening_hours: ['regularOpeningHours'],
  price_level: ['priceLevel'],
  rating: ['rating'],
  user_ratings_total: ['userRatingCount'],
  website: ['websiteURI'],
  international_phone_number: ['internationalPhoneNumber'],
  formatted_phone_number: ['nationalPhoneNumber'],
  reviews: ['reviews'],
  url: ['googleMapsURI'],
  vicinity: ['shortFormattedAddress'],
  html_attributions: ['attributions'],
};

export const ALL_PLACE_FIELDS: readonly string[] = [
  'addressComponents',
  'adrFormatAddress',
  'formattedAddress',
  'location',
  'viewport',
  'plusCode',
  'types',
  'id',
  'photos',
  'displayName',
  'businessStatus',
  'utcOffsetMinutes',
  'iconBackgroundColor',
  'svgIconMaskURI',
  'regularOpeningHours',
  'priceLevel',
  'rating',
  'userRatingCount',
  'websiteURI',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'reviews',
  'googleMapsURI',
  'shortFormattedAddress',
  'attributions',
];

export function toPlaceFields(legacy?: string[]): { fields: string[]; unsupported: string[] } {
  const all = !legacy || legacy.length === 0 || legacy.indexOf('ALL') !== -1;
  const fields: string[] = all ? ALL_PLACE_FIELDS.slice() : [];
  const unsupported: string[] = [];
  for (const name of legacy ?? []) {
    if (name === 'ALL') continue;
    const mapped = LEGACY_FIELD_MAP[name];
    if (!Array.isArray(mapped)) {
      if (unsupported.indexOf(name) === -1) unsupported.push(name);
      continue;
    }
    for (const field of mapped as readonly string[]) {
      if (fields.indexOf(field) === -1) fields.push(field);
    }
  }
  return { fields, unsupported };
}
