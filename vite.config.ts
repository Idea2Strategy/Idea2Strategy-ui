/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The default 5s cuts off the longer launch flows on slower machines,
    // and a test killed mid-flow leaks editor draft state into later tests.
    testTimeout: 15000,
  },
});
