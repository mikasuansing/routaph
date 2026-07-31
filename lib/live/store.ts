/**
 * Redis-backed ping store for live vehicle estimation.
 *
 * PRIVACY CONTRACT (see BASELINE §7.7 and docs/api-contracts.md)
 * Raw rider positions are written to Redis ONLY, with a hard TTL, and are
 * never copied into Postgres. There is no retention, export, or backup path
 * for them — a ping is unreachable ~3 minutes after it is sent, whether or
 * not anyone reads it. What the store holds is a short rolling window, not
 * a trace, which is what keeps the "raw GPS traces are never persisted"
 * promise true even with crowdsourced tracking switched on.
 *
 * `riderKey` is an ephemeral random token the client generates per trip and
 * discards at the end of it. It is not an account, device, or session ID.
 * Its only job is letting the server compare a rider's two most recent
 * pings to infer which way they're travelling.
 */

import { redis } from '@/lib/redis/client';
import type { Direction, LivePing } from './estimate';
import { PING_FRESH_MS } from './estimate';

/** Pings outlive the freshness window slightly so a cluster isn't cut mid-read. */
export const PING_TTL_SEC = 180;

const lineKey = (lineId: number) => `live:v1:line:${lineId}`;
const riderKey = (rider: string) => `live:v1:rider:${rider}`;

type StoredPing = LivePing & { direction: Direction };

/**
 * Record one ping and return the direction inferred for it, or null when
 * the rider's own movement doesn't yet establish a direction (first ping of
 * a trip, or still dwelling at the same stop). Direction-less pings are not
 * stored — a vehicle estimate with no heading isn't useful on a map, and
 * guessing a heading would be fabrication.
 */
export async function recordPing(
  lineId: number,
  ping: LivePing,
  snappedIndex: number,
  inferDirection: (prev: number, curr: number) => Direction | null,
): Promise<Direction | null> {
  const rKey = riderKey(ping.riderKey);
  const prevRaw = await redis.get<{ lineId: number; index: number }>(rKey);

  await redis.set(rKey, { lineId, index: snappedIndex }, { ex: PING_TTL_SEC });

  // A rider who just switched lines has no comparable previous index.
  if (!prevRaw || prevRaw.lineId !== lineId) return null;

  const direction = inferDirection(prevRaw.index, snappedIndex);
  if (direction === null) return null;

  const stored: StoredPing = { ...ping, direction };
  const key = lineKey(lineId);
  await redis.zadd(key, { score: ping.ts, member: JSON.stringify(stored) });
  await redis.expire(key, PING_TTL_SEC);
  // Trim anything already past the freshness window so the set can't grow
  // unbounded on a busy line between TTL expiries.
  await redis.zremrangebyscore(key, 0, ping.ts - PING_FRESH_MS);

  return direction;
}

/** Fresh pings for one line, newest window only. */
export async function readPings(
  lineId: number,
  now: number = Date.now(),
): Promise<StoredPing[]> {
  const raw = await redis.zrange<string[]>(
    lineKey(lineId),
    now - PING_FRESH_MS,
    now,
    { byScore: true },
  );
  const pings: StoredPing[] = [];
  for (const entry of raw ?? []) {
    try {
      // Upstash may hand back an already-parsed object depending on how the
      // member was serialised — tolerate both rather than dropping pings.
      const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
      if (parsed && typeof parsed.lat === 'number') pings.push(parsed as StoredPing);
    } catch {
      // A malformed member is skipped, never fatal — this feeds a map hint.
    }
  }
  return pings;
}
