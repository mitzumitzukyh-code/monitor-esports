// Build de la Mini App: sin bundler ni dependencias.
//
//   node miniapp/scripts/construir.mjs    ->  miniapp/dist/
//
// Copia index.html, src/ y public/ (public/assets -> dist/assets, igual que
// la convención de Vite, por si algún día se migra). Antes de copiar revisa
// que el build no salga roto:
//   - todo import relativo de src/ apunta a un archivo que existe;
//   - todo "assets/..." que se usa en src/ o index.html existe en public/;
//   - ningún archivo de src/ abre facturas (compras apagadas en la V1).

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MINIAPP = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function archivos(dir) {
  return readdirSync(dir).flatMap((f) => {
    const ruta = join(dir, f);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

/** @returns {string[]} problemas encontrados; vacío si el build está sano */
export function revisar(raiz = MINIAPP) {
  const problemas = [];
  const fuentes = archivos(join(raiz, 'src'));
  const html = join(raiz, 'index.html');
  for (const archivo of [...fuentes, html]) {
    const texto = readFileSync(archivo, 'utf8');
    const nombre = relative(raiz, archivo);
    if (archivo.endsWith('.mjs')) {
      for (const [, ruta] of texto.matchAll(/(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/g)) {
        if (!existsSync(resolve(dirname(archivo), ruta))) problemas.push(`${nombre}: import roto ${ruta}`);
      }
      if (/openInvoice|sendInvoice|createInvoiceLink/.test(texto)) problemas.push(`${nombre}: abre facturas y las compras están apagadas`);
    }
    for (const [ruta] of texto.matchAll(/assets\/[a-z0-9-]+\/[a-z0-9-]+\.(?:webp|png)/g)) {
      if (!existsSync(join(raiz, 'public', ruta))) problemas.push(`${nombre}: asset inexistente ${ruta}`);
    }
    // Plantilla de emblemas por juego: `assets/games/${j}-placeholder.webp`.
    if (texto.includes('assets/games/${')) {
      for (const j of ['cs2', 'dota2', 'lol', 'valorant']) {
        if (!existsSync(join(raiz, 'public', 'assets', 'games', `${j}-placeholder.webp`))) problemas.push(`falta emblema de ${j}`);
      }
    }
  }
  for (const [, ruta] of readFileSync(html, 'utf8').matchAll(/(?:src|href)="(src\/[^"]+)"/g)) {
    if (!existsSync(join(raiz, ruta))) problemas.push(`index.html: referencia rota ${ruta}`);
  }
  return problemas;
}

export function construir({ raiz = MINIAPP, destino = join(MINIAPP, 'dist') } = {}) {
  const problemas = revisar(raiz);
  if (problemas.length) throw new Error(`Build detenido:\n  - ${problemas.join('\n  - ')}`);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  cpSync(join(raiz, 'index.html'), join(destino, 'index.html'));
  cpSync(join(raiz, 'src'), join(destino, 'src'), { recursive: true });
  cpSync(join(raiz, 'public'), destino, { recursive: true });
  return { destino, archivos: archivos(destino).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { destino, archivos: n } = construir();
    console.log(`OK: Mini App construida en ${relative(process.cwd(), destino) || '.'} (${n} archivos)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
