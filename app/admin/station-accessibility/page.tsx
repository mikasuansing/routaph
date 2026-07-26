'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

/*
 * Internal admin page — manually set elevator/escalator status per MRT-3
 * station. No roles table exists in this schema; the PATCH endpoint gates
 * on an ADMIN_EMAILS server env allowlist, so a non-admin logged-in user
 * simply gets "Save failed" on every row. Deliberately minimal — this is
 * infrastructure for future real data, not a polished admin surface.
 */

const C = {
  bg: 'var(--color-bg)', card: 'var(--color-card)', border: 'var(--color-border)',
  muted: 'var(--color-muted)', body: 'var(--color-body)', ink: 'var(--color-ink)',
  accent: 'var(--color-accent)', error: 'var(--color-error)', onPrimary: 'var(--color-on-primary)',
};

// Matches lib/routing/stationEntrances.ts's MRT-3 station list exactly.
const MRT3_STATIONS = [
  'Taft Avenue (MRT)', 'Magallanes', 'Ayala', 'Buendia', 'Guadalupe',
  'Ortigas (MRT)', 'Shaw Blvd', 'Boni', 'Cubao (MRT)', 'GMA-Kamuning',
  'Quezon Ave (MRT)', 'North Avenue',
];

type Feature = 'elevator' | 'escalator';
type Status = 'unknown' | 'operational' | 'out_of_service';
type Stop = { id: number; name: string };
type Row = { status: Status; note: string; saveState: 'idle' | 'saving' | 'saved' | 'failed' };

export default function StationAccessibilityAdmin() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  // key: `${stopId}:${feature}`
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) { router.replace('/auth?next=/admin/station-accessibility'); return; }
      setAuthed(true);
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (authed !== true) return;
    let active = true;
    (async () => {
      try {
        const [stopsRes, accessRes] = await Promise.all([
          fetch('/api/v1/catalog/stops').then(r => r.json()),
          fetch('/api/v1/station-accessibility').then(r => r.json()),
        ]);
        if (!active) return;
        const mrt3Stops: Stop[] = (stopsRes.data ?? []).filter((s: Stop) => MRT3_STATIONS.includes(s.name));
        setStops(mrt3Stops);

        const initial: Record<string, Row> = {};
        for (const stop of mrt3Stops) {
          for (const feature of ['elevator', 'escalator'] as Feature[]) {
            const existing = (accessRes.data ?? []).find(
              (r: { stopId: number; feature: string }) => r.stopId === stop.id && r.feature === feature,
            );
            initial[`${stop.id}:${feature}`] = {
              status: existing?.status ?? 'unknown',
              note: existing?.note ?? '',
              saveState: 'idle',
            };
          }
        }
        setRows(initial);
      } catch {
        if (active) setLoadError('Could not load station data — check your connection.');
      }
    })();
    return () => { active = false; };
  }, [authed]);

  async function save(stopId: number, feature: Feature) {
    const key = `${stopId}:${feature}`;
    const row = rows[key];
    if (!row) return;
    setRows(prev => ({ ...prev, [key]: { ...row, saveState: 'saving' } }));
    try {
      const session = (await supabaseBrowser.auth.getSession()).data.session;
      if (!session) { setRows(prev => ({ ...prev, [key]: { ...row, saveState: 'failed' } })); return; }
      const res = await fetch('/api/v1/admin/station-accessibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ stopId, feature, status: row.status, note: row.note || undefined }),
      });
      setRows(prev => ({ ...prev, [key]: { ...row, saveState: res.ok ? 'saved' : 'failed' } }));
    } catch {
      setRows(prev => ({ ...prev, [key]: { ...row, saveState: 'failed' } }));
    }
  }

  if (authed !== true) return null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, padding: '32px 20px', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Station accessibility (MRT-3)</h1>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>
        Manual status only — no live feed. Defaults to &quot;unknown&quot;, never a guessed &quot;operational&quot;.
      </p>
      {loadError && <p style={{ color: C.error, fontSize: 13 }}>{loadError}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
        {stops.map(stop => (
          <div key={stop.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 10px' }}>{stop.name}</p>
            {(['elevator', 'escalator'] as Feature[]).map(feature => {
              const key = `${stop.id}:${feature}`;
              const row = rows[key];
              if (!row) return null;
              return (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.body, width: 70, textTransform: 'capitalize' }}>{feature}</span>
                  <select
                    value={row.status}
                    onChange={e => setRows(prev => ({ ...prev, [key]: { ...row, status: e.target.value as Status } }))}
                    style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.ink, fontFamily: 'inherit' }}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="operational">Operational</option>
                    <option value="out_of_service">Out of service</option>
                  </select>
                  <input
                    value={row.note}
                    onChange={e => setRows(prev => ({ ...prev, [key]: { ...row, note: e.target.value.slice(0, 200) } }))}
                    placeholder="Note (optional)"
                    style={{ flex: 1, minWidth: 120, fontSize: 13, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.ink, fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={() => save(stop.id, feature)}
                    disabled={row.saveState === 'saving'}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: row.saveState === 'saved' ? C.accent : C.ink, color: C.onPrimary,
                    }}
                  >
                    {row.saveState === 'saving' ? 'Saving…' : row.saveState === 'saved' ? '✓ Saved' : row.saveState === 'failed' ? 'Failed — retry' : 'Save'}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
