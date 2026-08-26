import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `injectManifest` would need a hand-written service worker; this
      // site has no offline-first data needs yet (everything is live
      // API data), so `generateSW`'s default precache-the-app-shell +
      // runtime-cache-the-rest is the right amount of complexity.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'LankaAuto — Japanese Motor Vehicle Spares',
        short_name: 'LankaAuto',
        description: 'Browse the LankaAuto parts catalogue and find genuine part numbers, fitments, and stock status.',
        start_url: '/',
        display: 'standalone',
        background_color: '#1c1d1f',
        theme_color: '#1c1d1f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // No `workbox.runtimeCaching` entries: the backend lives on a
      // separate origin (`VITE_API_BASE_URL`), so the generated service
      // worker never intercepts API calls at all — only same-origin static
      // assets get precached. Stock status and search results stay live,
      // by construction, not by a cache-policy choice. `generateSW`'s
      // default `navigateFallback: index.html` is what makes React Router
      // deep links (e.g. a bookmarked `/parts/:id`) work offline for the
      // app shell.
    }),
  ],
})
