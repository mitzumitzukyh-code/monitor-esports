import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const source = path.resolve(webRoot, '..', 'assets');
const target = path.join(webRoot, 'public', 'assets');

if (!existsSync(source)) {
  console.warn('No se encontró ../assets; se omite la copia.');
  process.exit(0);
}
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
console.log('Assets sincronizados en web/public/assets');
