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
  rush:         z.boolean().optional(),
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

// "Report an issue" (wrong fare / wrong stop / route doesn't exist) shares
// the crowd_reports table with the schema above, but crowd_reports.crowding
// has a DB CHECK constraint limited to empty/moderate/packed — confirmed
// live, so issue categories can't be stored there without a migration this
// session couldn't apply (no SQL/DDL access, only PostgREST). Instead the
// category is encoded as a "[category] " prefix on `note`, and `crowding`
// is always the inert filler value 'moderate'. See docs/api-contracts.md.
export const IssueReportSchema = z.object({
  stopId:   z.number().int().positive().optional(),
  routeId:  z.number().int().positive().optional(),
  category: z.enum(["wrong_fare", "wrong_stop", "route_missing", "other"]),
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

export const StationAccessibilityUpdateSchema = z.object({
  stopId:  z.number().int().positive(),
  feature: z.enum(["elevator", "escalator"]),
  status:  z.enum(["unknown", "operational", "out_of_service"]),
  note:    z.string().max(200).optional(),
});

