import { describe, expect, it } from 'vitest';
import {
  polygonAreaSqMeters,
  sqMetersToSqFeet,
  sqFeetToRoofingSquares,
} from './geo.js';

describe('polygonAreaSqMeters', () => {
  it('returns 0 for fewer than 3 points', () => {
    expect(polygonAreaSqMeters([])).toBe(0);
    expect(polygonAreaSqMeters([{ lat: 0, lng: 0 }])).toBe(0);
    expect(polygonAreaSqMeters([{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }])).toBe(0);
  });

  it('measures a known small rectangle within 1%', () => {
    // ~10m x 10m square near the equator. Easy to reason about.
    // 0.0001 degree of lat ≈ 11.1 m; we'll use ~9 m for a small box.
    const dLat = 9 / 111_320; // ~9 meters in lat degrees
    const dLng = 9 / 111_320; // ~9 meters in lng degrees at equator
    const square: { lat: number; lng: number }[] = [
      { lat: 0, lng: 0 },
      { lat: dLat, lng: 0 },
      { lat: dLat, lng: dLng },
      { lat: 0, lng: dLng },
    ];
    const area = polygonAreaSqMeters(square);
    expect(area).toBeGreaterThan(80);
    expect(area).toBeLessThan(82);
  });

  it('is invariant to winding direction', () => {
    const cw = [
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0 },
      { lat: 0.001, lng: 0.001 },
      { lat: 0, lng: 0.001 },
    ];
    const ccw = [...cw].reverse();
    expect(polygonAreaSqMeters(ccw)).toBeCloseTo(polygonAreaSqMeters(cw), 1);
  });

  it('handles a typical roof footprint (≈ 2400 sq ft / 223 m²)', () => {
    // 16m x 14m rectangle near San Francisco lat.
    const baseLat = 37.7749;
    const baseLng = -122.4194;
    const dLat = 14 / 111_320;
    const lngScale = 111_320 * Math.cos((baseLat * Math.PI) / 180);
    const dLng = 16 / lngScale;
    const poly = [
      { lat: baseLat, lng: baseLng },
      { lat: baseLat + dLat, lng: baseLng },
      { lat: baseLat + dLat, lng: baseLng + dLng },
      { lat: baseLat, lng: baseLng + dLng },
    ];
    const sqM = polygonAreaSqMeters(poly);
    const sqFt = sqMetersToSqFeet(sqM);
    // Target: 2410 sq ft ± 2%.
    expect(sqFt).toBeGreaterThan(2360);
    expect(sqFt).toBeLessThan(2460);
  });
});

describe('sqFeetToRoofingSquares', () => {
  it('converts 2400 sq ft to 24 squares', () => {
    expect(sqFeetToRoofingSquares(2400)).toBe(24);
  });
});
