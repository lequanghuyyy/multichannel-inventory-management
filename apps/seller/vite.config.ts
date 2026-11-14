import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Derived from the host, capped at the value this config used to hardcode.
//
// Oversubscribing the CPU does not slow the suite proportionally — it makes it fail. Four
// jsdom workers on a two-core machine spend so much time contending that `waitFor` budgets
// expire on pages which render perfectly in isolation, and the failure then reads as "the page
// is broken" when nothing is wrong with the page. Capping at 4 keeps CI's wall time unchanged
// and makes a smaller machine run the same tests correctly instead of intermittently.
const testWorkers = Math.max(1, Math.min(4, availableParallelism() - 1));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:8080',
      '/api': 'http://127.0.0.1:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    maxWorkers: testWorkers,
    // The same reasoning as the worker cap, applied to the clock. Vitest's default 5s is a
    // budget for an unloaded machine, and these tests render the whole Seller App: on a host
    // that is also running the Go race suite, a page which renders in 300ms alone can take
    // several seconds. When that happens the failure reads as "this screen is broken" and
    // sends the next person to debug a page that is fine. Raising the bound does not make a
    // real hang pass — a hung test burns the whole budget and still fails.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
