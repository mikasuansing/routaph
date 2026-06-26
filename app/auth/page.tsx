'use client';
import { useState } from 'react';

const FONT = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
body{font-family:'Inter',system-ui,sans-serif;}
input::placeholder{color:rgba(249,250,251,0.3);}
[data-theme="light"] input::placeholder{color:#A89E8E;}
input:focus{outline:none;}
button:active{opacity:0.85;}
@keyframes mesh{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
@keyframes spin{to{transform:rotate(360deg)}}
.fade-up{animation:fadeUp 0.45s ease both;}
`;

/* tokens — all pages use var() so they adapt to both themes */
const C = {
  bg:      'var(--color-bg)',
  surface: 'var(--color-surface)',
  card:    'var(--color-card)',
  border:  'var(--color-border)',
  muted:   'var(--color-muted)',
  body:    'var(--color-body)',
  ink:     'var(--color-ink)',
  accent:  'var(--color-accent)',
  accent2: 'var(--color-accent-2)',
  green:   'var(--color-green)',
  error:   'var(--color-error)',
  glass:   'var(--color-glass)',
  glassBorder: 'var(--color-glass-border)',
};

type Screen = 'splash' | 'login' | 'signup' | 'forgot' | 'verify' | 'success';

/* ── Logo ──────────────────────────────────────────────────────────────── */
function Logo({ size = 26 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
      <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.04em', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Para</span>
      <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.04em', color: C.ink }}>Po</span>
    </div>
  );
}

/* ── Glass input ───────────────────────────────────────────────────────── */
function Input({ label, type = 'text', value, onChange, placeholder, error, hint, rightEl }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; hint?: string; rightEl?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
      <div style={{
        position: 'relative',
        borderRadius: 12,
        background: C.glass,
        border: `1.5px solid ${error ? C.error : focused ? C.accent : C.glassBorder}`,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: focused ? `0 0 0 3px rgba(99,102,241,0.15)` : 'none',
      }}>
        <input
          type={type} value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{
            width: '100%', border: 'none', borderRadius: 12, outline: 'none',
            padding: rightEl ? '13px 44px 13px 16px' : '13px 16px',
            fontSize: 15, color: C.ink, background: 'transparent',
            fontFamily: 'inherit',
          }}
        />
        {rightEl && (
          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: C.muted }}>
            {rightEl}
          </div>
        )}
      </div>
      {error && <span style={{ fontSize: 12, color: C.error }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>}
    </div>
  );
}

/* ── Gradient primary button ────────────────────────────────────────────── */
function PrimaryBtn({ label, onClick, loading, disabled }: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{
      width: '100%', border: 'none', borderRadius: 12, padding: '15px',
      fontSize: 15, fontWeight: 700, cursor: loading || disabled ? 'default' : 'pointer',
      fontFamily: 'inherit', letterSpacing: '-0.01em', transition: 'opacity 0.15s, transform 0.1s',
      background: loading || disabled ? C.card : 'var(--gradient-primary)',
      color: loading || disabled ? C.muted : '#fff',
      boxShadow: loading || disabled ? 'none' : '0 4px 20px rgba(99,102,241,0.35)',
    }}>
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          Please wait…
        </span>
      ) : label}
    </button>
  );
}

/* ── Ghost button ───────────────────────────────────────────────────────── */
function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', background: C.glass, border: `1.5px solid ${C.glassBorder}`,
      borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 600,
      color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>{label}</button>
  );
}

/* ── Divider ────────────────────────────────────────────────────────────── */
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: C.glassBorder }} />
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.glassBorder }} />
    </div>
  );
}

/* ── Google button ──────────────────────────────────────────────────────── */
function GoogleBtn() {
  return (
    <button style={{
      width: '100%', background: C.glass, border: `1.5px solid ${C.glassBorder}`,
      borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, color: C.ink,
      cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 10, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
      </svg>
      Continue with Google
    </button>
  );
}

/* ── Eye icon ───────────────────────────────────────────────────────────── */
function Eye({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="9" cy="9" r="2.5"/></svg>
  ) : (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="9" cy="9" r="2.5"/><line x1="3" y1="3" x2="15" y2="15"/></svg>
  );
}

/* ── Back button ────────────────────────────────────────────────────────── */
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: C.glass, border: `1.5px solid ${C.glassBorder}`, borderRadius: 10, cursor: 'pointer', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, color: C.ink, fontSize: 14, fontWeight: 500 }}>
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 3l-6 5 6 5"/></svg>
      Back
    </button>
  );
}

/* ── Circuit SVG hero illustration ─────────────────────────────────────── */
function CircuitHero() {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" style={{ animation: 'pulse 3s ease-in-out infinite' }}>
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1"/>
          <stop offset="100%" stopColor="#06B6D4"/>
        </linearGradient>
        <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.2"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {/* grid */}
      {[40,80,120,160].map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="200" stroke="rgba(99,102,241,0.08)" strokeWidth="1"/>)}
      {[40,80,120,160].map(y => <line key={`h${y}`} x1="0" y1={y} x2="200" y2={y} stroke="rgba(99,102,241,0.08)" strokeWidth="1"/>)}
      {/* circuit traces */}
      <polyline points="40,160 40,120 80,120 80,80 120,80 120,40 160,40" fill="none" stroke="url(#g1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)"/>
      <polyline points="40,160 80,160 80,120 120,120 160,120 160,80" fill="none" stroke="rgba(99,102,241,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* nodes */}
      <circle cx="40"  cy="160" r="6" fill="url(#g1)" filter="url(#glow)"/>
      <circle cx="80"  cy="120" r="4" fill="rgba(99,102,241,0.5)"/>
      <circle cx="120" cy="80"  r="4" fill="rgba(99,102,241,0.5)"/>
      <circle cx="160" cy="40"  r="6" fill="url(#g1)" filter="url(#glow)"/>
      <circle cx="160" cy="80"  r="4" fill="rgba(6,182,212,0.5)"/>
      {/* halos */}
      <circle cx="40"  cy="160" r="12" fill="url(#g2)"/>
      <circle cx="160" cy="40"  r="12" fill="url(#g2)"/>
    </svg>
  );
}

/* ── Wrap ───────────────────────────────────────────────────────────────── */
const wrapStyle: React.CSSProperties = {
  minHeight: '100vh', background: C.bg,
  display: 'flex', flexDirection: 'column',
  fontFamily: 'Inter,system-ui,sans-serif',
};

export default function AuthFlow() {
  const [screen, setScreen]               = useState<Screen>('splash');
  const [loginEmail, setLoginEmail]       = useState('');
  const [loginPw, setLoginPw]             = useState('');
  const [showPw, setShowPw]               = useState(false);
  const [loginErr, setLoginErr]           = useState('');
  const [loginLoading, setLoginLoading]   = useState(false);
  const [signupName, setSignupName]       = useState('');
  const [signupEmail, setSignupEmail]     = useState('');
  const [signupPw, setSignupPw]           = useState('');
  const [showPw2, setShowPw2]             = useState(false);
  const [signupErr, setSignupErr]         = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotSent, setForgotSent]       = useState(false);
  const [otp, setOtp]                     = useState(['','','','','','']);

  /* ── SPLASH ─────────────────────────────────────────────────────────── */
  if (screen === 'splash') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 32px 24px', gap: 0 }}>
        <div style={{ marginBottom: 32, filter: 'drop-shadow(0 0 32px rgba(99,102,241,0.4))' }}>
          <CircuitHero />
        </div>
        <Logo size={36} />
        <p style={{ fontSize: 15, color: C.muted, marginTop: 10, textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
          Metro Manila commute intelligence — plan faster, ride smarter.
        </p>
        {/* subtle feature pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['A* Routing', '2024 Fares', 'MRT · LRT · Bus', 'Jeepney'].map(f => (
            <span key={f} style={{ fontSize: 11, fontWeight: 600, color: C.accent, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, padding: '4px 10px', letterSpacing: '0.03em' }}>{f}</span>
          ))}
        </div>
      </div>

      {/* CTA sheet */}
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 -1px 0 rgba(255,255,255,0.06)' }}>
        <PrimaryBtn label="Get started →" onClick={() => setScreen('signup')} />
        <GhostBtn label="I already have an account" onClick={() => setScreen('login')} />
        <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
          By continuing you agree to our{' '}
          <a href="/privacy" style={{ color: C.accent, textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  );

  /* ── LOGIN ──────────────────────────────────────────────────────────── */
  if (screen === 'login') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('splash')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <Logo size={26} />
          <p style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 4 }}>Welcome back</p>
          <p style={{ fontSize: 14, color: C.muted }}>Sign in to continue planning</p>
        </div>
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 10, animationDelay: '0.05s' }}>
          <Input label="Email" type="email" value={loginEmail} onChange={v => { setLoginEmail(v); setLoginErr(''); }} placeholder="you@email.com" error={loginErr && loginErr.includes('email') ? loginErr : ''} />
          <Input label="Password" type={showPw ? 'text' : 'password'} value={loginPw} onChange={v => { setLoginPw(v); setLoginErr(''); }} placeholder="••••••••"
            error={loginErr && !loginErr.includes('email') ? loginErr : ''}
            rightEl={<span onClick={() => setShowPw(!showPw)} style={{ color: C.muted }}><Eye open={showPw}/></span>}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button onClick={() => setScreen('forgot')} style={{ background: 'none', border: 'none', fontSize: 13, color: C.accent, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Forgot password?</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <PrimaryBtn label="Sign in" loading={loginLoading} disabled={!loginEmail || !loginPw}
            onClick={() => {
              if (!loginEmail.includes('@')) { setLoginErr('Enter a valid email address'); return; }
              if (loginPw.length < 6) { setLoginErr('Password must be at least 6 characters'); return; }
              setLoginLoading(true);
              setTimeout(() => { setLoginLoading(false); window.location.href = '/planner'; }, 1400);
            }}
          />
          <Divider label="or continue with" />
          <GoogleBtn />
        </div>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 'auto' }}>
          Don&apos;t have an account?{' '}
          <button onClick={() => setScreen('signup')} style={{ background: 'none', border: 'none', color: C.accent, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Sign up</button>
        </p>
      </div>
    </div>
  );

  /* ── SIGN UP ────────────────────────────────────────────────────────── */
  if (screen === 'signup') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('splash')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <Logo size={26} />
          <p style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em', marginTop: 20, marginBottom: 4 }}>Create account</p>
          <p style={{ fontSize: 14, color: C.muted }}>Plan your commute smarter</p>
        </div>
        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20, animationDelay: '0.05s' }}>
          <Input label="Full name" value={signupName} onChange={v => { setSignupName(v); setSignupErr(''); }} placeholder="Juan dela Cruz" error={signupErr && signupErr.includes('name') ? signupErr : ''} />
          <Input label="Email" type="email" value={signupEmail} onChange={v => { setSignupEmail(v); setSignupErr(''); }} placeholder="you@email.com" error={signupErr && signupErr.includes('email') ? signupErr : ''} />
          <div>
            <Input label="Password" type={showPw2 ? 'text' : 'password'} value={signupPw} onChange={v => { setSignupPw(v); setSignupErr(''); }}
              placeholder="At least 8 characters"
              error={signupErr && !signupErr.includes('name') && !signupErr.includes('email') ? signupErr : ''}
              hint={signupPw.length > 0 && signupPw.length < 8 ? `${8 - signupPw.length} more characters needed` : ''}
              rightEl={<span onClick={() => setShowPw2(!showPw2)}><Eye open={showPw2}/></span>}
            />
            {signupPw.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {[0,1,2,3].map(i => {
                  const filled = i < Math.min(Math.floor(signupPw.length / 2), 4);
                  const col = signupPw.length < 6 ? C.error : signupPw.length < 10 ? '#F97316' : C.green;
                  return <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, transition: 'background 0.25s', background: filled ? col : C.card }} />;
                })}
              </div>
            )}
          </div>
        </div>
        {/* Privacy consent */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, padding: '12px 14px', borderRadius: 12, background: C.glass, border: `1px solid ${C.glassBorder}` }}>
          <input type="checkbox" id="consent" checked={privacyConsent} onChange={e => setPrivacyConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0, width: 16, height: 16 }} />
          <label htmlFor="consent" style={{ fontSize: 12, color: C.body, lineHeight: 1.6, cursor: 'pointer' }}>
            I have read and agree to the{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</a>.
            ParaPo stores anonymised (geohashed) search logs for up to 90 days.
          </label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <PrimaryBtn label="Create account" loading={signupLoading} disabled={!signupName || !signupEmail || !signupPw || !privacyConsent}
            onClick={() => {
              if (!signupName.trim()) { setSignupErr('Enter your name'); return; }
              if (!signupEmail.includes('@')) { setSignupErr('Enter a valid email address'); return; }
              if (signupPw.length < 8) { setSignupErr('Password must be at least 8 characters'); return; }
              if (!privacyConsent) { setSignupErr('You must accept the Privacy Policy to continue'); return; }
              setSignupLoading(true);
              setTimeout(() => { setSignupLoading(false); setScreen('verify'); }, 1400);
            }}
          />
          <Divider label="or sign up with" />
          <GoogleBtn />
        </div>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>
          Already have an account?{' '}
          <button onClick={() => setScreen('login')} style={{ background: 'none', border: 'none', color: C.accent, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Sign in</button>
        </p>
      </div>
    </div>
  );

  /* ── FORGOT PASSWORD ─────────────────────────────────────────────────── */
  if (screen === 'forgot') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('login')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, border: '1px solid rgba(99,102,241,0.2)' }}>
          <svg width="26" height="26" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
            <rect x="4" y="11" width="18" height="13" rx="2"/>
            <path d="M8 11V7a5 5 0 0110 0v4"/>
            <circle cx="13" cy="17" r="1.5" fill={C.accent} stroke="none"/>
            <line x1="13" y1="18.5" x2="13" y2="20.5"/>
          </svg>
        </div>
        <p style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>
          {forgotSent ? 'Check your email' : 'Forgot password?'}
        </p>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, lineHeight: 1.7 }}>
          {forgotSent
            ? `We sent a reset link to ${forgotEmail}. Check your inbox and spam folder.`
            : "Enter your email and we'll send you a reset link."}
        </p>
        {!forgotSent ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <Input label="Email" type="email" value={forgotEmail} onChange={setForgotEmail} placeholder="you@email.com" />
            </div>
            <PrimaryBtn label="Send reset link" disabled={!forgotEmail.includes('@')} onClick={() => setForgotSent(true)} />
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PrimaryBtn label="Back to sign in" onClick={() => setScreen('login')} />
            <button onClick={() => setForgotSent(false)} style={{ background: 'none', border: 'none', fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0', textAlign: 'center' }}>Resend email</button>
          </div>
        )}
      </div>
    </div>
  );

  /* ── VERIFY OTP ─────────────────────────────────────────────────────── */
  if (screen === 'verify') return (
    <div style={wrapStyle}>
      <style>{`${FONT}
        .otp-box{
          width:46px;height:56px;border:1.5px solid var(--color-glass-border);
          border-radius:12px;text-align:center;font-size:22px;font-weight:700;
          color:var(--color-ink);background:var(--color-glass);
          font-family:inherit;transition:border-color 0.15s,box-shadow 0.15s;
          backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
        }
        .otp-box:focus{outline:none;border-color:var(--color-accent);box-shadow:0 0 0 3px rgba(99,102,241,0.15);}
      `}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('signup')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, border: '1px solid rgba(16,185,129,0.2)' }}>
          <svg width="26" height="26" fill="none" stroke={C.green} strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="7" width="20" height="14" rx="2"/>
            <path d="M3 9l10 7 10-7"/>
          </svg>
        </div>
        <p style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>Verify your email</p>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, lineHeight: 1.7 }}>
          We sent a 6-digit code to <strong style={{ color: C.ink }}>{signupEmail || 'your email'}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
          {otp.map((digit, i) => (
            <input key={i} className="otp-box" type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={e => {
                const val = e.target.value.replace(/\D/g,'');
                const next = [...otp]; next[i] = val; setOtp(next);
                if (val && i < 5) { const els = document.querySelectorAll('.otp-box') as NodeListOf<HTMLInputElement>; els[i+1]?.focus(); }
              }}
              onKeyDown={e => {
                if (e.key === 'Backspace' && !otp[i] && i > 0) { const els = document.querySelectorAll('.otp-box') as NodeListOf<HTMLInputElement>; els[i-1]?.focus(); }
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PrimaryBtn label="Verify account" disabled={otp.join('').length < 6} onClick={() => setScreen('success')} />
          <button style={{ background: 'none', border: 'none', fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0', textAlign: 'center' }}>
            Didn&apos;t receive it? <span style={{ color: C.accent, fontWeight: 600 }}>Resend code</span>
          </button>
        </div>
      </div>
    </div>
  );

  /* ── SUCCESS ────────────────────────────────────────────────────────── */
  return (
    <div style={{ ...wrapStyle, alignItems: 'center', justifyContent: 'center' }}>
      <style>{FONT}</style>
      <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 32px', textAlign: 'center', maxWidth: 360, width: '100%' }}>
        {/* Success ring */}
        <div style={{ position: 'relative', width: 80, height: 80 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="38" height="38" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><path d="M9 19l8 8L30 10"/></svg>
          </div>
          <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1px solid rgba(16,185,129,0.15)', animation: 'pulse 2s ease-in-out infinite' }} />
        </div>
        <div>
          <Logo size={24} />
          <p style={{ fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 8 }}>
            You&apos;re all set{signupName ? `, ${signupName.split(' ')[0]}` : ''}!
          </p>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
            Your account is ready. Start planning your first commute.
          </p>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <a href="/planner" style={{
            display: 'block', textDecoration: 'none', borderRadius: 12,
            padding: '15px', fontSize: 15, fontWeight: 700, textAlign: 'center',
            background: 'var(--gradient-primary)', color: '#fff',
            boxShadow: '0 4px 20px rgba(99,102,241,0.35)', letterSpacing: '-0.01em',
          }}>
            Start planning →
          </a>
          <button onClick={() => { setScreen('splash'); setSignupName(''); setSignupEmail(''); setSignupPw(''); setLoginEmail(''); setLoginPw(''); setOtp(['','','','','','']); }}
            style={{ background: 'none', border: 'none', fontSize: 13, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
