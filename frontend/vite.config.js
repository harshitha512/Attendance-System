import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // FIX: was port 8000 (FastAPI) — your backend is Express on port 5000
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        // FIX: removed rewrite that was stripping /api prefix
        // Express expects /api/auth/login, /api/employees, etc. — not /auth/login
      },
    },
  },
})