// Draws the Mango Music app icons (black tile, white mango) as SVG, then
// renders the PNG sizes with headless Chrome. Run: node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = new URL('../public/', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MARK = `
  <mask id="bite"><rect width="100" height="100" fill="#fff"/><circle cx="95" cy="56" r="13" fill="#000"/></mask>
  <path mask="url(#bite)" d="M60 23 C78 22 92 37 89 57 C86 78 67 94 44 94 C31 94 17 91 12 83 C9 78 12 73 18 72 C15 58 24 40 38 31 C45 26 53 23 60 23 Z"/>
  <path d="M57 24.5 L59.5 12 L64.5 13 L63 25 Z"/>
  <path d="M63 17.5 C66 6 80 -1 98 2 C94 15 79 22 63 17.5 Z"/>`;

/** A tile of `size` at (x, y) with corner radius `r`; the mark fills 64% of it. */
function tile(x, y, size, r) {
  const m = size * 0.64;
  const mx = x + (size - m) / 2 - size * 0.02;
  const my = y + (size - m) / 2 + size * 0.015;
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3a3d"/><stop offset="0.55" stop-color="#141415"/><stop offset="1" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="url(#sheen)"/>
  <rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="${Math.max(0, r - 1)}" fill="none" stroke="#fff" stroke-opacity="0.16" stroke-width="2"/>
  <g transform="translate(${mx} ${my}) scale(${m / 100})" fill="#fff">${MARK}</g>`;
}

const svg = (w, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}">${body}</svg>`;

// Favicon and Mac-style icon: rounded tile with the usual macOS margin.
const favicon = svg(64, tile(0, 0, 64, 15));
const mac = svg(1024, tile(100, 100, 824, 185));
// Full-bleed square: Safari and Android round it themselves.
const square = svg(1024, tile(0, 0, 1024, 0));

writeFileSync(join(OUT, 'icon.svg'), favicon);
writeFileSync(join(OUT, 'icons/icon-mac.svg'), mac);

const tmp = mkdtempSync(join(tmpdir(), 'mango-icons-'));
function png(source, size, file) {
  const page = join(tmp, `${size}-${file.replace(/\//g, "_")}.html`);
  writeFileSync(page, `<html><body style="margin:0;background:transparent">${source.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`)}</body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${size},${size}`, `--screenshot=${join(OUT, file)}`, `file://${page}`], { stdio: 'ignore' });
}
png(mac, 512, 'icons/icon-512.png');
png(mac, 192, 'icons/icon-192.png');
png(square, 512, 'icons/maskable-512.png');
png(square, 180, 'apple-touch-icon.png');
console.log('icons written');
