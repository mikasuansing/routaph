'use client';

/*
 * Catches errors in the root layout itself (ThemeProvider, ServiceWorker
 * registration) rather than in a page underneath it, which is what
 * app/error.tsx handles. Much rarer, but if it fires, app/error.tsx isn't
 * mounted either, since this REPLACES the root layout entirely.
 *
 * Per Next's docs this file gets no access to globals.css, no theme
 * attribute, no font imports: it renders its own bare <html>/<body>. So
 * colors are hardcoded here rather than read from CSS custom properties,
 * matching the light theme (the OS-level default) since there is no theme
 * provider mounted to ask.
 */

import { useEffect } from 'react';
import { captureError } from '@/lib/monitoring';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('RoutaPH root layout error:', error);
    captureError(error, { boundary: 'app/global-error.tsx' });
  }, [error]);

  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh', background: '#F3EEE2',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#2947DE' }}>
            RoutaPH<span style={{ color: '#191610' }}>.</span>
          </span>
          <h1 style={{ margin: '18px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#191610' }}>
            RoutaPH could not start
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 15, color: '#4A4436', lineHeight: 1.7 }}>
            Something broke before the app itself could load. Reloading
            usually fixes this.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: 22, width: '100%', padding: '15px 16px', borderRadius: 999,
              border: 'none', background: '#2947DE', color: '#FFFFFF',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
