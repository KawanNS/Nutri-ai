import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from main.tsx, which reloads the page as soon as a new version takes over.
      injectRegister: false,
      workbox: {
        // A new deploy replaces the old version right away and drops its caches, so a phone never
        // keeps showing an old screen whose images no longer exist on the server.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Images ship with each version too, so a cached screen never shows a broken logo.
        globPatterns: ['**/*.{js,css,html,webp,png,svg,ico}'],
      },
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Alyvora',
        short_name: 'Alyvora',
        description: 'Organização alimentar personalizada para a sua rotina.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#6C873F',
        background_color: '#F8F4E9',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
