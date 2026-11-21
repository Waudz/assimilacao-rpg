import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Caminhos relativos: funciona em GitHub Pages (subpasta) e em hospedagem na raiz.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // O app inteiro é pré-cacheado; chamadas ao Supabase nunca são cacheadas.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
      },
      manifest: {
        name: 'Assimilação RPG — Fichas',
        short_name: 'Assimilação',
        description: 'Fichas digitais de Infectados e mesa do Assimilador',
        lang: 'pt-BR',
        theme_color: '#f1ead8',
        background_color: '#f1ead8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
});
