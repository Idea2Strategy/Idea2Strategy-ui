/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  server: process.env.VITE_REAL_API_TARGET ? {
    proxy: {
      // The backtest read surface lives on backtest-api, not backend-api.
      // The more specific rule wins, so only /api/v1/backtests leaves the
      // backend target; everything else keeps its single-origin path.
      ...(process.env.VITE_BACKTEST_API_TARGET ? {
        '/api/v1/backtests': { target: process.env.VITE_BACKTEST_API_TARGET, changeOrigin: false },
      } : {}),
      '/api': { target: process.env.VITE_REAL_API_TARGET, changeOrigin: false },
      '/actuator': { target: process.env.VITE_REAL_API_TARGET, changeOrigin: false },
    },
  } : undefined,
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The default 5s cuts off the longer launch flows on slower machines,
    // and a test killed mid-flow leaks editor draft state into later tests.
    testTimeout: 15000,
  },
});
