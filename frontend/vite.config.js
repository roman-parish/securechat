import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest: VitePWA processes src/sw.js, injects the precache
      // manifest, and outputs /sw.js — our push handler is preserved.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: null, // we register manually in main.jsx
      // Don't generate a manifest — we own public/manifest.json
      manifest: false,
      injectManifest: {
        // Only precache JS/CSS; HTML is served network-first so response
        // headers (CSP etc.) stay fresh.
        globPatterns: ['**/*.{js,css}'],
        globIgnores: ['sw.js'],
      },
    }),
  ],
  server: { port: 5173 },
});
