import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Salida JSON para deploy_edge_function. Sólo fuentes; nunca lee .env.
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entrada = await readFile(resolve(raiz, 'supabase/functions/esport-stars/index.mjs'), 'utf8');
const archivos = new Map([['index.mjs', entrada.replaceAll('../../../', './src/')]]);
async function incluir(ruta) {
  const absoluta = resolve(raiz, ruta);
  const local = relative(raiz, absoluta).split(sep).join('/');
  if (local.startsWith('../') || !local.endsWith('.mjs')) throw new Error('Dependencia fuera del repositorio');
  const nombre = `src/${local}`;
  if (archivos.has(nombre)) return;
  const contenido = await readFile(absoluta, 'utf8');
  archivos.set(nombre, contenido);
  for (const m of contenido.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)(['"])(\.[^'"]+)\1/g)) {
    await incluir(relative(raiz, resolve(dirname(absoluta), m[2])));
  }
}
for (const m of entrada.matchAll(/import\(['"]\.\.\/\.\.\/\.\.\/([^'"]+)['"]\)/g)) await incluir(m[1]);
console.log(JSON.stringify({ entrypoint_path: 'index.mjs', files: [...archivos].map(([name, content]) => ({ name, content })) }));
