import { useId } from 'react';
import './brand.css';

/**
 * The Mango Music mark: a mango with a bite taken out, a stem and a leaf.
 * It is an original drawing, filled with the current text colour so it sits
 * in a line of type like a letter, or white on the black app-icon tile.
 */
export function MangoLogo({ title, className }: { title?: string; className?: string }) {
  // Each copy needs its own mask id: ids are document-wide.
  const maskId = `mango-bite-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={className ? `mango ${className}` : 'mango'}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <mask id={maskId}>
        <rect width="100" height="100" fill="#fff" />
        <circle cx="95" cy="56" r="13" fill="#000" />
      </mask>
      <path
        data-part="body"
        mask={`url(#${maskId})`}
        fill="currentColor"
        d="M60 23 C78 22 92 37 89 57 C86 78 67 94 44 94 C31 94 17 91 12 83 C9 78 12 73 18 72 C15 58 24 40 38 31 C45 26 53 23 60 23 Z"
      />
      <path data-part="stem" fill="currentColor" d="M57 24.5 L59.5 12 L64.5 13 L63 25 Z" />
      <path data-part="leaf" fill="currentColor" d="M63 17.5 C66 6 80 -1 98 2 C94 15 79 22 63 17.5 Z" />
    </svg>
  );
}

/** The mark on its rounded tile, as an app icon. */
export function MangoTile({ className }: { className?: string }) {
  return (
    <span className={className ? `mango-tile ${className}` : 'mango-tile'} aria-hidden="true">
      <MangoLogo />
    </span>
  );
}

/**
 * The brand lockup: the mark followed by the word "Music", read as
 * "Mango Music". The word is set in the system font, which on Apple devices
 * is San Francisco.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={className ? `brand ${className}` : 'brand'} role="img" aria-label="Mango Music">
      <MangoLogo />
      <span className="brand__word">Music</span>
    </span>
  );
}
