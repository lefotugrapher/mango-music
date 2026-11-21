import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';
import { useGlassFilter, useGlassTier } from './GlassFilterHost';
import './glass.css';

type OwnProps<T extends ElementType> = {
  as?: T;
  /** regular: frosted, for bars and panels. clear: lighter, for controls over media. */
  material?: 'regular' | 'clear';
  /** Corner radius in px. Defaults to the bar radius token. */
  radius?: number;
  /** Replaces the glass fill colour, e.g. to take a tint from artwork. */
  tint?: string;
  /** Set false for small or numerous surfaces: they frost but do not refract. */
  refract?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export type GlassProps<T extends ElementType = 'div'> = OwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof OwnProps<T>>;

/**
 * The glass material. Use it for navigation and controls only; content sits
 * on the page and scrolls underneath.
 */
export function Glass<T extends ElementType = 'div'>({
  as,
  material = 'regular',
  radius,
  tint,
  refract = true,
  className,
  style,
  children,
  ...rest
}: GlassProps<T>) {
  const Tag: ElementType = as ?? 'div';
  const tier = useGlassTier();
  const ref = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0, r: 0 });
  const wantsRefraction = tier === 'refract' && refract;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!wantsRefraction || !el) return;
    const measure = () => {
      // offsetWidth/Height ignore transforms, so a bar that shrinks by
      // `transform: scale()` keeps its filter instead of rebuilding it.
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const cssRadius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const r = Math.round(Math.min(radius ?? cssRadius, w / 2, h / 2));
      setBox((prev) => (prev.w === w && prev.h === h && prev.r === r ? prev : { w, h, r }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [wantsRefraction, radius]);

  const filterId = useGlassFilter(wantsRefraction ? box.w : 0, box.h, box.r);

  const vars: Record<string, string> = {};
  if (radius != null) vars['--glass-radius'] = `${radius}px`;
  if (tint) vars['--glass-fill-color'] = tint;

  return (
    <Tag
      ref={ref}
      className={className ? `glass ${className}` : 'glass'}
      data-tier={tier}
      data-material={material}
      style={{ ...vars, ...style }}
      {...rest}
    >
      <span
        className="glass__backdrop"
        aria-hidden="true"
        data-refract={filterId ?? undefined}
        style={
          filterId
            ? { backdropFilter: `url(#${filterId}) blur(var(--glass-blur-refract)) saturate(var(--glass-sat))` }
            : undefined
        }
      />
      {children}
      <span className="glass__rim" aria-hidden="true" />
    </Tag>
  );
}
