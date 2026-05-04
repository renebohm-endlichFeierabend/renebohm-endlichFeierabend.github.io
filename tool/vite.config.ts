import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/tool/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'sounds/*.mp3'],
      manifest: {
        name: 'Lehrer-Tool',
        short_name: 'Lehrer',
        description: 'Noten, Aufgaben, Videos und Meditation für Lehrkräfte',
        start_url: '/tool/',
        scope: '/tool/',
        display: 'standalone',
        background_color: '#fafaf7',
        theme_color: '#1c1917',
        icons: [
          { src: '/tool/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/tool/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/tool/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'google-api-cache' },
          },
        ],
      },
    }),
  ],
});
