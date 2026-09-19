import { defineConfig } from 'tsdown';

// Three self-contained IIFE bundles (one per extension entry point). Keeping
// them as separate configs avoids shared chunks, which IIFEs can't import.
// `scripts/build.mjs` copies the output plus static assets into dist/<target>.
const iife = (entry) => ({
  entry: [entry],
  outDir: 'build',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  clean: false,
  minify: true,
  sourcemap: false,
  outputOptions: { entryFileNames: '[name].js' },
});

export default defineConfig([iife('src/content.ts'), iife('src/background.ts'), iife('src/popup.ts')]);
