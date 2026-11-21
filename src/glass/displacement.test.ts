import { describe, expect, it } from 'vitest';
import { buildDisplacementMap } from './displacement';

const decode = (url: string) => decodeURIComponent(url.slice(url.indexOf(',') + 1));

describe('buildDisplacementMap', () => {
  it('returns an SVG data URL sized to the surface', () => {
    const url = buildDisplacementMap({ width: 300, height: 64, radius: 32, bezel: 14 });
    expect(url).not.toBeNull();
    expect(url!.startsWith('data:image/svg+xml')).toBe(true);
    const svg = decode(url!);
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="64"');
  });

  it('returns null for a surface with no area', () => {
    expect(buildDisplacementMap({ width: 0, height: 64, radius: 8, bezel: 4 })).toBeNull();
    expect(buildDisplacementMap({ width: 64, height: 0, radius: 8, bezel: 4 })).toBeNull();
  });

  it('clamps a bezel wider than half the short side instead of failing', () => {
    const svg = decode(buildDisplacementMap({ width: 40, height: 20, radius: 10, bezel: 99 })!);
    // The widest band that fits a 20px-tall surface is 10px.
    expect(svg).toContain('data-bezel="10"');
  });

  it('is neutral in the middle: the base fill shifts nothing', () => {
    const svg = decode(buildDisplacementMap({ width: 200, height: 100, radius: 20, bezel: 12 })!);
    // 128 on a channel is zero displacement on that axis.
    expect(svg).toContain('fill="rgb(128,0,0)"');
    expect(svg).toContain('fill="rgb(0,128,0)"');
  });

  it('gives the same output for the same input', () => {
    const o = { width: 120, height: 48, radius: 24, bezel: 10 };
    expect(buildDisplacementMap(o)).toBe(buildDisplacementMap(o));
  });
});
