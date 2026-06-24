import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — ParaPo' };

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
          <span style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Para</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.accent, letterSpacing: '-0.03em' }}>Po</span>
        </Link>

        <h1 style={{ fontSize: 28, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 40 }}>
          Effective: June 2026 &middot; Governed by the Philippine Data Privacy Act of 2012 (RA 10173)
        </p>

        {[
          {
            title: '1. What we collect',
            body: (
              <>
                <p>We collect only what the app needs to work:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  <li><strong>Account email</strong> &mdash; used to create and verify your account. Stored by Supabase Auth.</li>
                  <li><strong>Saved commutes</strong> &mdash; origin and destination coordinates you explicitly save (home, work, etc.). Stored in our database, protected by row-level security so only you can read them.</li>
                  <li><strong>Search logs</strong> &mdash; when you search for a route, we record a <em>geohash</em> (a fuzzy grid cell, not your exact coordinates) along with your chosen transport preference. We never store the raw latitude/longitude from searches.</li>
                  <li><strong>Crowd reports</strong> &mdash; if you file a crowd report, it is linked to your account so you can delete it later.</li>
                </ul>
              </>
            ),
          },
          {
            title: '2. What we do NOT collect',
            body: (
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <li>We do not collect payment information.</li>
                <li>We do not sell your data to third parties.</li>
                <li>We do not record GPS traces from the live-tracking feature &mdash; position data is processed in your browser only and never sent to our servers.</li>
                <li>We do not share your saved routes or search history with advertisers.</li>
              </ul>
            ),
          },
          {
            title: '3. How we use your data',
            body: (
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <li>Account email: to send your email-verification link and password-reset emails.</li>
                <li>Saved commutes: to show you your saved routes across sessions.</li>
                <li>Geohashed search logs: to understand popular origin&ndash;destination corridors and improve route quality. Logs are deleted after 90 days.</li>
                <li>Crowd reports: to show crowding status to other users on the same route.</li>
              </ul>
            ),
          },
          {
            title: '4. Data retention',
            body: (
              <p>
                Search log entries are automatically deleted after <strong>90 days</strong>. Saved routes and crowd reports are kept until you delete your account or remove them yourself. Account data is deleted immediately when you request account deletion.
              </p>
            ),
          },
          {
            title: '5. Your rights (RA 10173)',
            body: (
              <>
                <p>As a data subject under the Philippine Data Privacy Act, you have the right to:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  <li><strong>Access</strong> &mdash; request a copy of the personal data we hold about you.</li>
                  <li><strong>Rectification</strong> &mdash; correct inaccurate data.</li>
                  <li><strong>Erasure</strong> &mdash; delete your account and all associated data using the &ldquo;Delete my account&rdquo; option in the app. We will remove your saved routes, crowd reports, and auth account immediately.</li>
                  <li><strong>Object</strong> &mdash; object to processing your data for analytics purposes.</li>
                </ul>
                <p style={{ marginTop: 8 }}>To exercise these rights, use the in-app deletion flow or contact us at the address below.</p>
              </>
            ),
          },
          {
            title: '6. Third-party services',
            body: (
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <li><strong>Supabase</strong> (database + auth) &mdash; data is stored in the ap-northeast-1 region. <a href="https://supabase.com/privacy" style={{ color: C.accent }}>Supabase Privacy Policy</a>.</li>
                <li><strong>Upstash Redis</strong> &mdash; used for rate limiting only; no personal data is stored. <a href="https://upstash.com/trust/privacy.pdf" style={{ color: C.accent }}>Upstash Privacy Policy</a>.</li>
                <li><strong>Vercel</strong> &mdash; hosting. Request logs are retained per Vercel&apos;s default policy. <a href="https://vercel.com/legal/privacy-policy" style={{ color: C.accent }}>Vercel Privacy Policy</a>.</li>
                <li><strong>Waze deep links</strong> &mdash; if you tap &ldquo;Navigate with Waze,&rdquo; your destination coordinate is sent to Waze. ParaPo does not receive any data back from Waze.</li>
                <li><strong>Google Fonts</strong> &mdash; loaded at runtime; Google may log your IP per their terms.</li>
              </ul>
            ),
          },
          {
            title: '7. Contact',
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
          <Link href="/" style={{ fontSize: 13, color: C.accent }}>&#8592; Back to ParaPo</Link>
        </div>
      </div>
    </div>
  );
}
