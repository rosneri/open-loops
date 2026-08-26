import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env['API_TARGET'] ?? 'http://localhost:4455';

/**
 * `host: true` plus an explicit allow-list is what lets this be opened from another device on
 * the network as `http://neriyas-mac-mini:4444` rather than only as localhost — Vite blocks
 * unknown Host headers by default to prevent DNS-rebinding.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 4444,
    strictPort: true,
    allowedHosts: [
      'localhost',
      'neriyas-mac-mini',
      'neriyas-mac-mini.local',
      'neriyas-mini',
      'neriyas-mini.local',
      '.local',
      '.ts.net',
    ],
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: { host: true, port: 4444, allowedHosts: true },
  build: { outDir: 'dist', sourcemap: true },
});
