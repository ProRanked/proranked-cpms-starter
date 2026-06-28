import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A pure browser SPA: it logs the operator in with Auth Code + PKCE against ProRanked Identity, then calls
// the public ProRanked CPMS API (/api/cpms/v1) DIRECTLY with the resulting role-scoped operator token — no
// backend, no secret. In dev we proxy /api → the CPO host to sidestep CORS; the DEPLOYED build calls the
// API cross-origin so it exercises the real /cpms/v1 SPA-bearer CORS policy end-to-end.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_CPMS_API_BASE || 'https://cpo.phevnix.cloud';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: true },
      },
    },
  };
});
