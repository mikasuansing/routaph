import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Errors, ok } from '@/lib/api/envelope';
import { haversineKm } from '@/lib/routing/utils';

export const dynamic = 'force-dynamic';

const DISCLAIMER =
  'Estimated fare only — not an official or live quote. Subject to surge pricing and availability. ' +
  'ParaPo does not process payment or guarantee accuracy.';

const STATIC_PROVIDERS = [
  {
    id: 1,
    name: 'Grab Car',
    deepLinkTemplate:
      'https://grab.com/ride/?origin={originLat},{originLng}&destination={destLat},{destLng}',
    baseFare: 125,
    perKm: 15,
  },
  {
    id: 2,
    name: 'JoyRide Motorcycle',
    deepLinkTemplate:
      'https://joyrideph.com/?from={originLat},{originLng}&to={destLat},{destLng}',
    baseFare: 60,
    perKm: 11,
  },
];

const querySchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
  destLat:   z.coerce.number().min(-90).max(90),
  destLng:   z.coerce.number().min(-180).max(180),
});

function buildDeepLink(
  template: string,
  oLat: number, oLng: number,
  dLat: number, dLng: number,
): string {
  return template
    .replace('{originLat}', String(oLat))
    .replace('{originLng}', String(oLng))
    .replace('{destLat}',   String(dLat))
    .replace('{destLng}',   String(dLng));
}

function estimateFare(baseFare: number, perKm: number, distKm: number) {
  const raw = baseFare + distKm * perKm;
  return {
    fareMin: Math.round(raw * 0.8),
    fareMax: Math.round(raw * 1.2),
  };
}

function estimateEta(distKm: number) {
  const base = (distKm / 20) * 60;
  return {
    etaMin: Math.max(3, Math.round(base * 0.7)),
    etaMax: Math.round(base * 1.5),
  };
}

// Guest-accessible — ride options are shown mid-trip without an account.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    originLat: searchParams.get('originLat'),
    originLng: searchParams.get('originLng'),
    destLat:   searchParams.get('destLat'),
    destLng:   searchParams.get('destLng'),
  });
  if (!parsed.success) {
    return Errors.validation('originLat, originLng, destLat, destLng are required numeric values', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Rate limiting
  try {
    const { searchLimiter, clientKey } = await import('@/lib/ratelimit');
    const { success } = await searchLimiter.limit(clientKey(req));
    if (!success) return Errors.rateLimited();
  } catch {
    // Redis not configured — skip in dev
  }

  const { originLat, originLng, destLat, destLng } = parsed.data;
  const distKm = haversineKm(originLat, originLng, destLat, destLng);

  let providers = STATIC_PROVIDERS;

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { supabaseServer } = await import('@/lib/supabase/server');
      const { data } = await supabaseServer
        .from('ride_providers')
        .select('id, name, deep_link_template, provider_fare_rules(base_fare, per_km)')
        .order('id');

      if (data && data.length > 0) {
        providers = data.map(p => {
          // TODO: type this properly — Supabase embedded query typing
          const rules = (p as unknown as {
            id: number; name: string; deep_link_template: string;
            provider_fare_rules: Array<{ base_fare: number; per_km: number }>;
          }).provider_fare_rules;
          const rule = rules?.[0];
          return {
            id: p.id,
            name: p.name,
            deepLinkTemplate: p.deep_link_template,
            baseFare: rule ? Number(rule.base_fare) : 125,
            perKm:    rule ? Number(rule.per_km)    : 15,
          };
        });
      }
    } catch {
      // DB unavailable — fall back to static providers
    }
  }

  const options = providers.map(p => ({
    provider:   p.name,
    ...estimateFare(p.baseFare, p.perKm, distKm),
    ...estimateEta(distKm),
    deepLink:   buildDeepLink(p.deepLinkTemplate, originLat, originLng, destLat, destLng),
    disclaimer: DISCLAIMER,
  }));

  return ok(options);
}
