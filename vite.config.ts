import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['.cloudfront.net'],
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
    headers: {
      // CSP as HTTP header so frame-ancestors is enforced (meta tag is ignored by browsers for frame-ancestors)
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws: wss:",
        "img-src 'self' data: https://secure.gravatar.com https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://api.dicebear.com https://ui-avatars.com",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join('; '),
      'X-Frame-Options': 'DENY',
    },
  },
})
