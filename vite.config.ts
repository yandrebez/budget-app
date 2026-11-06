import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// GitHub Pages serves from /<repo>/, so CI sets BASE_PATH. Locally it stays '/'.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      workbox: {
        // The 1.2 MB PDF worker is cached the first time a PDF is opened, not on install.
        runtimeCaching: [{ urlPattern: /pdf\.worker.*\.mjs$/, handler: 'CacheFirst', options: { cacheName: 'pdf-worker' } }],
      },
      manifest: {
        name: 'Budget App',
        short_name: 'Budget',
        description: 'A customisable, offline-first budget tracker.',
        theme_color: '#0f766e',
        background_color: '#f6f7f6',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30000 },
})
