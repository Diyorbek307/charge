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
  plugins: [
    react(),
    tailwindcss(),
    // The list of built files, so an offline pack can keep every screen's code, not only the visited ones.
    {
      name: 'asset-list',
      generateBundle(_, bundle) {
        this.emitFile({ type: 'asset', fileName: 'asset-list.json', source: JSON.stringify(Object.keys(bundle).filter(f => f.startsWith('assets/'))) })
      },
    },
  ],
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
