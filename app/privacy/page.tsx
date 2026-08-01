import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — RoutaPH' };

const C = {
  bg:      'var(--color-bg)',
  surface: 'var(--color-surface)',
  border:  'var(--color-border)',
  muted:   'var(--color-muted)',
  ink:     'var(--color-ink)',
  accent:  'var(--color-accent)',
};

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter,-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Header */}
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, textDecoration: 'none', marginBottom: 40 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Routa</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.accent, letterSpacing: '-0.03em' }}>PH</span>
        </Link>

        <h1 style={{ fontSize: 28, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 40 }}>
          Effective: July 2026 &middot; Governed by the Philippine Data Privacy Act of 2012 (RA 10173)
        </p>

        {[
          {
            title: '1. There is no account',
            body: (
              <p>
                RoutaPH has no sign-up, no login, and no user profile. We never ask for
                your name, email, or phone number, and there is nothing in our database
                that identifies you. Everything below describes the small amount of data
                the app handles anyway &mdash; none of it is attached to a person.
              </p>
            ),
          },
          {
            title: '2. What we collect',
            body: (
              <>
                <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  <li><strong>Search logs</strong> &mdash; when you search for a route we record a <em>geohash</em> (a fuzzy grid cell roughly 1&nbsp;km across, not your exact coordinates) and the transport preference you chose. There is no identifier attached, so these cannot be traced back to you or grouped into one person&apos;s history.</li>
                  <li><strong>Crowd reports</strong> &mdash; if you report crowding or a service problem, we store the report and the stop it refers to. It is submitted anonymously and is not linked to you.</li>
                  <li><strong>Live position, only if you switch it on</strong> &mdash; see section 3.</li>
                </ul>
              </>
            ),
          },
          {
            title: '3. Sharing your position on the live map (opt-in)',
            body: (
              <>
                <p>
                  No transit operator in the Philippines publishes real-time vehicle
                  positions, so the only way to show where a train or bus actually is
                  right now is for riders to share it. During a trip you can turn on
                  <strong> Share position</strong>. It is off by default, and turning it
                  on applies to that one trip only &mdash; it never carries over to your
                  next ride.
                </p>
                <p style={{ marginTop: 8 }}>While it is on:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  <li>Your coordinates are sent roughly every 15 seconds, and only while you are on a train or bus leg &mdash; never while you are walking.</li>
                  <li>Each ping carries a <strong>random token generated for that trip and thrown away when it ends</strong>. It is not an account, device, or advertising ID. Its only purpose is working out which direction you are travelling.</li>
                  <li>Positions are held in a temporary cache (Upstash Redis) that <strong>deletes them automatically after 3 minutes</strong>. They are never written to our main database, never backed up, and never exported.</li>
                  <li>Your individual position is never shown to anyone. It is combined with other riders&apos; pings into a single estimated vehicle position on the map.</li>
                  <li>Switching it off stops the pings immediately and destroys the token. Anything already sent expires on its own within 3 minutes.</li>
                </ul>
              </>
            ),
          },
          {
            title: '4. What we do NOT collect',
            body: (
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <li>No names, emails, phone numbers, or accounts of any kind.</li>
                <li>No payment information.</li>
                <li>No advertising or cross-site tracking identifiers, and no third-party analytics or ad scripts.</li>
                <li>No lasting record of where you have been. Outside the 3-minute live-map cache described above, GPS never leaves your browser &mdash; the turn-by-turn trip screen runs entirely on your device.</li>
                <li>We do not sell data to anyone.</li>
              </ul>
            ),
          },
          {
            title: '5. Data retention',
            body: (
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <li><strong>Live positions: 3 minutes.</strong> Deleted automatically, whether or not anyone looks at them.</li>
                <li><strong>Search logs: 90 days</strong>, then deleted. Geohashed and anonymous throughout.</li>
                <li><strong>Crowd reports:</strong> kept while they are still useful to other commuters.</li>
              </ul>
            ),
          },
          {
            title: '6. Your rights (RA 10173)',
            body: (
              <p>
                The Philippine Data Privacy Act gives you the right to access, correct,
                and erase personal data held about you. Because RoutaPH has no accounts and
                stores nothing that identifies you, there is no personal record for us to
                look up, correct, or delete &mdash; and no way for us to link any stored
                row back to you even if you asked. If you would still like to raise a
                concern or ask what we hold, contact us at the address below.
              </p>
            ),
          },
          {
            title: '7. Third-party services',
            body: (
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <li><strong>Supabase</strong> (database) &mdash; stores transit data, anonymous search logs, and crowd reports in the ap-northeast-1 region. <a href="https://supabase.com/privacy" style={{ color: C.accent }}>Supabase Privacy Policy</a>.</li>
                <li><strong>Upstash Redis</strong> &mdash; rate limiting, route caching, and the 3-minute live-position cache. <a href="https://upstash.com/trust/privacy.pdf" style={{ color: C.accent }}>Upstash Privacy Policy</a>.</li>
                <li><strong>Vercel</strong> &mdash; hosting. Request logs are retained per Vercel&apos;s default policy. <a href="https://vercel.com/legal/privacy-policy" style={{ color: C.accent }}>Vercel Privacy Policy</a>.</li>
                <li><strong>OpenStreetMap / CARTO</strong> &mdash; map tiles. They may log your IP address when tiles load.</li>
                <li><strong>Open-Meteo</strong> &mdash; rain advisories, requested for one fixed Metro Manila point, never your location.</li>
                <li><strong>Waze / Grab deep links</strong> &mdash; if you tap one, your destination coordinate is passed to that app. RoutaPH receives nothing back.</li>
                <li><strong>Google Fonts</strong> &mdash; loaded at runtime; Google may log your IP per their terms.</li>
              </ul>
            ),
          },
          {
            title: '8. Contact',
            body: (
              <p>
                For privacy questions or data requests, email us at{' '}
                <a href="mailto:theasuansing29@gmail.com" style={{ color: C.accent }}>theasuansing29@gmail.com</a>.
              </p>
            ),
          },
        ].map(({ title, body }) => (
          <section key={title} style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: C.ink, marginBottom: 10 }}>{title}</h2>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>{body}</div>
          </section>
        ))}

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginTop: 8 }}>
          <Link href="/" style={{ fontSize: 13, color: C.accent }}>&#8592; Back to RoutaPH</Link>
        </div>
      </div>
    </div>
  );
}
