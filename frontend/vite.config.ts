// defineConfig comes from vitest/config so the `test` block is typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
