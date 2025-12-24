import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // When building for production and deploying to a subfolder (like cPanel public_html),
  // using a relative base ensures asset URLs are relative and work after upload.
  base: mode === 'production' ? './' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Use explicit IPv4 to avoid IPv6 (::1) resolution issues on some Windows setups
        target: '',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
