import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 加上这一行，把你收到的那个 trycloudflare.com 域名填进去
    allowedHosts: ['demo.jiafu.tech']
  },
});
