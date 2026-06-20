import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { seedStops } from '@/lib/routing/graph';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const bbox = searchParams.get('bbox'); // "minLat,minLng,maxLat,maxLng"

  let bboxFilter: ((lat: number, lng: number) => boolean) | null = null;
  if (bbox) {
    const parts = bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return Errors.validation('bbox must be "minLat,minLng,maxLat,maxLng"');
    }
    const [minLat, minLng, maxLat, maxLng] = parts;
    bboxFilter = (lat, lng) => lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
  }

  // Try Supabase first; fall back to seed data
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseServer } = await import('@/lib/supabase/server');
      const { data, error } = await supabaseServer.from('stops').select('id, name, lat, lng').order('id');
      if (!error && data && data.length > 0) {
        let stops = data.filter(s => s.lat != null && s.lng != null);
        if (bboxFilter) stops = stops.filter(s => bboxFilter!(s.lat!, s.lng!));
        return ok(stops);
      }
    } catch {
      // fall through to seed
    }
  }

  // Seed fallback
  let stops = seedStops;
  if (bboxFilter) stops = stops.filter(s => bboxFilter!(s.lat, s.lng));
  return ok(stops);
}
