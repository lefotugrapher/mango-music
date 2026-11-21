# Reference measurements — Apple Music web player

Observed 2026-11-21 at `music.apple.com/ie` (signed out) in a Chromium
browser, by reading computed styles and element boxes. These are measured
facts used as a target for Pane's own CSS. No Apple code, icons, fonts, or
images are copied into this repo.

## Global

| What | Dark | Light |
|---|---|---|
| Page background | `rgb(31,31,31)` | `rgb(255,255,255)` |
| Primary text | `rgba(255,255,255,0.92)` | `rgba(0,0,0,0.88)` |
| Secondary text | `rgba(255,255,255,0.64)` | `rgba(0,0,0,0.56)` |
| Tertiary text | `rgba(255,255,255,0.4)` | — |
| Divider | `rgba(255,255,255,0.1)` | — |
| Muted meta text | `rgb(161,161,166)` | — |

Font stack starts `-apple-system, system-ui`. Base text 13px/16px.

## Glass surfaces

| Surface | Fill | Backdrop filter | Other |
|---|---|---|---|
| Sidebar (dark) | `rgba(38,38,40,0.6)` | `saturate(2.2) blur(16px)` | right border `1px rgba(255,255,255,0.05)` |
| Sidebar (light) | `rgba(245,245,247,0.55)` | same | right border `1px rgba(0,0,0,0.05)` |
| Player capsule | same fill as sidebar | same | radius 1000px; shadow `0 10px 40px rgba(0,0,0,0.2)` dark, `0.1` light |
| Capsule rim | inset 0.5px lines on all four diagonals, white at opacity 0.25 (dark), black at 0.1 (light) | — | separate overlay layer |
| Small pill buttons | `rgba(40,40,40,0.5)` | `saturate(1.8) blur(60px)` | radius 1000px |
| Play disc over artwork | `rgba(40,40,40,0.4)` | `saturate(1.8) blur(60px)` | 30px circle |

## Desktop layout (1440 × 900)

- Sidebar 260px wide, full height. Inner padding `36px 12px 0 20px`.
- Sidebar rows: 227 × 36, radius 8px, 4px padding, 40px pitch. Label 14px/20px,
  weight 400, selected 600. Selected fill `rgba(255,255,255,0.05)` dark,
  `rgba(31,31,31,0.04)` light. Icons 24px.
- Content starts 40px right of the sidebar (x = 300) with 40px right padding.
- Page title: 34px/40px, weight 700, 32px from the top.
- Section title: 17px/22px, weight 700, with a chevron.
- Hero cards: 540 × 384. Eyebrow in small caps above, title and subtitle
  17px-ish, caption inside the card bottom-left.
- Song grid: three columns, 20px column gap. Row 55px tall inside 15px
  padding; artwork 40 × 40, radius 5px; title 13px, artist 12px secondary;
  hairline between rows.
- Player capsule: 668 × 56, centred in the content area (not the window),
  18px above the bottom edge. Left group of five 24px controls with 8px gaps
  (shuffle, previous, play, next, repeat) inset 16px; centre display 427px;
  right group (queue, volume).

## Album page

- Whole page, sidebar included, takes a tint from the artwork's colour.
- Artwork 270 × 270, radius 10px, shadow `0 3px 10px rgba(0,0,0,0.23)`.
- Text block starts 34px right of the artwork.
- Title 26px/30px weight 700; artist 26px/30px weight 400; meta line
  12px/15px weight 600 in muted grey; description 13px/18px.
- Primary button: pill 130 × 36 (min-width 130), radius 24px, 15px weight
  600, solid fill.
- Track rows: 46px tall; number column 40px; title 13px; artist 13px;
  duration right-aligned 13px; a "more" button at the far right; hairlines.
- A round glass "more" button floats top-right.

## Phone width (390)

- Top bar 52px, same glass as the sidebar.
- Mini player capsule 366 × 52, 12px side margins, about 9px above the
  bottom edge, pill radius, same glass.
- Page padding 25px. Title stays 34px.
