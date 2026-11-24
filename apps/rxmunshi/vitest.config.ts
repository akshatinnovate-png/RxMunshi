import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], alias: { 'server-only': fileURLToPath(new URL('./src/server/empty.ts', import.meta.url)) }, environment: 'node' },
});
