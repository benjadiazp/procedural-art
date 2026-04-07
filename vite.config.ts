import { defineConfig } from 'vite';
import { resolve } from 'path';

const isLib = process.env.BUILD_LIB === 'true';

export default defineConfig(
  isLib
    ? {
        build: {
          lib: {
            entry: resolve(__dirname, 'src/lib.ts'),
            formats: ['es'],
            fileName: 'procedural-art',
          },
          rollupOptions: {
            external: [
              'three',
              /^three\//,
              'lil-gui',
              'postprocessing',
              /^postprocessing\//,
            ],
          },
        },
      }
    : {},
);
