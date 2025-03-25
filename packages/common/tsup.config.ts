import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],           // CommonJS for NestJS
  minify: true,              // Minify output
  dts: true,                 // Generate .d.ts files
  sourcemap: true,           // Optional: for debugging
  treeshake: true,           // Explicitly enable tree-shaking
  clean: true,               // Clean dist/ before build
  esbuildOptions(options) {
    options.platform = 'node'; // Target Node.js
    options.minifyIdentifiers = true; // Shorten variable names
    options.minifySyntax = true;      // Optimize syntax
  },
});