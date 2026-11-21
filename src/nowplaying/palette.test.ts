import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE, pickPalette } from './palette';
import { spotifyUrl } from '../lib/spotifyUrl';

const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());
const repeat = (px: number[], n: number) => Array.from({ length: n }, () => px);

describe('pickPalette', () => {
  it('finds the dominant colours of an image', () => {
    const palette = pickPalette(pixels(...repeat([255, 0, 0, 255], 8), ...repeat([0, 0, 255, 255], 8)));
    expect(palette).toContain('#ff0000');
    expect(palette).toContain('#0000ff');
  });

  it('always returns the number of colours asked for', () => {
    expect(pickPalette(pixels(...repeat([255, 0, 0, 255], 4)))).toHaveLength(4);
    expect(pickPalette(pixels(...repeat([255, 0, 0, 255], 4)), 2)).toEqual(['#ff0000', '#ff0000']);
  });

  it('puts the most common colour first', () => {
    const palette = pickPalette(pixels(...repeat([0, 255, 0, 255], 9), ...repeat([255, 0, 0, 255], 3)));
    expect(palette[0]).toBe('#00ff00');
  });

  it('ignores transparent pixels', () => {
    const palette = pickPalette(pixels(...repeat([255, 0, 0, 0], 20), ...repeat([0, 0, 255, 255], 2)));
    expect(palette).not.toContain('#ff0000');
    expect(palette[0]).toBe('#0000ff');
  });

  it('falls back when there is nothing to sample', () => {
    expect(pickPalette(new Uint8ClampedArray(0))).toEqual(FALLBACK_PALETTE);
    expect(pickPalette(pixels(...repeat([10, 20, 30, 0], 4)))).toEqual(FALLBACK_PALETTE);
  });
});

describe('spotifyUrl', () => {
  it('turns a Spotify URI into its open.spotify.com page', () => {
    expect(spotifyUrl('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toBe(
      'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    );
    expect(spotifyUrl('spotify:album:abc')).toBe('https://open.spotify.com/album/abc');
  });

  it('falls back to the Spotify home page for anything else', () => {
    expect(spotifyUrl('demo:track:t1')).toBe('https://open.spotify.com/');
    expect(spotifyUrl('spotify:local:x:y:z')).toBe('https://open.spotify.com/');
    expect(spotifyUrl('spotify:track:../../evil')).toBe('https://open.spotify.com/');
  });
});
