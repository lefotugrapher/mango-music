type Loc = Pick<Location, 'protocol' | 'hostname' | 'port' | 'pathname'>;

export type RedirectInfo = {
  /** The redirect URI for the page Pane is being served from. */
  uri: string;
  /** Why Spotify would refuse that URI, if it would. */
  problem: null | 'localhost' | 'insecure';
  /** A working address for the same server, when there is an obvious one. */
  suggested?: string;
};

const LOOPBACK = new Set(['127.0.0.1', '[::1]']);

function build(loc: Loc, hostname: string): string {
  const last = loc.pathname.slice(loc.pathname.lastIndexOf('/') + 1);
  // Drop a trailing file name (index.html); otherwise make sure the path ends in a slash.
  const dir = last.includes('.')
    ? loc.pathname.slice(0, loc.pathname.length - last.length)
    : loc.pathname.endsWith('/')
      ? loc.pathname
      : `${loc.pathname}/`;
  return `${loc.protocol}//${hostname}${loc.port ? `:${loc.port}` : ''}${dir}`;
}

/**
 * Spotify matches redirect URIs exactly, refuses `localhost`, and allows plain
 * HTTP only on a loopback IP. The URI is the app's own root: no query, no hash.
 */
export function redirectUriFor(loc: Loc): RedirectInfo {
  const uri = build(loc, loc.hostname);
  if (loc.hostname === 'localhost' || loc.hostname.endsWith('.localhost')) {
    return { uri, problem: 'localhost', suggested: build(loc, '127.0.0.1') };
  }
  if (loc.protocol === 'https:' || LOOPBACK.has(loc.hostname)) return { uri, problem: null };
  return { uri, problem: 'insecure' };
}

/** A Spotify Client ID is 32 hex characters. Returns it tidied, or null. */
export function parseClientId(input: string): string | null {
  const value = input.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(value) ? value : null;
}
