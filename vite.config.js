import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端开发服务器代理：时间逻辑永远请求服务端，不允许客户端自行裁决
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },
});
