/** Seeded PRNG, shared with the demo library so everything stays deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Hue offsets from the base hue; each keeps the palette harmonious.
const SCHEMES: number[][] = [
  [0, 25, 50, 80],
  [0, 30, 180, 210],
  [0, 120, 240],
  [0, 150, 210],
  [0, 40, 160, 200],
  [0, 60, 300],
];

const f = (n: number) => n.toFixed(1);

export function demoArtwork(seed: string): string {
  const rnd = mulberry32(hashString(seed));
  const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const baseHue = rnd() * 360;
  const scheme = SCHEMES[Math.floor(rnd() * SCHEMES.length)]!;
  const palette = scheme.map((off) => {
    const h = Math.round((baseHue + off + range(-8, 8) + 360) % 360);
    return `hsl(${h} ${Math.round(range(62, 92))}% ${Math.round(range(42, 66))}%)`;
  });
  const pick = (i: number) => palette[i % palette.length]!;

  const angle = range(0, Math.PI * 2);
  const gx = Math.cos(angle) / 2;
  const gy = Math.sin(angle) / 2;
  const defs = [
    `<linearGradient id="bg" x1="${f(0.5 - gx)}" y1="${f(0.5 - gy)}" x2="${f(0.5 + gx)}" y2="${f(0.5 + gy)}">` +
      `<stop offset="0" stop-color="${pick(0)}"/><stop offset="1" stop-color="${pick(1)}"/></linearGradient>`,
  ];
  const body = ['<rect width="600" height="600" fill="url(#bg)"/>'];

  const blobs = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const colour = pick(i + 1 + Math.floor(rnd() * 2));
    defs.push(
      `<radialGradient id="b${i}"><stop offset="0" stop-color="${colour}" stop-opacity="0.95"/>` +
        `<stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`,
    );
    body.push(
      `<circle cx="${f(range(40, 560))}" cy="${f(range(40, 560))}" r="${f(range(160, 360))}" fill="url(#b${i})"/>`,
    );
  }

  const shape = rnd();
  const stroke = 'hsl(0 0% 100%)';
  if (shape < 0.35) {
    body.push(
      `<circle cx="${f(range(200, 400))}" cy="${f(range(200, 400))}" r="${f(range(90, 170))}" fill="none" stroke="${stroke}" stroke-opacity="0.35" stroke-width="${f(range(6, 18))}"/>`,
    );
  } else if (shape < 0.6) {
    const s = range(160, 280);
    body.push(
      `<rect x="${f(300 - s / 2)}" y="${f(300 - s / 2)}" width="${f(s)}" height="${f(s)}" fill="${stroke}" fill-opacity="0.12" transform="rotate(${f(range(10, 80))} 300 300)"/>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
    `<defs>${defs.join('')}</defs>${body.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
