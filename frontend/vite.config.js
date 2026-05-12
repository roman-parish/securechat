import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // generateSW: Workbox auto-generates dist/sw.js with precaching + routing.
      // The post-build inject-push.js script appends the push notification
      // handler — keeping it separate avoids ES-module bundling issues in SW.
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually in main.jsx
      // Don't generate a manifest — public/manifest.json is the single source
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css}'],
        // Serve index.html network-first so CSP/response headers stay fresh;
        // falls back to cache only when offline.
        navigateFallback: null,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 5, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\/uploads\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
