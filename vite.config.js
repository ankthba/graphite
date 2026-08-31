import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    chunkSizeWarningLimit: 4000,
    target: 'es2020',
    // inline MathLive's fonts into the single-file bundle
    assetsInlineLimit: 100000000,
  },
});
