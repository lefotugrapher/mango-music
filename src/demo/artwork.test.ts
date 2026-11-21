import { describe, expect, it } from 'vitest';
import { demoArtwork } from './artwork';

const decode = (url: string) => decodeURIComponent(url.slice(url.indexOf(',') + 1));

describe('demoArtwork', () => {
  it('is an SVG data URL', () => {
    expect(demoArtwork('a')).toMatch(/^data:image\/svg\+xml,/);
  });
  it('is deterministic per seed and differs between seeds', () => {
    expect(demoArtwork('a')).toBe(demoArtwork('a'));
    expect(demoArtwork('a')).not.toBe(demoArtwork('b'));
  });
  it('is 600x600, layered, and has no text', () => {
    const svg = decode(demoArtwork('cover'));
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="600"');
    expect(svg).toContain('<linearGradient');
    expect((svg.match(/<radialGradient/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).not.toContain('<text');
  });
});
