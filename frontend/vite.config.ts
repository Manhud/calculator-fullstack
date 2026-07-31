import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Fail loudly rather than silently moving to another port: the backend's
    // ALLOWED_ORIGIN names 5173, so a shifted port breaks CORS in a way that
    // looks like a backend fault.
    strictPort: true,
  },
})
