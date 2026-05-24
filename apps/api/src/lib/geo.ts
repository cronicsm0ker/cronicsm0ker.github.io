// Geo helpers for roof footprint measurement.

const EARTH_RADIUS_M = 6_378_137; // WGS84 equatorial radius
const SQ_M_PER_SQ_FT = 0.092_903_04;

export interface LatLng {
  lat: number;
  lng: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Spherical-excess area for a polygon on Earth's surface, returning
// square meters. Polygon is the OUTER ring with vertices in any winding
// order; first and last points need NOT be equal — we close the loop.
// Reference: https://trs.jpl.nasa.gov/handle/2014/40409 (Chamberlain & Duquette).
export function polygonAreaSqMeters(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % polygon.length]!;
    total += (toRad(p2.lng) - toRad(p1.lng)) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function sqMetersToSqFeet(sqM: number): number {
  return sqM / SQ_M_PER_SQ_FT;
}

export function sqFeetToRoofingSquares(sqFt: number): number {
  return sqFt / 100;
}
