import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Spotify rejects `localhost` redirect URIs, so the dev server binds the
// loopback address explicitly. `base: './'` keeps the build host-agnostic.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
