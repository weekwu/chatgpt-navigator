import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const options = {
  entryPoints: ['src/index.ts'], bundle: true, outfile: 'dist/content.js',
  format: 'iife', target: 'chrome111', minify: !process.argv.includes('--watch'),
  sourcemap: false, loader: { '.css': 'text' }, legalComments: 'none'
};
if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching src/. Reload extension and ChatGPT after changes.');
} else {
  await build(options);
  console.log('Built dist/ — load this folder in chrome://extensions.');
}
