import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    base: env.VITE_BASE || process.env.VITE_BASE || '/',
    plugins: [react()],
    resolve: {
      alias: { '@shared': path.resolve(__dirname, 'shared') },
    },
  }
})
