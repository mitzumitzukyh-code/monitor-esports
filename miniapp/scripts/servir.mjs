// Servidor estático local para revisar la Mini App en el navegador.
//
//   node miniapp/scripts/servir.mjs          ->  http://127.0.0.1:4330  (fuentes)
//   node miniapp/scripts/servir.mjs --dist   ->  sirve miniapp/dist ya construido
//
// Con fuentes, /assets/* se busca en public/ (misma forma que dist/). Sólo
// escucha en 127.0.0.1: esto no es un deploy.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MINIAPP = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function crearServidor({ dist = false } = {}) {
  const raices = dist ? [join(MINIAPP, 'dist')] : [MINIAPP, join(MINIAPP, 'public')];
  return createServer(async (req, res) => {
    const camino = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const ruta = camino === '/' ? '/index.html' : camino;
    for (const raiz of raices) {
      const buscada = resolve(raiz, `.${ruta}`);
      // Nada fuera de la raíz: "/../.env" no sale del sitio.
      if (buscada !== raiz && !buscada.startsWith(raiz + sep)) break;
      if (!dist && raiz === MINIAPP && /^[/\\](scripts|dist|node_modules)([/\\]|$)/.test(ruta)) continue;
      try {
        const datos = await readFile(buscada);
        res.writeHead(200, { 'Content-Type': TIPOS[extname(buscada)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(datos);
        return;
      } catch { /* probar la siguiente raíz */ }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`no existe: ${ruta}\n`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO) || 4330;
  const dist = process.argv.includes('--dist');
  crearServidor({ dist }).listen(puerto, '127.0.0.1', () => {
    console.log(`Mini App (${dist ? 'dist' : 'fuentes'}) en http://127.0.0.1:${puerto}`);
    console.log('Estados de demo: ?demo=free | pro | individual | vacio | error');
  });
}
