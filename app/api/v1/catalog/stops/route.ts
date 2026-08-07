import { type NextRequest } from 'next/server';
import { Errors, ok } from '@/lib/api/envelope';
import { seedStops } from '@/lib/routing/graph';

export const dynamic = 'force-dynamic';

// Catalog data changes rarely — let the CDN serve it (5 min edge cache,
// 1 h stale-while-revalidate) instead of hitting the function every request.
function cached(res: ReturnType<typeof ok>) {
  res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res;
}

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

  // Rate limiting
  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseServer } = await import('@/lib/supabase/server');
      const { data, error } = await supabaseServer.from('stops').select('id, name, lat, lng').order('id');
      if (!error && data && data.length > 0) {
        let stops = data.filter(s => s.lat != null && s.lng != null);
        if (bboxFilter) stops = stops.filter(s => bboxFilter!(s.lat!, s.lng!));
        return cached(ok(stops));
      }
    } catch {
      // fall through to seed
    }
  }

  let stops = seedStops;
  if (bboxFilter) stops = stops.filter(s => bboxFilter!(s.lat, s.lng));
  return cached(ok(stops));
}
