/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. A Spotify Client ID built into this copy of Pane. See .env.example. */
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
