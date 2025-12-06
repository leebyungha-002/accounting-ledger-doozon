import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081,
    open: true, // 개발 서버 시작 시 자동으로 브라우저 열기
  },
  plugins: [
    react({
      // Babel을 명시적으로 사용하여 일관성 유지
      babel: {
        plugins: [],
      },
    }), 
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
