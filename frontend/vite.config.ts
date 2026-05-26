import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const django = process.env.VITE_DJANGO_PROXY_TARGET || 'http://web:8000';

const trustedHosts = (process.env.CSRF_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map((u) => { try { return new URL(u.trim()).hostname; } catch { return ''; } })
  .filter(Boolean);

const allowedHosts = [...new Set(['localhost', 'frontend', ...trustedHosts])];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: { usePolling: true },
    allowedHosts,
    proxy: {
      '^/$': { target: django, changeOrigin: true },
      '/about': { target: django, changeOrigin: true },
      '/help': { target: django, changeOrigin: true },
      '/api': { target: django, changeOrigin: true },
      '/admin': { target: django, changeOrigin: true },
      '/static': { target: django, changeOrigin: true },
      '/media': { target: django, changeOrigin: true },
    },
  },
});
