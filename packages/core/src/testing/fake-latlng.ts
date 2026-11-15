type LatLngLike = google.maps.LatLng | google.maps.LatLngLiteral;
type BoundsLike = google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;

function isLatLngInstance(value: unknown): value is { lat(): number; lng(): number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { lat?: unknown }).lat === 'function' &&
    typeof (value as { lng?: unknown }).lng === 'function'
  );
}

function readLatLng(value: LatLngLike): google.maps.LatLngLiteral {
  if (isLatLngInstance(value)) return { lat: value.lat(), lng: value.lng() };
  return { lat: value.lat, lng: value.lng };
}

function round(value: number, precision: number): number {
  return Number(value.toFixed(precision));
}

export class FakeLatLng implements google.maps.LatLng {
  private readonly latValue: number;
  private readonly lngValue: number;

  constructor(
    latOrLatLngOrLatLngLiteral: number | LatLngLike,
    lngOrNoClampNoWrap?: number | boolean | null,
    _noClampNoWrap?: boolean,
  ) {
    if (typeof latOrLatLngOrLatLngLiteral === 'number') {
      this.latValue = latOrLatLngOrLatLngLiteral;
      this.lngValue = typeof lngOrNoClampNoWrap === 'number' ? lngOrNoClampNoWrap : 0;
    } else {
      const literal = readLatLng(latOrLatLngOrLatLngLiteral);
      this.latValue = literal.lat;
      this.lngValue = literal.lng;
    }
  }

  lat(): number {
    return this.latValue;
  }

  lng(): number {
    return this.lngValue;
  }

  toJSON(): google.maps.LatLngLiteral {
    return { lat: this.latValue, lng: this.lngValue };
  }

  equals(other: LatLngLike | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    const literal = readLatLng(other);
    return literal.lat === this.latValue && literal.lng === this.lngValue;
  }

  toString(): string {
    return `(${this.latValue}, ${this.lngValue})`;
  }

  toUrlValue(precision = 6): string {
    return `${round(this.latValue, precision)},${round(this.lngValue, precision)}`;
  }
}

function isBoundsLiteral(value: unknown): value is google.maps.LatLngBoundsLiteral {
  return typeof value === 'object' && value !== null && 'south' in value && 'north' in value;
}

function isBoundsInstance(value: unknown): value is google.maps.LatLngBounds {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getSouthWest?: unknown }).getSouthWest === 'function'
  );
}

export class FakeLatLngBounds {
  private readonly sw: FakeLatLng;
  private readonly ne: FakeLatLng;

  constructor(swOrLatLngBounds?: LatLngLike | BoundsLike | null, ne?: LatLngLike | null) {
    if (swOrLatLngBounds === null || swOrLatLngBounds === undefined) {
      this.sw = new FakeLatLng(1, 180);
      this.ne = new FakeLatLng(-1, -180);
    } else if (isBoundsInstance(swOrLatLngBounds)) {
      this.sw = new FakeLatLng(swOrLatLngBounds.getSouthWest());
      this.ne = new FakeLatLng(swOrLatLngBounds.getNorthEast());
    } else if (isBoundsLiteral(swOrLatLngBounds)) {
      this.sw = new FakeLatLng(swOrLatLngBounds.south, swOrLatLngBounds.west);
      this.ne = new FakeLatLng(swOrLatLngBounds.north, swOrLatLngBounds.east);
    } else {
      this.sw = new FakeLatLng(swOrLatLngBounds);
      this.ne = new FakeLatLng(ne ?? swOrLatLngBounds);
    }
  }

  getNorthEast(): FakeLatLng {
    return this.ne;
  }

  getSouthWest(): FakeLatLng {
    return this.sw;
  }

  getCenter(): FakeLatLng {
    return new FakeLatLng((this.sw.lat() + this.ne.lat()) / 2, (this.sw.lng() + this.ne.lng()) / 2);
  }

  toJSON(): google.maps.LatLngBoundsLiteral {
    return { south: this.sw.lat(), west: this.sw.lng(), north: this.ne.lat(), east: this.ne.lng() };
  }
}

FakeLatLngBounds.prototype satisfies Pick<
  google.maps.LatLngBounds,
  'getNorthEast' | 'getSouthWest' | 'getCenter' | 'toJSON'
>;

export function toLatLng(value: LatLngLike): google.maps.LatLng {
  return isLatLngInstance(value) ? (value as google.maps.LatLng) : new FakeLatLng(value);
}

export function toLatLngBounds(value: BoundsLike): google.maps.LatLngBounds {
  return isBoundsInstance(value)
    ? value
    : (new FakeLatLngBounds(value) as unknown as google.maps.LatLngBounds);
}
