import { z } from 'zod';

export const MeasurementMethodSchema = z.enum([
  'BLUEPRINT',
  'MANUAL_POLYGON',
  'SOLAR_API',
  'EAGLEVIEW',
  'MANUAL',
  'FIELD_PHOTO',
]);
export type MeasurementMethod = z.infer<typeof MeasurementMethodSchema>;

export const MeasurementUnitSchema = z.enum(['SQFT', 'LF', 'EACH', 'COUNT', 'SQUARES']);
export type MeasurementUnit = z.infer<typeof MeasurementUnitSchema>;

export const MeasurementSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  method: MeasurementMethodSchema,
  label: z.string().min(1).max(200),
  // Decimal serialized as a string to preserve precision over the wire.
  value: z.string(),
  unit: MeasurementUnitSchema,
  confidence: z.number().int().min(0).max(100),
  notes: z.string().nullable().optional(),
  payload: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Measurement = z.infer<typeof MeasurementSchema>;

// Lat/lng pairs for the polygon the rep drew on Google Maps. Area is
// computed server-side via the spherical-excess formula so it can't be
// spoofed by the client.
export const LatLngSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export const CreateManualPolygonMeasurementSchema = z.object({
  leadId: z.string().uuid(),
  label: z.string().min(1).max(200).default('Roof footprint'),
  // Outer ring; first and last point need NOT match, we close the loop.
  polygon: z.array(LatLngSchema).min(3).max(500),
  unit: z.enum(['SQFT', 'SQUARES']).default('SQFT'),
  notes: z.string().max(2000).optional(),
});
export type CreateManualPolygonMeasurement = z.infer<typeof CreateManualPolygonMeasurementSchema>;

export const CreateMeasurementSchema = z.object({
  leadId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  method: MeasurementMethodSchema,
  label: z.string().min(1).max(200),
  value: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)]),
  unit: MeasurementUnitSchema,
  confidence: z.number().int().min(0).max(100),
  notes: z.string().max(2000).optional(),
  payload: z.record(z.unknown()).optional(),
});
export type CreateMeasurement = z.infer<typeof CreateMeasurementSchema>;

export const MeasurementListResponseSchema = z.object({
  items: z.array(MeasurementSchema),
});
export type MeasurementListResponse = z.infer<typeof MeasurementListResponseSchema>;
