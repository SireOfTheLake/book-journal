import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Tauri + Vite setup: fixed dev port, no screen clearing so Rust errors stay visible.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Do not watch the Rust build output: Windows locks files there while they compile.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', sourcemap: true },
});
