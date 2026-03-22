import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    allowedHosts: true,
    proxy: {
      // 🟢 จัดการฝั่ง API (fetch ต่างๆ)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // 🟢 จัดการฝั่ง Socket (เรียลไทม์)
      '/ws': {
        target: 'http://localhost:8080',
        ws: true, // สำคัญมาก! ต้องมีตัวนี้ Socket ถึงจะทำงานผ่าน ngrok ได้
        changeOrigin: true,
      }
    }
  }
})