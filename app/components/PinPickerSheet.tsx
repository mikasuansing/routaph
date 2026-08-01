'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

/*
 * Drop-a-pin location picker.
 *
 * ParaPo could only route between stops it had names for, so a trip to a
 * street address — the ordinary case — was simply unaskable. Here the map
 * moves under a fixed centre pin (steadier on a phone than dragging a
 * marker with your thumb), and whatever sits under it is reverse-geocoded
 * to a readable address.
 *
 * Address lookup goes through /api/v1/geo/reverse rather than the browser:
 * Nominatim's usage policy needs a real User-Agent and server-side rate
 * limiting, and the single-API-boundary rule applies regardless.
 */

const C = {
  bg:      'var(--color-bg)',
  card:    'var(--color-card)',
  border:  'var(--color-border)',
  muted:   'var(--color-muted)',
  body:    'var(--color-body)',
  ink:     'var(--color-ink)',
  accent:  'var(--color-accent)',
  onPrimary: 'var(--color-on-primary)',
};

const TILE_URL = (isDark: boolean) => isDark
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

/**
 * Keyless OpenMapTiles-schema vector tiles (ODbL). Carries a `building-3d`
 * fill-extrusion layer, which is what makes the tilted view readable —
 * see docs/adr/0004-maplibre-for-3d-pin-picker.md.
 */
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** Tilt and zoom at which street-level buildings actually read as solid. */
const PITCH = 55;
const PIN_ZOOM = 17;

/** MapLibre needs WebGL; without it the picker falls back to flat Leaflet. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

/** Metro Manila centre — only used when there's no fix and no start point. */
const FALLBACK: [number, number] = [14.5850, 121.0100];

/** Wait for the map to settle before asking for an address, so dragging
 *  across the city doesn't fire a lookup per frame. */
const SETTLE_MS = 450;

export type PickedLocation = {
  label: string;
  lat: number;
  lng: number;
  note?: string;
};

type Props = {
  title: string;
  initial?: [number, number] | null;
  onConfirm: (loc: PickedLocation) => void;
  onCancel: () => void;
};

export function PinPickerSheet({ title, initial, onConfirm, onCancel }: Props) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<unknown>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [center, setCenter] = useState<[number, number]>(initial ?? FALLBACK);
  const [label, setLabel]   = useState<string>('');
  const [busy, setBusy]     = useState(false);
  const [note, setNote]     = useState('');
  const [locating, setLocating] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [tilted, setTilted] = useState(true);

  // Ask the server what's under the pin.
  const lookup = useCallback(async (lat: number, lng: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/geo/reverse?lat=${lat}&lng=${lng}`);
      const json = await res.json() as { data?: { label: string } };
      setLabel(json.data?.label ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch {
      setLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  // Build the map once. MapLibre when WebGL is there (3D), Leaflet when not.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;
    const start = initial ?? FALLBACK;

    // Shared by both renderers: the pin is a fixed DOM element over the
    // map's centre, so the address always describes what the crosshair
    // covers. `move` tracks live; the lookup waits for the map to settle so
    // dragging across the city doesn't fire a request per frame.
    const onMove = (lat: number, lng: number) => setCenter([lat, lng]);
    const onSettle = (lat: number, lng: number) => {
      if (settleRef.current) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => lookup(lat, lng), SETTLE_MS);
    };

    // Flat raster map. Also the safety net when the 3D path can't run.
    const buildLeaflet = () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      import('leaflet').then(mod => {
        if (cancelled || !mapElRef.current || mapRef.current) return;
        const L = mod.default ?? mod;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = (L as any).map(mapElRef.current, {
          center: start,
          zoom: initial ? PIN_ZOOM : 12,
          zoomControl: false,
          attributionControl: false,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).tileLayer(TILE_URL(isDark), { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

        map.on('move', () => { const c = map.getCenter(); onMove(c.lat, c.lng); });
        map.on('moveend', () => { const c = map.getCenter(); onSettle(c.lat, c.lng); });

        mapRef.current = map;
        // Leaflet mis-measures a container that was hidden when created.
        setTimeout(() => map.invalidateSize(false), 60);
        lookup(start[0], start[1]);
      });
    };

    if (hasWebGL()) {
      import('maplibre-gl').then(mod => {
        if (cancelled || !mapElRef.current) return;
        const maplibregl = mod;

        const map = new maplibregl.Map({
          container: mapElRef.current,
          style: VECTOR_STYLE,
          center: [start[1], start[0]],   // MapLibre takes [lng, lat]
          zoom: initial ? PIN_ZOOM : 12,
          pitch: PITCH,
          bearing: -18,
          attributionControl: false,
        });

        // The style is a network resource on a host with no SLA. If it never
        // arrives the canvas just stays blank, which looks like a broken
        // app — so give up on 3D and put the raster map back instead. Only
        // announce 3D once the style has actually loaded, so the tilt
        // control never appears on a map that cannot tilt.
        let settled = false;
        const giveUp = () => {
          if (settled || cancelled) return;
          settled = true;
          map.remove();
          mapRef.current = null;
          setIs3D(false);
          buildLeaflet();
        };
        const styleTimer = setTimeout(giveUp, 6000);

        map.on('load', () => {
          if (cancelled) return;
          settled = true;
          clearTimeout(styleTimer);
          setIs3D(true);
        });
        // MapLibre reports missing tiles as errors too; only a failure to
        // load the style itself is fatal to the whole map.
        map.on('error', (e: { error?: { status?: number } }) => {
          if (!settled && !map.isStyleLoaded()) {
            clearTimeout(styleTimer);
            giveUp();
          }
          void e;
        });

        map.on('move', () => { const c = map.getCenter(); onMove(c.lat, c.lng); });
        map.on('moveend', () => { const c = map.getCenter(); onSettle(c.lat, c.lng); });

        mapRef.current = map;
        lookup(start[0], start[1]);
      }).catch(buildLeaflet);
    } else {
      buildLeaflet();
    }

    return () => {
      cancelled = true;
      if (settleRef.current) clearTimeout(settleRef.current);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = mapRef.current as any;
      if (m?.remove) m.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snap to the rider's own position.
  const goToCurrent = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = mapRef.current as any;
        if (!m) return;
        // MapLibre takes [lng, lat] and flies with a pitch; Leaflet takes
        // [lat, lng] and has no camera to speak of.
        if (m.flyTo && m.getBearing) m.flyTo({ center: [here[1], here[0]], zoom: PIN_ZOOM, pitch: PITCH });
        else m.setView(here, PIN_ZOOM, { animate: true });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: C.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Map fills everything; the card below floats over it.
          `zIndex: 0` is load-bearing: Leaflet gives its internal panes
          z-indexes from 400 to 800, and with `auto` here those panes compete
          with — and beat — the controls below, hiding the whole sheet behind
          the tiles. A zero forms a stacking context that keeps them local. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Fixed centre pin. Offset up by its own height so the point sits on
          the map centre rather than the middle of the teardrop. */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', zIndex: 3,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none', fontSize: 34, lineHeight: 1,
        filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
      }}>
        📍
      </div>

      {/* Header: close + what we're picking */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: 'calc(14px + env(safe-area-inset-top)) 16px 0',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          onClick={onCancel}
          aria-label="Cancel"
          style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: C.card, border: `1px solid ${C.border}`,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)', cursor: 'pointer',
            fontSize: 18, color: C.ink, fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
        <div style={{
          flex: 1, minWidth: 0, background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 999, padding: '11px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ flexShrink: 0 }}>📍</span>
          <span style={{
            fontSize: 14, fontWeight: 700, color: C.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {busy ? 'Locating…' : label || title}
          </span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Map controls sit just above the address card */}
      <div style={{
        position: 'relative', zIndex: 2, display: 'flex', gap: 10,
        padding: '0 16px 10px',
      }}>
        <button
          onClick={goToCurrent}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 999,
            padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, color: C.accent,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          }}
        >
          ◎ {locating ? 'Finding…' : 'Current'}
        </button>
        <button
          onClick={() => lookup(center[0], center[1])}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 999,
            padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, color: C.body,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          }}
        >
          ↻ Refresh
        </button>

        {/* Tilt only exists on the WebGL renderer. Looking straight down is
            better for judging which side of a road a pin is on, so this is
            a toggle rather than a fixed camera. */}
        {is3D && (
          <button
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const m = mapRef.current as any;
              if (!m?.easeTo) return;
              const flat = m.getPitch() < 10;
              m.easeTo({ pitch: flat ? PITCH : 0, bearing: flat ? -18 : 0, duration: 450 });
              setTilted(flat);
            }}
            aria-pressed={tilted}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: tilted ? C.accent : C.card,
              border: `1px solid ${tilted ? C.accent : C.border}`, borderRadius: 999,
              padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, color: tilted ? C.onPrimary : C.body,
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}
          >
            ⬢ 3D
          </button>
        )}
      </div>

      {/* Address card */}
      <div style={{
        position: 'relative', zIndex: 2,
        background: C.card, borderTop: `1px solid ${C.border}`,
        borderRadius: '22px 22px 0 0', padding: '18px 20px',
        paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 28px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, fontSize: 16, lineHeight: 1.3 }}>📍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
              {busy ? 'Reading the map…' : label || 'Move the map to place the pin'}
            </p>
            <p className="tnum" style={{ margin: '3px 0 0', fontSize: 12, color: C.muted }}>
              {center[0].toFixed(5)}, {center[1].toFixed(5)}
            </p>
          </div>
        </div>

        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Unit, building, gate, or landmark"
          style={{
            width: '100%', marginTop: 14, padding: '13px 15px',
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14,
            fontSize: 14, color: C.ink, fontFamily: 'inherit', outline: 'none',
          }}
        />

        <button
          onClick={() => onConfirm({
            label: label || `${center[0].toFixed(5)}, ${center[1].toFixed(5)}`,
            lat: center[0], lng: center[1],
            note: note.trim() || undefined,
          })}
          style={{
            width: '100%', marginTop: 12, padding: '16px', borderRadius: 999,
            border: 'none', background: 'var(--gradient-primary)', color: C.onPrimary,
            fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 6px 18px rgba(41,71,222,0.25)',
          }}
        >
          Confirm pin
        </button>

        <p style={{ margin: '10px 0 0', fontSize: 10, color: C.muted, textAlign: 'center' }}>
          Address data © OpenStreetMap contributors
        </p>
      </div>
    </div>
  );
}
