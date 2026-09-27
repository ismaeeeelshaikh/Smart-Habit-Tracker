// defineConfig comes from vitest/config so the `test` block is typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Where `npm run dev` sends /auth and /api. Defaults to a local backend; set
// DEV_API_TARGET to try the UI against another one, e.g. the live API:
//   DEV_API_TARGET=https://smart-habit-tracker-api-er15.onrender.com npm run dev
// The browser only ever talks to localhost, so CORS and the refresh cookie
// behave as they would same-site.
const apiTarget = process.env.DEV_API_TARGET ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // Installable app: a manifest plus a service worker that caches the app
    // shell (JS, CSS, fonts, icons) so it opens instantly and even offline.
    // API responses are never cached — they live on another origin and must
    // always be fresh.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Time Intel',
        short_name: 'Time Intel',
        description: 'Spot free time in your week and build habits in it.',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        background_color: '#F6F5F1',
        theme_color: '#F6F5F1',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Any app route opens the cached shell; React Router takes it from there.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/telegram\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/auth': {
        target: apiTarget,
        changeOrigin: true
      },
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
