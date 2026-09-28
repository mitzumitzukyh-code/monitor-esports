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

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MINIAPP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const API_PRODUCCION = 'https://ysqstdgjmugdlyahkhou.supabase.co/functions/v1/esport-miniapp';

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
    for (const [ruta] of texto.matchAll(/assets\/[a-z0-9-]+\/[a-z0-9-]+\.(?:webp|png|svg)/g)) {
      if (!existsSync(join(raiz, 'public', ruta))) problemas.push(`${nombre}: asset inexistente ${ruta}`);
    }
    // Plantilla de emblemas por juego: `assets/games/${j}.svg`.
    if (texto.includes('assets/games/${')) {
      for (const j of ['cs2', 'dota2', 'lol', 'valorant']) {
        if (!existsSync(join(raiz, 'public', 'assets', 'games', `${j}.svg`))) problemas.push(`falta emblema de ${j}`);
      }
    }
  }
  for (const [, ruta] of readFileSync(html, 'utf8').matchAll(/(?:src|href)="(src\/[^"]+)"/g)) {
    if (!existsSync(join(raiz, ruta))) problemas.push(`index.html: referencia rota ${ruta}`);
  }
  return problemas;
}

export function construir({ raiz = MINIAPP, destino = join(MINIAPP, 'dist'), apiUrl = null } = {}) {
  const problemas = revisar(raiz);
  if (problemas.length) throw new Error(`Build detenido:\n  - ${problemas.join('\n  - ')}`);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  cpSync(join(raiz, 'index.html'), join(destino, 'index.html'));
  cpSync(join(raiz, 'src'), join(destino, 'src'), { recursive: true });
  cpSync(join(raiz, 'public'), destino, { recursive: true });

  // La fuente queda en demo en local y previews. Sólo el build de producción
  // de Vercel activa la API real, salvo override explícito para pruebas.
  const api = apiUrl ?? (process.env.MINIAPP_API_URL || (process.env.VERCEL_ENV === 'production' ? API_PRODUCCION : ''));
  if (api) {
    if (!/^https:\/\//.test(api)) throw new Error('MINIAPP_API_URL debe ser HTTPS');
    const index = join(destino, 'index.html');
    const html = readFileSync(index, 'utf8');
    const buscado = '<meta name="monitor-api-url" content="">';
    if (!html.includes(buscado)) throw new Error('No se encontró el gate monitor-api-url en index.html');
    writeFileSync(index, html.replace(buscado, `<meta name="monitor-api-url" content="${api}">`));
  }
  return { destino, archivos: archivos(destino).length, apiReal: Boolean(api) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { destino, archivos: n, apiReal } = construir();
    console.log(`OK: Mini App construida en ${relative(process.cwd(), destino) || '.'} (${n} archivos, ${apiReal ? 'API real' : 'demo'})`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
