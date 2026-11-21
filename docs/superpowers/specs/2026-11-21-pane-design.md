# Pane — design

Working name: **Pane** (my call; rename freely). Folder: `~/skill/pane`.
Date: 2026-11-21. Status: awaiting approval.

## Intent

An open-source web music player that looks and moves like the current Apple
Music app (iOS 26 / macOS 26, Liquid Glass) but plays the user's own Spotify
account. Kayzee wants to use it himself and share it on GitHub so anyone can
run it.

## Goals

- Anyone with Spotify Premium can clone the repo and be listening in a few
  minutes, with no cap on how many people use the project.
- The look reads as Liquid Glass, not generic frosted "glassmorphism":
  refraction, specular edges, controls floating as a layer above content.
- Browse your library, search, and control playback entirely in the browser.
- Works on desktop and phone widths, light and dark.

## Non-goals (v1)

Playlist creation or editing, lyrics, podcasts and audiobooks, radio/stations,
offline, native apps, playback for free Spotify accounts, translations.

## Anti-goals

- A shared Client ID or any secret in the repo.
- Apple's name, logo, SF Symbols, or SF font files in the repo. A name or logo
  that resembles Spotify's.
- Unofficial Spotify APIs or token scraping.
- Needing a server to run.
- Blur cards everywhere. Glass is for navigation and controls only.
- Jank from stacking too many filters.

## Constraints (verified against Spotify docs, Nov 2026)

- Development-mode apps: 5 allowlisted users, owner needs Premium, no upgrade
  path for individuals.
- Redirect URIs: `localhost` is banned; `http://127.0.0.1:PORT` is allowed;
  everything else must be HTTPS.
- Auth: Authorization Code with PKCE (no client secret). Tokens last 1 hour.
- In-browser audio: Web Playback SDK (`https://sdk.scdn.co/spotify-player.js`),
  scope `streaming`, Premium only. `/me` no longer returns `product`, so
  Premium is detected from the SDK's `account_error` event.
- Removed for new apps: new releases, browse categories, artist top tracks,
  other users' profiles/playlists, all batch GETs. Search returns at most 10
  per type per page. Playlist items come back only for playlists the user
  owns or collaborates on.
- Still available: `/me`, `/me/top/{type}`, `/me/player/recently-played`,
  `/me/playlists`, `/playlists/{id}` and `/items`, `/me/tracks`, `/me/albums`,
  `/me/following`, `/albums/{id}` (+ `/tracks`), `/artists/{id}` (+ `/albums`),
  `/search`, all `/me/player/*` control endpoints including queue and devices.
  Save/remove/contains go through `/me/library`.
- Not stated either way: recommendations, audio features, related artists,
  featured playlists. The design does not depend on them.
- Rate limits for development mode are unpublished; 429s carry `Retry-After`.
- Spotify design rules: attribute Spotify content with its logo and link back;
  do not crop, blur, or overlay album artwork.
- Kayzee's default browser is Comet (Chromium), with Chrome also installed,
  so he sees the full refraction tier day to day.

## References

- Apple, Liquid Glass overview:
  https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- Apple newsroom, new software design (June 2025):
  https://www.apple.com/ie/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- Figma, Liquid Glass iOS 26 Control Center kit (CC BY 4.0, Regular and Clear
  materials with measured values):
  https://www.figma.com/community/file/1515608601108987500/apple-liquid-glass-ios-26-control-center-ui-kit
- Figma, Apple Music UI Kit:
  https://www.figma.com/community/file/1377364496499750549/apple-music-ui-kit
- Kayzee's look reference (no licence, do not copy code):
  https://github.com/positiveabhii/apple-music-ui
- Spotify Feb 2026 migration guide:
  https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide

Both Figma kits open only from a signed-in Figma account. If Kayzee opens
them into his drafts and shares the file links, the builder reads exact
values through the Figma connector. Otherwise the builder works from Apple's
public product pages and tunes by eye.

## Approaches

1. **Bring your own Client ID, static app (picked).** Each person registers a
   free Spotify developer app (about two minutes) and pastes its Client ID
   into a first-run setup screen. Everyone is the owner of their own app, so
   the 5-user cap never applies. No backend, no secrets, runs locally or on
   any static host. Cost: a short setup step per person.
2. **One shared Client ID that Kayzee hosts.** Zero setup for visitors, but
   hard-capped at 5 named users and dies if his Premium lapses. Fails the
   "anyone can use it" goal.
3. **Unofficial routes (librespot, private endpoints).** No caps, but breaks
   Spotify's terms, breaks often, and risks users' accounts.
4. **Desktop wrapper (Electron/Tauri).** Does not lift the cap, adds DRM and
   packaging work. Could wrap approach 1 later.

Kayzee handed over the how; approach 1 is my pick because it is the only one
that meets the sharing goal inside Spotify's rules.

## Design

### Stack (my calls)

Vite + React + TypeScript single-page app, fully static. (Earlier I said
Next.js; with no server needed, a static SPA is simpler and hosts anywhere,
including GitHub Pages.) Hash-based routing, with the OAuth redirect landing
on the app root so static hosts need no rewrite rules. Plain CSS with design
tokens as CSS variables; no UI kit. MIT licence.

### First run

Setup screen: what the app is, numbered steps to create a Spotify app, the
exact redirect URI to copy (derived from the current origin), a Client ID
field, Connect. Client ID and tokens live in `localStorage`. Settings has
Disconnect (clears tokens) and Change Client ID.

**Demo mode** (my call): a "Look around first" button loads a built-in fake
library with generated gradient artwork and no audio. It lets people see the
UI before setup, gives the README its screenshots, and lets the UI be tested
without a Spotify login.

### Screens

- **Home** — large title, horizontal shelves: Recently Played, Top Picks
  (top tracks and artists, short term), Heavy Rotation (medium term), New
  From Your Artists (latest albums/singles from the user's top ~10 artists,
  cached for a day), Your Playlists.
- **Library** — Recently Added, then Playlists, Artists, Albums, Songs.
- **Search** — field plus grouped results (songs, artists, albums,
  playlists), 10 per group with "show more" paging.
- **Album** — artwork, title, artist, Play and Shuffle, track list, save.
- **Playlist** — same layout. For playlists the user does not own, Spotify
  withholds the track list: show the header and Play, plus a one-line note.
- **Artist** — header and discography grid. No top songs (endpoint removed).
- **Now Playing** — mini player that expands to a full sheet: artwork,
  scrubber, transport, volume, shuffle/repeat, queue, device picker.
- **Settings** — account, appearance (auto/light/dark), glass quality,
  reduce motion.

Apple Music's New and Radio tabs are dropped: Spotify no longer exposes data
to fill them.

### Layout

- Phone width: floating glass tab bar (Home, Library, separate round Search
  button) with the mini player capsule above it. Tab bar shrinks on scroll
  down and returns on scroll up.
- Desktop width: floating glass sidebar (search, Home, Library sections,
  playlists) and a floating glass player bar; content scrolls behind both.
- Where Apple's web player and native apps differ, follow the native apps.
  Sources are listed under References.

### Hosting (my call)

v1 runs locally: clone, `npm install`, `npm run dev`, open
`http://127.0.0.1:PORT`. The app is built host-ready from the start (relative
base path, redirect URI derived from the current origin), so putting it on
GitHub Pages or Vercel later is a small step, not a rework. No public
instance ships in v1: publishing one is Kayzee's decision, and it makes the
project more visible to Spotify.

Consequence: the phone layout is built and tested at phone width in a desktop
browser. Using it on a real phone needs an HTTPS host, so it arrives with a
hosted instance.

### Glass system

One `Glass` primitive with Regular and Clear materials, tint, and radius.

- Chromium: `backdrop-filter` with an SVG displacement map for edge
  refraction, plus blur and saturation, a specular rim, and a soft shadow.
- Safari and Firefox: blur, saturation, and the same rim; no refraction.
- Reduced transparency (OS setting or app setting): near-opaque surfaces.

Rules: glass only on navigation and controls; nested corners are concentric;
at most a handful of refracting surfaces on screen; never animate filter
parameters per frame; honour reduced-motion.

**Artwork under glass (my call).** Content scrolls behind the glass bars, as
in Apple's apps; that is the point of the material, and artwork passing under
a translucent bar is not the app altering the artwork. Where artwork is
presented as content it stays whole: album and playlist covers are square
with a small corner radius, never circular, never with text on top. Artist
photos are not album artwork, so artist avatars are circular and the artist
header may carry the name over the photo. If Kayzee wants the strict reading
instead, the bars become opaque wherever artwork sits beneath them.

### Now Playing background

Colours are sampled from the artwork and drawn as an animated mesh gradient.
The artwork image itself is shown uncropped and unblurred, which gives the
Apple Music feel while staying inside Spotify's artwork rule.

### Playback

The Web Playback SDK registers the browser as a Spotify device named Pane;
on connect, playback transfers to it. Other Spotify Connect devices appear
in the device picker and are driven through the Web API. No Premium: browse
only, with a clear message.

### Spotify data layer

One typed API client: token refresh on 401, `Retry-After` backoff on 429,
request de-duplication, and a small TTL cache so shelves do not refetch on
every visit.

Scopes: `streaming`, `user-read-private`, `user-read-playback-state`,
`user-modify-playback-state`, `user-read-currently-playing`,
`user-library-read`, `user-library-modify`, `user-top-read`,
`user-read-recently-played`, `playlist-read-private`,
`playlist-read-collaborative`, `user-follow-read`.

### Type, icons, attribution

System font stack (renders San Francisco on Apple devices, Inter elsewhere).
An MIT-licensed icon set chosen to sit close to Apple's. A small Spotify
mark with an "Open in Spotify" link on Now Playing and on album, playlist,
and artist pages.

## Risks to know about

- Spotify's developer policy bars apps that replace its core experience
  without permission. A full client is exactly that. Each user runs it under
  their own developer agreement, and the README will say it is unofficial
  and non-commercial, but Spotify could still object to the repo.
- Looking "exactly like" Apple Music invites a trade-dress complaint if it
  ships Apple's assets or name. It ships neither.
- Audio needs a browser with Widevine DRM. Phone browser support for the SDK
  is uneven; the fallback there is remote-controlling another device.
- I cannot type Spotify passwords. Kayzee signs in himself when testing real
  playback; demo mode covers everything else.

## Needed from Kayzee

- A Spotify Premium account (assumed).
- A Spotify developer app and its Client ID, when the build reaches login.
- A yes before anything is pushed to GitHub.
- Optional: open the two Figma kits into his drafts and share the links.

## Changes since approval (2026-11-21)

- **Sign-in is one button.** Kayzee asked for a normal sign-in instead of a
  Client ID form. Pane cannot take Spotify passwords or run its own Google or
  Apple sign-in, so the screen is now "Continue with Spotify", which opens
  Spotify's page (email and password, Google, Apple, Facebook). The Client ID
  form only appears when no Client ID is known.
- **A Client ID can be built in.** `VITE_SPOTIFY_CLIENT_ID` in `.env.local`
  (git-ignored) skips the setup step for everyone using that copy. The repo
  still ships no Client ID, so the anti-goal holds; a copy configured this way
  is limited to five allowlisted accounts.

## Left to the builder

Icon set, component breakdown, animation curves, cache storage, test tooling,
tablet-width layout details, exact glass values (tuned by eye against
references).
