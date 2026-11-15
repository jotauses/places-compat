import { fetchDetails, loadPlaces, sharedSession } from '@places-compat/core';
import { geocodeErr, getDetailsErr, newApiErr } from './messages';
import type {
  DetailsResult,
  GeoArgs,
  GeocodeResult,
  GeoReturn,
  GetDetailsArgs,
  LatLng,
  ZipCode,
} from './types';

interface GoogleWindow {
  google: { maps: typeof google.maps };
}

function windowGoogle(): GoogleWindow['google'] {
  return (window as unknown as GoogleWindow).google;
}

export const getGeocode = (args: GeoArgs): GeoReturn => {
  const geocoder = new (windowGoogle().maps.Geocoder)();

  return new Promise((resolve, reject) => {
    geocoder.geocode(args, (results, status) => {
      if (status !== 'OK') reject(status);
      if (!args.address && args.componentRestrictions) console.error(geocodeErr);
      resolve(results as GeocodeResult[]);
    });
  });
};

export const getLatLng = (result: GeocodeResult): LatLng => {
  const { location } = result.geometry;
  return { lat: location.lat(), lng: location.lng() };
};

export const getZipCode = (result: GeocodeResult, useShortName: boolean): ZipCode => {
  const found = result.address_components.find(({ types }) => types.includes('postal_code'));
  if (!found) return undefined;
  return useShortName ? found.short_name : found.long_name;
};

export const getDetails = (args: GetDetailsArgs): DetailsResult => {
  const maps = windowGoogle().maps;
  if (!maps) throw new TypeError("Cannot read properties of undefined (reading 'places')");

  if (!args.placeId) {
    console.error(getDetailsErr);
    return Promise.reject(getDetailsErr);
  }

  return loadPlaces(maps).then(
    (places) =>
      fetchDetails(places, args, { session: sharedSession(places) }).then(({ status, result }) =>
        status === 'OK' && result ? result : Promise.reject(status),
      ),
    () => {
      console.error(newApiErr);
      return Promise.reject('UNKNOWN_ERROR');
    },
  );
};
