'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

/*
 * Auth — wired to Supabase Auth.
 * Monochrome minimal: typography carries the hierarchy; the single accent
 * (transit green) marks success states only. No gradients, no glass.
 */

const FONT = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800&family=Baloo+2:wght@600;700;800&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
body{font-family:var(--font-sans);}
input:focus{outline:none;}
button:active{opacity:0.85;}
@keyframes spin{to{transform:rotate(360deg)}}
`;

const DISPLAY = 'var(--font-display)';

const C = {
  bg:     'var(--color-bg)',
  border: 'var(--color-border)',
  muted:  'var(--color-muted)',
  body:   'var(--color-body)',
  ink:    'var(--color-ink)',
  accent: 'var(--color-accent)',
  error:  'var(--color-error)',
  onPrimary: 'var(--color-on-primary)',
};

type Screen = 'splash' | 'login' | 'signup' | 'forgot' | 'verify' | 'success';

const DEMO_EMAIL = 'demo@parapo.app';
const DEMO_PASSWORD = 'ParaPo2026!';

function nextUrl(): string {
  try {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && next.startsWith('/')) return next;
  } catch { /* SSR guard */ }
  return '/planner';
}

/* ── Wordmark ─────────────────────────────────────────────────────────────── */
function Logo({ size = 24 }: { size?: number }) {
  return (
    <span style={{ fontFamily: DISPLAY, fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: C.accent }}>
      ParaPo<span style={{ color: C.ink }}>.</span>
    </span>
  );
}

/* ── Underline input — no boxes ───────────────────────────────────────────── */
function Field({ label, type = 'text', value, onChange, placeholder, error, hint, rightEl, autoComplete }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; hint?: string; rightEl?: React.ReactNode; autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: error ? C.error : focused ? C.ink : C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </label>
      <div style={{ position: 'relative', borderBottom: `2px solid ${error ? C.error : focused ? C.ink : C.border}`, transition: 'border-color 0.15s' }}>
        <input
          type={type} value={value} autoComplete={autoComplete}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{ width: '100%', border: 'none', background: 'transparent', padding: rightEl ? '12px 40px 12px 0' : '12px 0', fontSize: 17, fontWeight: 500, color: C.ink, fontFamily: 'inherit' }}
        />
        {rightEl && (
          <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: C.muted }}>
            {rightEl}
          </div>
        )}
      </div>
      {error && <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: C.error }}>{error}</p>}
      {hint && !error && <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted }}>{hint}</p>}
    </div>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */
function PrimaryBtn({ label, onClick, loading, disabled }: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  const inactive = loading || disabled;
  return (
    <button onClick={onClick} disabled={inactive} style={{
      width: '100%', border: 'none', borderRadius: 999, padding: '16px',
      fontSize: 15, fontWeight: 700, cursor: inactive ? 'default' : 'pointer',
      fontFamily: 'inherit', letterSpacing: '0.01em',
      background: inactive ? 'var(--color-card-el)' : 'var(--gradient-primary)',
      color: inactive ? C.muted : C.onPrimary,
      boxShadow: inactive ? 'none' : '0 6px 18px rgba(41,71,222,0.25)',
    }}>
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ width: 14, height: 14, border: `2px solid ${C.muted}`, borderTopColor: C.onPrimary, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          Please wait
        </span>
      ) : label}
    </button>
  );
}

function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', background: C.ink, border: 'none',
      borderRadius: 999, padding: '16px', fontSize: 15, fontWeight: 700,
      color: C.bg, cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

function TextBtn({ label, onClick, strong }: { label: string; onClick: () => void; strong?: boolean }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', fontSize: 14, fontWeight: strong ? 700 : 500, color: strong ? C.ink : C.muted, cursor: 'pointer', fontFamily: 'inherit', textDecoration: strong ? 'underline' : 'none', padding: 0 }}>
      {label}
    </button>
  );
}

function Eye({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="9" cy="9" r="2.5"/></svg>
  ) : (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="9" cy="9" r="2.5"/><line x1="3" y1="3" x2="15" y2="15"/></svg>
  );
}

const wrapStyle: React.CSSProperties = {
  minHeight: '100vh', background: C.bg, color: C.ink,
  display: 'flex', flexDirection: 'column',
  fontFamily: 'Inter,system-ui,sans-serif',
};

export default function AuthFlow() {
  // Land on the sign-in form directly — the splash stays reachable via Back
  const [screen, setScreen]               = useState<Screen>('login');
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
  const [forgotErr, setForgotErr]         = useState('');
  const [otp, setOtp]                     = useState(['','','','','','']);
  const [otpErr, setOtpErr]               = useState('');
  const [otpLoading, setOtpLoading]       = useState(false);

  /* Already signed in? Straight to the app. */
  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (active && data.session) window.location.href = nextUrl();
    });
    return () => { active = false; };
  }, []);

  async function handleLogin() {
    if (!loginEmail.includes('@')) { setLoginErr('Enter a valid email address'); return; }
    if (loginPw.length < 6) { setLoginErr('Password must be at least 6 characters'); return; }
    setLoginLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email: loginEmail, password: loginPw });
    setLoginLoading(false);
    if (error) { setLoginErr(error.message); return; }
    window.location.href = nextUrl();
  }

  async function handleSignup() {
    if (!signupName.trim()) { setSignupErr('Enter your name'); return; }
    if (!signupEmail.includes('@')) { setSignupErr('Enter a valid email address'); return; }
    if (signupPw.length < 8) { setSignupErr('Password must be at least 8 characters'); return; }
    if (!privacyConsent) { setSignupErr('You must accept the Privacy Policy to continue'); return; }
    setSignupLoading(true);
    const { data, error } = await supabaseBrowser.auth.signUp({
      email: signupEmail,
      password: signupPw,
      options: { data: { full_name: signupName.trim() } },
    });
    setSignupLoading(false);
    if (error) { setSignupErr(error.message); return; }
    // Email confirmations off → session issued immediately; on → 6-digit code
    setScreen(data.session ? 'success' : 'verify');
  }

  async function handleVerify() {
    const token = otp.join('');
    if (token.length < 6) return;
    setOtpLoading(true);
    const { error } = await supabaseBrowser.auth.verifyOtp({ type: 'signup', email: signupEmail, token });
    setOtpLoading(false);
    if (error) { setOtpErr(error.message); return; }
    setScreen('success');
  }

  async function handleForgot() {
    setForgotErr('');
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) { setForgotErr(error.message); return; }
    setForgotSent(true);
  }

  async function handleGoogle() {
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${nextUrl()}` },
    });
    if (error) setLoginErr(`Google sign-in unavailable: ${error.message}`);
  }

  const backRow = (to: Screen) => (
    <div style={{ padding: '56px 24px 0' }}>
      <TextBtn label="← Back" onClick={() => setScreen(to)} />
    </div>
  );

  /* ── SPLASH ─────────────────────────────────────────────────────────── */
  if (screen === 'splash') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
        <Logo size={40} />
        <h1 style={{ margin: '28px 0 0', fontFamily: DISPLAY, fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, color: C.ink }}>
          Know your commute before you leave.
        </h1>
        <p style={{ margin: '20px 0 0', fontSize: 16, color: C.body, lineHeight: 1.6, maxWidth: 320 }}>
          Metro Manila routes, fares, and live trip tracking — MRT, LRT, bus, and jeepney in one plan.
        </p>
        <p style={{ margin: '24px 0 0', fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          A* routing · 2024 fares · GPS trip companion
        </p>
      </div>
      <div style={{ padding: '0 24px 48px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PrimaryBtn label="Get started" onClick={() => setScreen('signup')} />
        <GhostBtn label="I already have an account" onClick={() => setScreen('login')} />
        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
          By continuing you agree to our <a href="/privacy" style={{ color: C.ink, fontWeight: 600 }}>Privacy Policy</a>.
        </p>
      </div>
    </div>
  );

  /* ── LOGIN ──────────────────────────────────────────────────────────── */
  if (screen === 'login') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      {backRow('splash')}
      <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink }}>Sign in</h1>
        <p style={{ margin: '8px 0 36px', fontSize: 15, color: C.body }}>Plan faster with saved commutes.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Field label="Email" type="email" autoComplete="email" value={loginEmail} onChange={v => { setLoginEmail(v); setLoginErr(''); }} placeholder="you@email.com" />
          <Field label="Password" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={loginPw} onChange={v => { setLoginPw(v); setLoginErr(''); }} placeholder="••••••••"
            error={loginErr}
            rightEl={<span onClick={() => setShowPw(!showPw)}><Eye open={showPw}/></span>}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0 28px' }}>
          <TextBtn label="Forgot password?" onClick={() => setScreen('forgot')} strong />
        </div>
        <PrimaryBtn label="Sign in" loading={loginLoading} disabled={!loginEmail || !loginPw} onClick={handleLogin} />
        <div style={{ margin: '18px 0' }}>
          <GhostBtn label="Continue with Google" onClick={handleGoogle} />
        </div>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Demo account — email <strong style={{ color: C.body }}>{DEMO_EMAIL}</strong> · password <strong style={{ color: C.body }}>{DEMO_PASSWORD}</strong>
        </p>
        <p style={{ fontSize: 14, color: C.body, textAlign: 'center', marginTop: 'auto', paddingTop: 24 }}>
          No account yet? <TextBtn label="Sign up" onClick={() => setScreen('signup')} strong />
        </p>
      </div>
    </div>
  );

  /* ── SIGN UP ────────────────────────────────────────────────────────── */
  if (screen === 'signup') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      {backRow('splash')}
      <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink }}>Create account</h1>
        <p style={{ margin: '8px 0 32px', fontSize: 15, color: C.body }}>Save commutes and trip history.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Field label="Full name" autoComplete="name" value={signupName} onChange={v => { setSignupName(v); setSignupErr(''); }} placeholder="Juan dela Cruz" />
          <Field label="Email" type="email" autoComplete="email" value={signupEmail} onChange={v => { setSignupEmail(v); setSignupErr(''); }} placeholder="you@email.com" />
          <Field label="Password" type={showPw2 ? 'text' : 'password'} autoComplete="new-password" value={signupPw} onChange={v => { setSignupPw(v); setSignupErr(''); }}
            placeholder="At least 8 characters"
            error={signupErr}
            hint={signupPw.length > 0 && signupPw.length < 8 ? `${8 - signupPw.length} more characters needed` : ''}
            rightEl={<span onClick={() => setShowPw2(!showPw2)}><Eye open={showPw2}/></span>}
          />
        </div>
        <label htmlFor="consent" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '26px 0', cursor: 'pointer' }}>
          <input type="checkbox" id="consent" checked={privacyConsent} onChange={e => setPrivacyConsent(e.target.checked)} style={{ marginTop: 3, accentColor: C.ink, cursor: 'pointer', flexShrink: 0, width: 16, height: 16 }} />
          <span style={{ fontSize: 13, color: C.body, lineHeight: 1.6 }}>
            I have read and agree to the{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.ink, fontWeight: 600 }}>Privacy Policy</a>.
            ParaPo stores anonymised (geohashed) search logs for up to 90 days.
          </span>
        </label>
        <PrimaryBtn label="Create account" loading={signupLoading} disabled={!signupName || !signupEmail || !signupPw || !privacyConsent} onClick={handleSignup} />
        <div style={{ margin: '14px 0' }}>
          <GhostBtn label="Sign up with Google" onClick={handleGoogle} />
        </div>
        <p style={{ fontSize: 14, color: C.body, textAlign: 'center', paddingTop: 8 }}>
          Already have an account? <TextBtn label="Sign in" onClick={() => setScreen('login')} strong />
        </p>
      </div>
    </div>
  );

  /* ── FORGOT PASSWORD ─────────────────────────────────────────────────── */
  if (screen === 'forgot') return (
    <div style={wrapStyle}>
      <style>{FONT}</style>
      {backRow('login')}
      <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink }}>
          {forgotSent ? 'Check your email' : 'Reset password'}
        </h1>
        <p style={{ margin: '10px 0 36px', fontSize: 15, color: C.body, lineHeight: 1.7 }}>
          {forgotSent
            ? `We sent a reset link to ${forgotEmail}. Check your inbox and spam folder.`
            : "Enter your email and we'll send you a reset link."}
        </p>
        {!forgotSent ? (
          <>
            <div style={{ marginBottom: 28 }}>
              <Field label="Email" type="email" autoComplete="email" value={forgotEmail} onChange={setForgotEmail} placeholder="you@email.com" error={forgotErr} />
            </div>
            <PrimaryBtn label="Send reset link" disabled={!forgotEmail.includes('@')} onClick={handleForgot} />
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PrimaryBtn label="Back to sign in" onClick={() => setScreen('login')} />
            <TextBtn label="Resend email" onClick={() => setForgotSent(false)} />
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
          width:46px;height:58px;border:none;border-bottom:2px solid var(--color-border);
          text-align:center;font-size:24px;font-weight:700;
          color:var(--color-ink);background:transparent;
          font-family:inherit;transition:border-color 0.15s;border-radius:0;
        }
        .otp-box:focus{outline:none;border-bottom-color:var(--color-ink);}
      `}</style>
      {backRow('signup')}
      <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink }}>Verify your email</h1>
        <p style={{ margin: '10px 0 36px', fontSize: 15, color: C.body, lineHeight: 1.7 }}>
          We sent a 6-digit code to <strong style={{ color: C.ink }}>{signupEmail || 'your email'}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          {otp.map((digit, i) => (
            <input key={i} className="otp-box" type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={e => {
                const val = e.target.value.replace(/\D/g,'');
                const next = [...otp]; next[i] = val; setOtp(next); setOtpErr('');
                if (val && i < 5) { const els = document.querySelectorAll('.otp-box') as NodeListOf<HTMLInputElement>; els[i+1]?.focus(); }
              }}
              onKeyDown={e => {
                if (e.key === 'Backspace' && !otp[i] && i > 0) { const els = document.querySelectorAll('.otp-box') as NodeListOf<HTMLInputElement>; els[i-1]?.focus(); }
              }}
            />
          ))}
        </div>
        {otpErr && <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: C.error, textAlign: 'center' }}>{otpErr}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <PrimaryBtn label="Verify account" loading={otpLoading} disabled={otp.join('').length < 6} onClick={handleVerify} />
          <TextBtn label="Didn't receive it? Resend code" onClick={async () => {
            await supabaseBrowser.auth.resend({ type: 'signup', email: signupEmail });
          }} />
        </div>
      </div>
    </div>
  );

  /* ── SUCCESS ────────────────────────────────────────────────────────── */
  return (
    <div style={{ ...wrapStyle, alignItems: 'center', justifyContent: 'center' }}>
      <style>{FONT}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 32px', textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent }}>✓ Account ready</span>
        <h1 style={{ margin: '10px 0 0', fontFamily: DISPLAY, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink }}>
          You&apos;re all set{signupName ? `, ${signupName.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, color: C.body, lineHeight: 1.7 }}>
          Start planning your first commute.
        </p>
        <div style={{ width: '100%', marginTop: 28 }}>
          <PrimaryBtn label="Start planning →" onClick={() => { window.location.href = nextUrl(); }} />
        </div>
      </div>
    </div>
  );
}
