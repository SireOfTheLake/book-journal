import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// The phone version: the same journal, a small screen, and no desktop shell. Built into dist-phone and hosted as a web page.
export default defineConfig({
  root: 'phone',
  base: './',
  plugins: [react()],
  server: { port: 1421, strictPort: true, fs: { allow: ['..'] } },
  define: { __APP_VERSION__: JSON.stringify(version) },
  envPrefix: ['VITE_'],
  build: { outDir: '../dist-phone', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
