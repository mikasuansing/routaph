import Link from 'next/link';

export const metadata = { title: 'Offline — RoutaPH' };

const C = {
  bg:     'var(--color-bg)',
  card:   'var(--color-card)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
};

/**
 * Shown when a page is requested with no connection and nothing cached.
 *
 * The tone matters: underground with no signal is the normal case for a
 * Metro Manila commuter, not an error state, so this explains what still
 * works rather than apologising.
 */
export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: 'var(--font-sans)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
          letterSpacing: '-0.02em', color: C.accent,
        }}>
          RoutaPH<span style={{ color: C.ink }}>.</span>
        </span>

        <h1 style={{
          margin: '18px 0 0', fontFamily: 'var(--font-display)',
          fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink,
        }}>
          No signal right now
        </h1>

        <p style={{ margin: '12px 0 0', fontSize: 15, color: C.body, lineHeight: 1.7 }}>
          You&apos;re probably in a tunnel or an underground station. This page
          needed the network and couldn&apos;t reach it.
        </p>

        <div style={{
          marginTop: 22, background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: 18,
        }}>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: C.muted,
          }}>
            What still works
          </p>
          <ul style={{
            margin: '10px 0 0', paddingLeft: 18, fontSize: 14,
            color: C.body, lineHeight: 1.8,
          }}>
            <li>A trip you already started keeps its steps and its map.</li>
            <li>Marking a step done still advances the trip.</li>
            <li>Stations and stops you&apos;ve loaded before are still there.</li>
          </ul>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Live train positions, fares and service alerts need a connection,
            so those wait until you resurface.
          </p>
        </div>

        <Link
          href="/planner"
          style={{
            display: 'block', marginTop: 16, padding: '15px 16px',
            borderRadius: 999, background: 'var(--gradient-primary)',
            color: 'var(--color-on-primary)', textAlign: 'center',
            fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}
        >
          Back to the planner
        </Link>
      </div>
    </div>
  );
}
