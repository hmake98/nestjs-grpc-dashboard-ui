import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001, // Use a different port than your NestJS server
    proxy: {
      '/grpc-dashboard/api': {
        target: 'http://localhost:3000', // Your NestJS server address
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/grpc-dashboard\/api/, '/api'),
        secure: false,
        ws: true,
      },
    },
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    chunkSizeWarningLimit: 1600,
  },
});
