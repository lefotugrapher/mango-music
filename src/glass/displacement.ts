export type DisplacementOptions = { width: number; height: number; radius: number; bezel: number };

/**
 * Lens profile across the bezel. t is 0 at the rim and 1 where the bezel ends;
 * the result is how hard the backdrop is pushed (1 = full, 0 = none). A
 * quarter-circle makes the bend steep at the rim and flat inside, the way a
 * rounded glass edge behaves.
 */
const STOPS = [0, 0.08, 0.2, 0.35, 0.55, 0.8, 1];
const lens = (t: number) => 1 - Math.sqrt(1 - (1 - t) ** 2);

function gradient(id: string, axis: 'x' | 'y', channel: 'r' | 'g', towardEnd: boolean): string {
  const stops = STOPS.map((t) => {
    // Bands at the start edge ramp 255 -> 128 (push samples inward, positive);
    // bands at the end edge ramp 128 -> 0 and are drawn mirrored.
    const offset = towardEnd ? 1 - t : t;
    const value = Math.round(towardEnd ? 128 - 128 * lens(t) : 128 + 127 * lens(t));
    const rgb = channel === 'r' ? `rgb(${value},0,0)` : `rgb(0,${value},0)`;
    return { offset, rgb };
  })
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.rgb}"/>`)
    .join('');
  const dir = axis === 'x' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
  return `<linearGradient id="${id}" ${dir}>${stops}</linearGradient>`;
}

/**
 * Builds the map an feDisplacementMap reads: red carries the horizontal shift,
 * green the vertical one, and 128 on a channel means no shift. The middle of
 * the surface is neutral; a band along each edge bends the backdrop inward.
 *
 * Samples are pulled from inside the surface on purpose. A backdrop filter can
 * only read pixels under its own element, so reaching outward returns nothing.
 */
export function buildDisplacementMap({ width, height, radius, bezel }: DisplacementOptions): string | null {
  const w = Math.round(width);
  const h = Math.round(height);
  if (!(w > 0) || !(h > 0)) return null;
  const b = Math.max(1, Math.min(Math.round(bezel), Math.floor(w / 2), Math.floor(h / 2)));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-bezel="${b}" data-radius="${Math.round(radius)}">` +
    `<defs>${gradient('l', 'x', 'r', false)}${gradient('r', 'x', 'r', true)}${gradient('t', 'y', 'g', false)}${gradient('b', 'y', 'g', true)}</defs>` +
    `<rect width="${w}" height="${h}" fill="#000"/>` +
    // Red and green live in separate groups and are added with `screen`, so
    // the horizontal bands never disturb the vertical ones.
    `<g>` +
    `<rect width="${w}" height="${h}" fill="rgb(128,0,0)"/>` +
    `<rect x="0" y="0" width="${b}" height="${h}" fill="url(#l)"/>` +
    `<rect x="${w - b}" y="0" width="${b}" height="${h}" fill="url(#r)"/>` +
    `</g>` +
    `<g style="mix-blend-mode:screen">` +
    `<rect width="${w}" height="${h}" fill="rgb(0,128,0)"/>` +
    `<rect x="0" y="0" width="${w}" height="${b}" fill="url(#t)"/>` +
    `<rect x="0" y="${h - b}" width="${w}" height="${b}" fill="url(#b)"/>` +
    `</g>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
