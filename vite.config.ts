import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  // Shown in the driver app's settings.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Dev server talks to the Express API/SSE backend on :3000.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
