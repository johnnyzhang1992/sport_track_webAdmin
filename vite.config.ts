import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177, // 管理后台 dev 端口
    proxy: {
      // 开发时 /sport-track/api 转发到后端（与线上 nginx 前缀一致，路径原样透传）
      '/sport-track/api': {
        target: 'http://127.0.0.1:3004',
        changeOrigin: true,
      },
    },
  },
})
