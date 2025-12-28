import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Proxy API requests to our development server
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [react()],
    define: {
      // LiveKit URL for client-side usage
      'import.meta.env.VITE_LIVEKIT_URL': JSON.stringify(env.LIVEKIT_URL || env.VITE_LIVEKIT_URL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['livekit-client'],
    },
  };
});
