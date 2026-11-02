/** Build the browser bundle with the repository's Vite configuration. */
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

await build({
  configFile: fileURLToPath(new URL('./vite.config.js', import.meta.url)),
});
