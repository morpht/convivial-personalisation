import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  build: {
    outDir: 'dist',
    rolldownOptions: { output: { exports: 'named' } },
    lib: {
      entry: 'src/index.js',
      name: 'ConvivialPersonalisation',
      formats: ['umd'],
      fileName: () => 'bundle.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
};
