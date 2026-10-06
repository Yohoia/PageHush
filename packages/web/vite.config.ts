import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const packageDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageDir, '../..');

export default defineConfig({
  root: projectRoot,
  publicDir: resolve(packageDir, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(packageDir, 'src'),
    },
  },
  server: {
    proxy: {
      '/v1': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: resolve(packageDir, 'dist'),
    emptyOutDir: true,
  },
});
