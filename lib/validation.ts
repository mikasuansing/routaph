import { z } from "zod";

// Metro Manila bounding box
const lat = z.number().min(14.3).max(14.8);
const lng = z.number().min(120.9).max(121.2);

export const SearchSchema = z.object({
  originLat:   lat,
  originLng:   lng,
  destLat:     lat,
  destLng:     lng,
  preference:  z.enum(["fastest", "cheapest", "fewest_transfers"]).optional(),
});

export const SearchBodySchema = z.object({
  origin:       z.object({ lat, lng }),
  destination:  z.object({ lat, lng }),
  departAt:     z.string().datetime().optional(),
  preference:   z.enum(["fastest", "fewest_transfers", "cheapest"]).optional(),
  // At least one mode must remain usable, so at most 3 of the 4 can be excluded
  excludeModes: z.array(z.enum(["jeepney", "bus", "mrt", "lrt"])).max(3).optional(),
});

export const CrowdReportSchema = z.object({
  stopId:   z.number().int().positive().optional(),
  routeId:  z.number().int().positive().optional(),
  crowding: z.enum(["empty", "moderate", "packed"]),
  note:     z.string().max(200).optional(),
});

export const LogSearchSchema = z.object({
  originLat:  lat,
  originLng:  lng,
  destLat:    lat,
  destLng:    lng,
  preference: z.enum(["fastest", "cheapest", "fewest_transfers"]).optional(),
  resultCount: z.number().int().min(0).optional(),
});

export const SavedRouteSchema = z.object({
  name:        z.string().min(1).max(120),
  originLat:   lat,
  originLng:   lng,
  originName:  z.string().min(1).max(200),
  destLat:     lat,
  destLng:     lng,
  destName:    z.string().min(1).max(200),
});
