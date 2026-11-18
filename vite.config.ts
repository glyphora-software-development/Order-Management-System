import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri 开发模式固定连接 http://localhost:5173，端口被占用时应直接报错而不是换端口
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
})
