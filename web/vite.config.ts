import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const here = import.meta.dirname

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': path.resolve(here, '../shared') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${process.env.PORT ?? 3001}`, changeOrigin: false } },
  },
  build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true, sourcemap: false },
})
