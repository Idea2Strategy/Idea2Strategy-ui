/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: mode !== 'test' ? {
      // Unit and visual tests can explicitly exercise prototype screens, but a
      // deployable bundle must not contain invented strategies, bots or alerts.
      alias: {
        '../data/mockData': fileURLToPath(new URL('./src/data/productionEmptyData.ts', import.meta.url)),
      },
    } : undefined,
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{
              name: 'three-vendor',
              maxSize: 450_000,
              test: /node_modules[\\/]three[\\/]/,
            }],
          },
        },
      },
    },
    server: env.VITE_REAL_API_TARGET ? {
      proxy: {
        // The backtest read surface lives on backtest-api, not backend-api.
        // The more specific rule wins, so only /api/v1/backtests leaves the
        // backend target; everything else keeps its single-origin path.
        ...(env.VITE_BACKTEST_API_TARGET ? {
          '/api/v1/backtests': { target: env.VITE_BACKTEST_API_TARGET, changeOrigin: true },
        } : {}),
        '/api': { target: env.VITE_REAL_API_TARGET, changeOrigin: true },
        '/actuator': { target: env.VITE_REAL_API_TARGET, changeOrigin: true },
      },
    } : undefined,
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // The default 5s cuts off the longer launch flows on slower machines,
      // and a test killed mid-flow leaks editor draft state into later tests.
      testTimeout: 15000,
    },
  };
});
