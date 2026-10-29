import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Vite tidak perlu membaca `.env` milik server. Berkas itu memuat
  // NODE_ENV=development, dan Vite memakainya untuk memilih *export condition*
  // `development` pada dependency: React dev build + JSX dev transform masuk ke
  // bundle (≈40% lebih besar, berbeda dari hasil build Docker yang tidak membawa
  // `.env`). Frontend tidak memakai variabel VITE_*, jadi cukup dimatikan.
  envDir: false,
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
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Pisahkan vendor besar agar setiap chunk tetap di bawah batas
        // transform esbuild. Ini juga mempercepat cache antar rilis.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Kelompokkan vendor agar jumlah request tetap wajar, tetapi setiap
          // chunk tetap di bawah batas transform esbuild (<1 MB).
          const tail = id.split('node_modules/')[1];
          if (!tail) return 'vendor';
          const parts = tail.split('/');
          const pkg = parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];

          if (
            /^(react|react-dom|react-router|react-router-dom|@remix-run\/router|scheduler|react-is|use-sync-external-store|object-assign|loose-envify|react-redux|redux|redux-thunk|@reduxjs\/toolkit|immer|reselect)$/.test(
              pkg
            )
          ) {
            return 'vendor-react';
          }
          if (/^(recharts|victory-vendor|d3-.+|decimal\.js-light|eventemitter3)$/.test(pkg)) {
            return 'charts';
          }
          if (
            /^(@radix-ui\/.+|@floating-ui\/.+|lucide-react|sonner|clsx|tailwind-merge|class-variance-authority|date-fns|aria-hidden|react-remove-scroll|react-remove-scroll-bar|get-nonce|react-style-singleton|use-sidecar|use-callback-ref|tslib)$/.test(
              pkg
            )
          ) {
            return 'vendor-ui';
          }
          return 'vendor';
        }
      }
    }
  }
});
