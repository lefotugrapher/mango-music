import { describe, expect, it } from 'vitest';
import { parseClientId, redirectUriFor } from './redirect';

const at = (href: string) => redirectUriFor(new URL(href));

describe('redirectUriFor', () => {
  it('uses the loopback address as it is', () => {
    expect(at('http://127.0.0.1:5173/')).toEqual({ uri: 'http://127.0.0.1:5173/', problem: null });
    expect(at('http://[::1]:5173/')).toEqual({ uri: 'http://[::1]:5173/', problem: null });
  });

  it('flags localhost, which Spotify rejects, and suggests the loopback address', () => {
    expect(at('http://localhost:5173/')).toEqual({
      uri: 'http://localhost:5173/',
      problem: 'localhost',
      suggested: 'http://127.0.0.1:5173/',
    });
    expect(at('http://localhost:5173/?x=1#/library').suggested).toBe('http://127.0.0.1:5173/');
  });

  it('accepts any HTTPS host and keeps a sub-path', () => {
    expect(at('https://example.github.io/pane/')).toEqual({ uri: 'https://example.github.io/pane/', problem: null });
  });

  it('strips the query, the hash, and a trailing file name', () => {
    expect(at('https://example.github.io/pane/?x=1#/library').uri).toBe('https://example.github.io/pane/');
    expect(at('https://example.github.io/pane/index.html').uri).toBe('https://example.github.io/pane/');
    expect(at('http://127.0.0.1:5173/?code=abc&state=def').uri).toBe('http://127.0.0.1:5173/');
  });

  it('flags plain HTTP on anything that is not loopback', () => {
    expect(at('http://192.168.1.5:5173/').problem).toBe('insecure');
    expect(at('http://example.com/').problem).toBe('insecure');
  });
});

describe('parseClientId', () => {
  it('accepts a 32-character hex id, trimming and lower-casing it', () => {
    expect(parseClientId('  0123456789ABCDEF0123456789abcdef \n')).toBe('0123456789abcdef0123456789abcdef');
  });

  it('rejects anything else', () => {
    expect(parseClientId('not-an-id')).toBeNull();
    expect(parseClientId('')).toBeNull();
    expect(parseClientId('0123456789abcdef0123456789abcde')).toBeNull();
    expect(parseClientId('0123456789abcdef0123456789abcdefg')).toBeNull();
    expect(parseClientId('https://developer.spotify.com/dashboard/0123456789abcdef0123456789abcdef')).toBeNull();
  });
});
