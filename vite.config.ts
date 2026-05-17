import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: {
    host: process.env.SMARTFOCUS_DEV_HOST || "127.0.0.1",
    port: Number(process.env.SMARTFOCUS_DEV_PORT || 1438),
    strictPort: true,
  },
});
