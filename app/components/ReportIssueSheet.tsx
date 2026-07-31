'use client';
import { useState } from 'react';

/*
 * "Report an issue" — shared between the planner route-detail screen and
 * the trip companion. Posts to /api/v1/crowd-reports (crowd_reports table).
 * Uses CSS vars directly (not a page's local color const) since this
 * component is mounted from two different pages with separate token maps.
 */

type Category = 'wrong_fare' | 'wrong_stop' | 'route_missing' | 'other';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'wrong_fare',     label: 'Fare looks wrong' },
  { key: 'wrong_stop',     label: 'Stop location is off' },
  { key: 'route_missing',  label: "This route doesn't exist" },
  { key: 'other',          label: 'Something else' },
];

type Status = 'idle' | 'sending' | 'sent' | 'failed';

export function ReportIssueButton({ stopId, routeId, contextLabel }: {
  stopId?: number;
  routeId?: number;
  contextLabel: string;
}) {
  const [open, setOpen]         = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [note, setNote]         = useState('');
  const [status, setStatus]     = useState<Status>('idle');

  function reset() {
    setOpen(false);
    setCategory(null);
    setNote('');
    setStatus('idle');
  }

  async function submit() {
    if (!category) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/v1/crowd-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopId, routeId, category, note: note.trim() || undefined }),
      });
      setStatus(res.ok ? 'sent' : 'failed');
    } catch {
      setStatus('failed');
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textDecoration: 'underline',
      }}>
        Report an issue
      </button>
    );
  }

  return (
    <div style={{
      background: 'var(--color-card)', border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 14, marginTop: 8,
    }}>
      {status === 'sent' ? (
        <>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-ink)' }}>Thanks — report sent.</p>
          <button onClick={reset} style={{ background: 'none', border: 'none', padding: '8px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Close</button>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Report an issue — {contextLabel}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCategory(c.key)} style={{
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                padding: '6px 12px', borderRadius: 999,
                background: category === c.key ? 'var(--color-ink)' : 'transparent',
                color: category === c.key ? 'var(--color-bg)' : 'var(--color-body)',
                border: `1.5px solid ${category === c.key ? 'var(--color-ink)' : 'var(--color-border)'}`,
              }}>{c.label}</button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 200))}
            placeholder="Details (optional)"
            rows={2}
            style={{
              width: '100%', resize: 'none', fontFamily: 'inherit', fontSize: 13,
              padding: 10, borderRadius: 10, border: '1px solid var(--color-border)',
              background: 'var(--color-surface)', color: 'var(--color-ink)', marginBottom: 10,
            }}
          />
          {status === 'failed' && (
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-error)' }}>
              Couldn&apos;t send — check your connection and try again.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={submit}
              disabled={!category || status === 'sending'}
              style={{
                cursor: category ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                padding: '8px 16px', borderRadius: 999, border: 'none',
                background: category ? 'var(--color-accent)' : 'var(--color-card-el)',
                color: category ? 'var(--color-on-primary)' : 'var(--color-muted)',
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button onClick={reset} style={{
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              padding: '8px 16px', borderRadius: 999, border: 'none', background: 'none', color: 'var(--color-muted)',
            }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
