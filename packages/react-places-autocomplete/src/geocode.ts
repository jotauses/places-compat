function geocode(request: google.maps.GeocoderRequest): Promise<google.maps.GeocoderResult[]> {
  const geocoder = new window.google.maps.Geocoder();
  const OK = window.google.maps.GeocoderStatus.OK;

  return new Promise((resolve, reject) => {
    geocoder.geocode(request, (results, status) => {
      if (status !== OK) {
        reject(status);
      }
      resolve(results as google.maps.GeocoderResult[]);
    });
  });
}

export function geocodeByAddress(address: string): Promise<google.maps.GeocoderResult[]> {
  return geocode({ address });
}

export function geocodeByPlaceId(placeId: string): Promise<google.maps.GeocoderResult[]> {
  return geocode({ placeId });
}

export function getLatLng(result: google.maps.GeocoderResult): Promise<google.maps.LatLngLiteral> {
  return new Promise((resolve, reject) => {
    try {
      const latLng = {
        lat: result.geometry.location.lat(),
        lng: result.geometry.location.lng(),
      };
      resolve(latLng);
    } catch (e) {
      reject(e);
    }
  });
}
