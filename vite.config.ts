import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      // Vite hanya melayani frontend. Direktori backend/runtime tidak boleh
      // dipantau: profil Chromium (LocalAuth) dan berkas sementara `tsx watch`
      // dikunci OS sehingga watcher bisa gagal EBUSY dan mematikan dev server.
      ignored: [
        '**/data/**',
        '**/storage/**',
        '**/server/**',
        '**/prisma/**',
        '**/scripts/**',
        '**/tests/**',
        '**/docs/**',
        '**/test-output/**',
        '**/dist/**',
        '**/.git/**',
        '**/*.tmp',
        '**/*.tmpdir/**'
      ]
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/media': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600
  }
});
