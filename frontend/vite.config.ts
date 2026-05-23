import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const django = process.env.VITE_DJANGO_PROXY_TARGET || 'http://web:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: { usePolling: true },
    allowedHosts: ['localhost', 'midas-hand.ru', 'www.midas-hand.ru', 'frontend'],
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
