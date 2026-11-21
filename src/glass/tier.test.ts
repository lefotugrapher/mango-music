import { describe, expect, it } from 'vitest';
import { detectGlassTier } from './tier';

const base = {
  isChromium: true,
  supportsBackdrop: true,
  supportsBackdropUrl: true,
  reducedTransparency: false,
  setting: 'auto',
} as const;

describe('detectGlassTier', () => {
  it('refracts in a Chromium browser that supports SVG backdrop filters', () => {
    expect(detectGlassTier(base)).toBe('refract');
  });

  it('falls back to blur outside Chromium, where url() backdrops do not render', () => {
    expect(detectGlassTier({ ...base, isChromium: false })).toBe('blur');
    expect(detectGlassTier({ ...base, supportsBackdropUrl: false })).toBe('blur');
  });

  it('honours the user choosing blur', () => {
    expect(detectGlassTier({ ...base, setting: 'blur' })).toBe('blur');
  });

  it('goes solid for reduced transparency, the solid setting, or no backdrop support', () => {
    expect(detectGlassTier({ ...base, reducedTransparency: true })).toBe('solid');
    expect(detectGlassTier({ ...base, setting: 'solid' })).toBe('solid');
    expect(detectGlassTier({ ...base, supportsBackdrop: false })).toBe('solid');
  });

  it('lets reduced transparency win over a blur setting', () => {
    expect(detectGlassTier({ ...base, setting: 'blur', reducedTransparency: true })).toBe('solid');
  });
});
