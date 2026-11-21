const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 64 characters from the base64url alphabet; `& 63` maps bytes onto it without bias. */
export function createVerifier(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(64);
  let out = '';
  for (let i = 0; i < 64; i++) out += ALPHABET[(bytes[i] ?? 0) & 63];
  return out;
}

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
