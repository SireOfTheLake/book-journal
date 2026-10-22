// Builds the Chrome extension: npm run build:extension. Load the "extension" folder in Chrome (chrome://extensions > Developer mode > Load unpacked).
import { build } from 'esbuild';

await build({
  entryPoints: { popup: 'extension/src/popup.ts', page: 'extension/src/page.ts' },
  outdir: 'extension', bundle: true, format: 'iife', target: 'chrome110', minify: false, legalComments: 'none', logLevel: 'info',
});
