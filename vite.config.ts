import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001, // Use a different port than your NestJS server
    proxy: {
      "/grpc-dashboard/api": {
        target: "http://localhost:3000", // Your NestJS server address
        changeOrigin: true,
      },
    },
  },
});
