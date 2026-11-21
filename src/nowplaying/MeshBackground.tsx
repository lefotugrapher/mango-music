import type { CSSProperties } from 'react';
import './nowplaying.css';

/**
 * Slow-drifting fields of colour sampled from the current artwork. It draws
 * colours only, never the artwork itself, so the cover is never blurred or
 * altered. Movement is transform-only and stops under reduced motion.
 */
export function MeshBackground({ colors }: { colors: string[] }) {
  const style = {
    '--mesh-0': colors[0],
    '--mesh-1': colors[1] ?? colors[0],
    '--mesh-2': colors[2] ?? colors[0],
    '--mesh-3': colors[3] ?? colors[1] ?? colors[0],
  } as CSSProperties;
  return (
    <div className="mesh" style={style} aria-hidden="true">
      <span className="mesh__blob mesh__blob--a" />
      <span className="mesh__blob mesh__blob--b" />
      <span className="mesh__blob mesh__blob--c" />
      <span className="mesh__blob mesh__blob--d" />
    </div>
  );
}
