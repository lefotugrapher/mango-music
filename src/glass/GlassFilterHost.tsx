import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildDisplacementMap } from './displacement';
import type { GlassTier } from './tier';

type FilterSpec = { w: number; h: number; r: number };
type Registry = Map<string, { spec: FilterSpec; count: number }>;
type GlassContextValue = { tier: GlassTier; acquire: (spec: FilterSpec) => () => void };

const GlassContext = createContext<GlassContextValue>({ tier: 'solid', acquire: () => () => {} });

const keyOf = ({ w, h, r }: FilterSpec) => `${w}x${h}r${r}`;
const filterId = (spec: FilterSpec) => `pane-glass-${keyOf(spec)}`;

/** How wide the refracting band is, and how far it pushes, for a surface of this size. */
function lensFor({ w, h }: FilterSpec) {
  const bezel = Math.max(6, Math.min(22, Math.round(Math.min(w, h) * 0.36)));
  return { bezel, scale: Math.round(bezel * 2.6) };
}

export function useGlassTier(): GlassTier {
  return useContext(GlassContext).tier;
}

/**
 * Returns the id of an SVG filter that refracts a surface of this size, or
 * null when the tier does not refract or the surface has not been measured.
 * Surfaces of the same size share one filter.
 */
export function useGlassFilter(w: number, h: number, r: number): string | null {
  const { tier, acquire } = useContext(GlassContext);
  const active = tier === 'refract' && w > 0 && h > 0;
  useEffect(() => {
    if (!active) return;
    return acquire({ w, h, r });
  }, [active, w, h, r, acquire]);
  return active ? filterId({ w, h, r }) : null;
}

export function GlassFilterHost({ tier, children }: { tier: GlassTier; children: ReactNode }) {
  const [registry, setRegistry] = useState<Registry>(() => new Map());

  const acquire = useCallback((spec: FilterSpec) => {
    const key = keyOf(spec);
    setRegistry((prev) => {
      const next = new Map(prev);
      next.set(key, { spec, count: (prev.get(key)?.count ?? 0) + 1 });
      return next;
    });
    return () => {
      setRegistry((prev) => {
        const current = prev.get(key);
        if (!current) return prev;
        const next = new Map(prev);
        if (current.count <= 1) next.delete(key);
        else next.set(key, { ...current, count: current.count - 1 });
        return next;
      });
    };
  }, []);

  const value = useMemo(() => ({ tier, acquire }), [tier, acquire]);
  const specs = tier === 'refract' ? [...registry.values()].map((entry) => entry.spec) : [];

  return (
    <GlassContext.Provider value={value}>
      {children}
      {specs.length > 0 && (
        <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
          <defs>
            {specs.map((spec) => {
              const { bezel, scale } = lensFor(spec);
              const map = buildDisplacementMap({ width: spec.w, height: spec.h, radius: spec.r, bezel });
              if (!map) return null;
              return (
                <filter
                  key={keyOf(spec)}
                  id={filterId(spec)}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  // The map's 128 must read as exactly "no shift": keep it in sRGB.
                  colorInterpolationFilters="sRGB"
                >
                  <feImage href={map} x="0" y="0" width={spec.w} height={spec.h} preserveAspectRatio="none" result="map" />
                  <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
                </filter>
              );
            })}
          </defs>
        </svg>
      )}
    </GlassContext.Provider>
  );
}
