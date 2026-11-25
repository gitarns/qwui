import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',  // qwui backend (make run-backend)
        changeOrigin: true,
      },
      '/login': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/logout': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/quickwit': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // So an MCP client can be pointed at the dev server on 5173 like
      // everything else, instead of needing the backend port directly.
      '/mcp': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    }
  }
})
