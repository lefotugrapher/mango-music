import { useEffect, useState } from 'react';

export const FALLBACK_PALETTE = ['#3a3a3c', '#1c1c1e', '#48484a', '#2c2c2e'];

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/**
 * The dominant colours of an RGBA pixel buffer, most common first. Pixels are
 * grouped into coarse buckets (4 bits a channel) and each bucket reports the
 * average of what fell into it. Mostly-transparent pixels are skipped.
 */
export function pickPalette(pixels: Uint8ClampedArray, count = 4): string[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    if (pixels[i + 3]! < 128) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }
  if (buckets.size === 0) return FALLBACK_PALETTE.slice(0, count);

  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
  const picked: { r: number; g: number; b: number }[] = [];
  // Prefer colours that differ from the ones already chosen, so a cover with
  // one big flat area still yields a varied palette.
  for (const bucket of ranked) {
    if (picked.length === count) break;
    const c = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n };
    const distinct = picked.every((p) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) > 72);
    if (distinct) picked.push(c);
  }
  const colours = picked.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`);
  return Array.from({ length: count }, (_, i) => colours[i % colours.length]!);
}

/**
 * Samples an image's colours. The image is only read, never shown: the
 * background built from these colours contains no artwork.
 */
export function usePalette(url?: string): string[] {
  const [palette, setPalette] = useState(FALLBACK_PALETTE);

  useEffect(() => {
    if (!url) {
      setPalette(FALLBACK_PALETTE);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('no 2d context');
        context.drawImage(image, 0, 0, 24, 24);
        setPalette(pickPalette(context.getImageData(0, 0, 24, 24).data));
      } catch {
        // A cross-origin image without CORS headers taints the canvas.
        setPalette(FALLBACK_PALETTE);
      }
    };
    image.onerror = () => {
      if (!cancelled) setPalette(FALLBACK_PALETTE);
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return palette;
}
