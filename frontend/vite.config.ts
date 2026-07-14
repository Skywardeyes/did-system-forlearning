import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:4173',
        changeOrigin: false,
      },
    },
  },
  preview: { host: '127.0.0.1', port: Number(process.env.VITE_PREVIEW_PORT || 5174), strictPort: true },
})
