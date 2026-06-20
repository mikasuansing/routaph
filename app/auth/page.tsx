'use client';
import { useState } from 'react';

const C = {
  bg:      '#F4F0E8',
  surface: '#FFFFFF',
  card:    '#F9F7F2',
  border:  '#E2DBD0',
  muted:   '#A89E8E',
  body:    '#3D3530',
  ink:     '#1A1410',
  accent:  '#D05A28',
  green:   '#2D7A4F',
  blue:    '#1A5FA8',
  error:   '#B83030',
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;margin:0;padding:0;}
input::placeholder{color:#A89E8E;}
input:focus{outline:none;border-color:#1A1410 !important;}
button:active{opacity:0.85;}`;

type Screen = 'splash' | 'login' | 'signup' | 'forgot' | 'verify' | 'success';

function Logo({ size = 24 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
      <span style={{ fontSize: size, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em', fontFamily: 'Inter,sans-serif' }}>Para</span>
      <span style={{ fontSize: size, fontWeight: 700, color: C.accent, letterSpacing: '-0.03em', fontFamily: 'Inter,sans-serif' }}>Po</span>
    </div>
  );
}

function Input({ label, type='text', value, onChange, placeholder, error, hint, rightEl }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; hint?: string; rightEl?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', border: `1.5px solid ${error ? C.error : C.border}`,
            borderRadius: 10, padding: rightEl ? '13px 44px 13px 14px' : '13px 14px',
            fontSize: 15, color: C.ink, background: C.surface,
            fontFamily: 'Inter,sans-serif', transition: 'border-color 0.15s',
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

function PrimaryBtn({ label, onClick, loading, disabled }: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{
      width: '100%', background: loading || disabled ? '#C8C0B4' : C.ink,
      color: '#fff', border: 'none', borderRadius: 10, padding: '15px',
      fontSize: 15, fontWeight: 600, cursor: loading || disabled ? 'default' : 'pointer',
      fontFamily: 'Inter,sans-serif', letterSpacing: '-0.01em', transition: 'background 0.15s',
    }}>
      {loading ? 'Please wait…' : label}
    </button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

function GoogleBtn() {
  return (
    <button style={{
      width: '100%', background: C.surface, border: `1.5px solid ${C.border}`,
      borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 500, color: C.ink,
      cursor: 'pointer', fontFamily: 'Inter,sans-serif', display: 'flex',
      alignItems: 'center', justifyContent: 'center', gap: 10,
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

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/>
      <circle cx="9" cy="9" r="2.5"/>
    </svg>
  ) : (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/>
      <circle cx="9" cy="9" r="2.5"/>
      <line x1="3" y1="3" x2="15" y2="15"/>
    </svg>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6, color: C.ink, fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 500 }}>
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4l-7 5 7 5"/></svg>
      Back
    </button>
  );
}

export default function AuthFlow() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loginErr, setLoginErr]     = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [signupName, setSignupName]   = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPw, setSignupPw]       = useState('');
  const [showPw2, setShowPw2]         = useState(false);
  const [signupErr, setSignupErr]     = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent]   = useState(false);
  const [otp, setOtp] = useState(['','','','','','']);

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: C.bg,
    display: 'flex', flexDirection: 'column',
    fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,sans-serif',
  };

  // ── SPLASH ────────────────────────────────────────────────────────────────
  if (screen === 'splash') return (
    <div style={wrap}>
      <style>{FONT}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 32px 40px' }}>
        <div style={{ width: 220, height: 220, marginBottom: 40 }}>
          <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r="106" fill="#EDE6D6" stroke={C.border} strokeWidth="1"/>
            <line x1="20" y1="80"  x2="200" y2="80"  stroke={C.border} strokeWidth="8"  strokeLinecap="round"/>
            <line x1="20" y1="110" x2="200" y2="110" stroke={C.border} strokeWidth="12" strokeLinecap="round"/>
            <line x1="20" y1="145" x2="200" y2="145" stroke={C.border} strokeWidth="6"  strokeLinecap="round"/>
            <line x1="70"  y1="20" x2="70"  y2="200" stroke={C.border} strokeWidth="6"  strokeLinecap="round"/>
            <line x1="110" y1="20" x2="110" y2="200" stroke={C.border} strokeWidth="10" strokeLinecap="round"/>
            <line x1="155" y1="20" x2="155" y2="200" stroke={C.border} strokeWidth="6"  strokeLinecap="round"/>
            <polyline points="40,80 70,80 70,110 155,110 155,145 180,145" fill="none" stroke={C.accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="40"  cy="80"  r="6" fill={C.green}  stroke="white" strokeWidth="2"/>
            <circle cx="70"  cy="110" r="5" fill={C.border} stroke="white" strokeWidth="2"/>
            <circle cx="155" cy="110" r="5" fill={C.border} stroke="white" strokeWidth="2"/>
            <circle cx="180" cy="145" r="6" fill={C.accent} stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <Logo size={32} />
        <p style={{ fontSize: 15, color: C.muted, marginTop: 10, textAlign: 'center', lineHeight: 1.6, maxWidth: 260 }}>
          Metro Manila commute intelligence — plan faster, ride smarter.
        </p>
      </div>
      <div style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 -4px 24px rgba(0,0,0,0.07)' }}>
        <PrimaryBtn label="Get started" onClick={() => setScreen('signup')} />
        <button onClick={() => setScreen('login')} style={{ width: '100%', background: 'transparent', border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, color: C.ink, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          I already have an account
        </button>
        <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6, marginTop: 4 }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (screen === 'login') return (
    <div style={wrap}>
      <style>{FONT}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('splash')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ marginBottom: 32 }}>
          <Logo size={28} />
          <p style={{ fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 4 }}>Welcome back</p>
          <p style={{ fontSize: 14, color: C.muted }}>Sign in to continue</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 10 }}>
          <Input label="Email" type="email" value={loginEmail} onChange={v => { setLoginEmail(v); setLoginErr(''); }} placeholder="you@email.com" error={loginErr && loginErr.includes('email') ? loginErr : ''} />
          <Input label="Password" type={showPw ? 'text' : 'password'} value={loginPw} onChange={v => { setLoginPw(v); setLoginErr(''); }} placeholder="••••••••"
            error={loginErr && !loginErr.includes('email') ? loginErr : ''}
            rightEl={<span onClick={() => setShowPw(!showPw)}><EyeIcon open={showPw}/></span>}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button onClick={() => setScreen('forgot')} style={{ background: 'none', border: 'none', fontSize: 13, color: C.accent, cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontWeight: 500 }}>Forgot password?</button>
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
          <button onClick={() => setScreen('signup')} style={{ background: 'none', border: 'none', color: C.accent, fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: 'Inter,sans-serif' }}>Sign up</button>
        </p>
      </div>
    </div>
  );

  // ── SIGN UP ───────────────────────────────────────────────────────────────
  if (screen === 'signup') return (
    <div style={wrap}>
      <style>{FONT}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('splash')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 28 }}>
          <Logo size={28} />
          <p style={{ fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 4 }}>Create account</p>
          <p style={{ fontSize: 14, color: C.muted }}>Plan your commute smarter</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          <Input label="Full name" value={signupName} onChange={v => { setSignupName(v); setSignupErr(''); }} placeholder="Juan dela Cruz" error={signupErr && signupErr.includes('name') ? signupErr : ''} />
          <Input label="Email" type="email" value={signupEmail} onChange={v => { setSignupEmail(v); setSignupErr(''); }} placeholder="you@email.com" error={signupErr && signupErr.includes('email') ? signupErr : ''} />
          <div>
            <Input label="Password" type={showPw2 ? 'text' : 'password'} value={signupPw} onChange={v => { setSignupPw(v); setSignupErr(''); }}
              placeholder="At least 8 characters"
              error={signupErr && !signupErr.includes('name') && !signupErr.includes('email') ? signupErr : ''}
              hint={signupPw.length > 0 && signupPw.length < 8 ? `${8 - signupPw.length} more characters needed` : ''}
              rightEl={<span onClick={() => setShowPw2(!showPw2)}><EyeIcon open={showPw2}/></span>}
            />
            {signupPw.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, transition: 'background 0.2s',
                    background: i < Math.min(Math.floor(signupPw.length / 2), 4)
                      ? (signupPw.length < 6 ? C.error : signupPw.length < 10 ? '#B8962E' : C.green)
                      : C.border }}/>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <PrimaryBtn label="Create account" loading={signupLoading} disabled={!signupName || !signupEmail || !signupPw}
            onClick={() => {
              if (!signupName.trim()) { setSignupErr('Enter your name'); return; }
              if (!signupEmail.includes('@')) { setSignupErr('Enter a valid email address'); return; }
              if (signupPw.length < 8) { setSignupErr('Password must be at least 8 characters'); return; }
              setSignupLoading(true);
              setTimeout(() => { setSignupLoading(false); setScreen('verify'); }, 1400);
            }}
          />
          <Divider label="or sign up with" />
          <GoogleBtn />
        </div>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>
          Already have an account?{' '}
          <button onClick={() => setScreen('login')} style={{ background: 'none', border: 'none', color: C.accent, fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: 'Inter,sans-serif' }}>Sign in</button>
        </p>
      </div>
    </div>
  );

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  if (screen === 'forgot') return (
    <div style={wrap}>
      <style>{FONT}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('login')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FBE9E0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="26" height="26" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
            <rect x="4" y="11" width="18" height="13" rx="2"/>
            <path d="M8 11V7a5 5 0 0110 0v4"/>
            <circle cx="13" cy="17" r="1.5" fill={C.accent} stroke="none"/>
            <line x1="13" y1="18.5" x2="13" y2="20.5"/>
          </svg>
        </div>
        <p style={{ fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>
          {forgotSent ? 'Check your email' : 'Forgot password?'}
        </p>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, lineHeight: 1.6 }}>
          {forgotSent ? `We sent a reset link to ${forgotEmail}. Check your inbox and spam folder.` : "Enter your email and we'll send you a link to reset your password."}
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
            <button onClick={() => setForgotSent(false)} style={{ background: 'none', border: 'none', fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'Inter,sans-serif', padding: '10px 0' }}>Resend email</button>
          </div>
        )}
      </div>
    </div>
  );

  // ── VERIFY OTP ────────────────────────────────────────────────────────────
  if (screen === 'verify') return (
    <div style={wrap}>
      <style>{`${FONT}
        .otp-box{width:46px;height:54px;border:1.5px solid #E2DBD0;border-radius:10px;text-align:center;font-size:22px;font-weight:700;color:#1A1410;background:#fff;font-family:Inter,sans-serif;transition:border-color 0.15s;}
        .otp-box:focus{outline:none;border-color:#1A1410;}
      `}</style>
      <div style={{ padding: '56px 24px 0' }}><BackBtn onClick={() => setScreen('signup')} /></div>
      <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#E8F3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="26" height="26" fill="none" stroke={C.green} strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="7" width="20" height="14" rx="2"/>
            <path d="M3 9l10 7 10-7"/>
          </svg>
        </div>
        <p style={{ fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginBottom: 8 }}>Verify your email</p>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, lineHeight: 1.6 }}>
          We sent a 6-digit code to <strong style={{ color: C.ink }}>{signupEmail || 'your email'}</strong>. Enter it below to confirm your account.
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
                if (e.key==='Backspace' && !otp[i] && i>0) { const els = document.querySelectorAll('.otp-box') as NodeListOf<HTMLInputElement>; els[i-1]?.focus(); }
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PrimaryBtn label="Verify account" disabled={otp.join('').length < 6} onClick={() => setScreen('success')} />
          <button style={{ background: 'none', border: 'none', fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'Inter,sans-serif', padding: '10px 0', textAlign: 'center' }}>
            Didn&apos;t receive it? <span style={{ color: C.accent, fontWeight: 600 }}>Resend code</span>
          </button>
        </div>
      </div>
    </div>
  );

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  return (
    <div style={{ ...wrap, alignItems: 'center', justifyContent: 'center', background: C.surface }}>
      <style>{FONT}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 32px', textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: '#E8F3EC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="36" height="36" fill="none" stroke={C.green} strokeWidth="2.2" strokeLinecap="round"><path d="M8 18l7 7L28 11"/></svg>
        </div>
        <div>
          <Logo size={26} />
          <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em', marginTop: 14, marginBottom: 8 }}>
            You&apos;re all set{signupName ? `, ${signupName.split(' ')[0]}` : ''}!
          </p>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Your account is ready. Start planning your first commute.
          </p>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <a href="/planner" style={{
            display: 'block', background: C.ink, color: '#fff', borderRadius: 10,
            padding: '15px', fontSize: 15, fontWeight: 600, textAlign: 'center',
            textDecoration: 'none', letterSpacing: '-0.01em',
          }}>
            Start planning →
          </a>
          <button onClick={() => { setScreen('splash'); setSignupName(''); setSignupEmail(''); setSignupPw(''); setLoginEmail(''); setLoginPw(''); setOtp(['','','','','','']); }}
            style={{ background: 'none', border: 'none', fontSize: 13, color: C.muted, cursor: 'pointer', fontFamily: 'Inter,sans-serif', padding: '8px 0' }}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
