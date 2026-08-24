// Servidor estático mínimo para ver la sala de control en el navegador.
//
//   node salida/web/servir.mjs      ->  http://127.0.0.1:4322
//
// La página es un HTML autocontenido y también se abre con doble click,
// pero desde file:// no se puede probar bien (rutas relativas de logos,
// iconos y fuentes). Esto da una URL estable para iterar.
//
// Sirve SÓLO salida/web, que es exactamente lo que publica Pages: si algo
// se ve acá, se ve publicado.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const PUERTO = Number(process.env.PUERTO) || 4322;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const RAIZ = new URL('./', import.meta.url);

createServer(async (req, res) => {
  const ruta = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  // La URL se normaliza al resolverla: sin este chequeo, "/../.env" salía
  // del directorio y servía archivos de fuera del sitio. Es local, pero
  // un agujero es un agujero.
  const buscada = new URL('.' + ruta, RAIZ);
  if (!buscada.href.startsWith(RAIZ.href)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`fuera del sitio: ${ruta}\n`);
    return;
  }
  try {
    const datos = await readFile(buscada);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`no existe: ${ruta}\n\n¿corriste "node --env-file=.env salida/web/generar.mjs" primero?`);
  }
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`sala de control en http://127.0.0.1:${PUERTO}`);
});
