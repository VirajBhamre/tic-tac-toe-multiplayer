import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Repo root (alongside Nakama's dist/index.js); do not use ./dist — reserved for the runtime bundle.
    outDir: '../web-dist',
    emptyOutDir: true,
  },
  server: {
    // Listen on all interfaces so other devices on the same LAN can load the dev server.
    host: true,
  },
})
