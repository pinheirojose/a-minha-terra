import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const key = env.VITE_APIABERTA_KEY || env.APIABERTA_KEY
  // The browser calls /api/*; this proxy adds the key server-side so it never ships in the bundle.
  const proxy = {
    '/api': {
      target: 'https://api.apiaberta.pt',
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api/, ''),
      headers: key ? { 'X-API-Key': key } : undefined,
    },
  }
  return {
    plugins: [react()],
    // No .env var is exposed to client code (Vite's default would expose VITE_* ones).
    envPrefix: 'MYHOMETOWN_PUBLIC_',
    server: { proxy },
    preview: { proxy },
  }
})
