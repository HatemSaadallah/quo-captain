import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { darkTheme, largeText } from './src/theme-css.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [largeText(), darkTheme()] } },
  server: {
    host: '::',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});
