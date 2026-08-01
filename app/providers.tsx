'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = 'parapo-theme';
const DEFAULT_THEME: Theme = 'dark';

/*
 * The chosen theme lives in localStorage, which the server cannot read — so
 * the server always renders DEFAULT_THEME and the client may need a
 * different one. That is a textbook external store, so it's modelled as one
 * via useSyncExternalStore rather than useState + an effect.
 *
 * Two earlier attempts are worth not repeating:
 *   - Seeding useState from localStorage made the server and client render
 *     different markup, which React reported as a hydration error on every
 *     page load.
 *   - Papering over that with suppressHydrationWarning was worse: it
 *     suppresses React's *repair* as well as the warning, so the toggle
 *     kept the server's icon forever and ended up contradicting the theme
 *     actually applied to the page.
 * useSyncExternalStore fixes both — React renders the server snapshot,
 * then re-renders with the real client value immediately after hydration.
 */

let listeners: Array<() => void> = [];

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  // Keeps other open tabs in step when the theme changes in one of them.
  window.addEventListener('storage', cb);
  return () => {
    listeners = listeners.filter(l => l !== cb);
    window.removeEventListener('storage', cb);
  };
}

function emit(): void {
  for (const l of listeners) l();
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // private mode / storage disabled
  }
}

function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep the data-theme attribute on <html> in sync — this is a DOM
  // side-effect of the current value, not derived state.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    emit();
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      style={{
        // Clear of the bottom bar. At 24px it sat on top of the planner's
        // search bar and the trip screen's action row, covering the corner
        // of whichever one was showing.
        position: 'fixed', bottom: 'calc(104px + env(safe-area-inset-bottom))', right: 'calc(16px + env(safe-area-inset-right))', zIndex: 1000,
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--color-surface)',
        border: '1.5px solid var(--color-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, transition: 'background 0.2s',
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
