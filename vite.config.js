import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  define: {
    global: 'globalThis'
  }, 
  server: {
    headers: isolationHeaders
  },
  preview: {
    headers: isolationHeaders
  }, 
  optimizeDeps: {
    exclude: ['z3-Solver']
  },
})
