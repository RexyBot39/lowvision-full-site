/**
 * Writes dist-node/directory.json: the resource directory (src/data/directorySeed.ts)
 * as plain data, so the production server can sync it into the CRM from the
 * admin dashboard. The runtime image doesn't include the TypeScript sources.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [resolve(root, 'src/data/directorySeed.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
mkdirSync(resolve(root, 'dist-node'), { recursive: true });
writeFileSync(resolve(root, 'dist-node/directory.json'), JSON.stringify(mod.directorySeedData));
console.log(`✓ dist-node/directory.json (${mod.directorySeedData.length} organizations)`);
