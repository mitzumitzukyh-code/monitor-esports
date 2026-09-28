// Equivalente en Node de design/unpack-miniapp-assets.ps1, para Linux, macOS y CI.
//
//   node miniapp/scripts/desempacar-assets.mjs            extrae y verifica
//   node miniapp/scripts/desempacar-assets.mjs --revisar  sólo compara lo extraído
//
// Mismas garantías que el .ps1: 7 partes, largo exacto del base64 y SHA-256
// del ZIP antes de extraer. Además rechaza cualquier entrada del ZIP que
// quiera escribir fuera de miniapp/public/assets/.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PARTES = join(RAIZ, 'design', 'assets-pack-v1-b64');
const LARGO_BASE64 = 55256;
const SHA_ZIP = '77ff70bf59a81392c69c7b80a7d7ad808f17b934b8ec649402da134baea16ff2';
const PREFIJO = 'miniapp/public/assets/';

export const REQUERIDOS = Object.freeze([
  'brand/logo-full.webp', 'brand/logo-symbol.webp', 'brand/app-icon.webp', 'brand/favicon.png', 'brand/loading-mark.webp',
  'heroes/hero-home.webp', 'heroes/match-header.webp', 'heroes/hero-pro.webp', 'heroes/hero-history.webp',
  'states/empty-matches.webp', 'states/empty-history.webp', 'states/error-state.webp',
  'games/cs2-placeholder.webp', 'games/dota2-placeholder.webp', 'games/lol-placeholder.webp', 'games/valorant-placeholder.webp',
]);

export function leerZip() {
  const partes = readdirSync(PARTES).filter((f) => /^part-\d+\.txt$/.test(f)).sort();
  if (partes.length !== 7) throw new Error(`Se esperaban 7 partes, hay ${partes.length}.`);
  const base64 = partes.map((f) => readFileSync(join(PARTES, f), 'utf8').replace(/\s+/g, '')).join('');
  if (base64.length !== LARGO_BASE64) throw new Error(`Largo del base64: se esperaba ${LARGO_BASE64}, hay ${base64.length}.`);
  const zip = Buffer.from(base64, 'base64');
  const sha = createHash('sha256').update(zip).digest('hex');
  if (sha !== SHA_ZIP) throw new Error(`SHA-256 del ZIP no coincide: ${sha}`);
  return { zip, sha };
}

/** Lee las entradas de un ZIP (store o deflate) desde el directorio central. */
export function entradasZip(zip) {
  let fin = zip.length - 22;
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('ZIP sin directorio central.');
  const total = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  const entradas = [];
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio central corrupto.');
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28), largoExtra = zip.readUInt16LE(p + 30), largoComentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nombre = zip.toString('utf8', p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombre.endsWith('/')) continue;
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const datos = zip.subarray(inicio, inicio + comprimido);
    if (metodo !== 0 && metodo !== 8) throw new Error(`${nombre}: método de compresión ${metodo} no soportado.`);
    entradas.push({ nombre, datos: metodo === 8 ? inflateRawSync(datos) : Buffer.from(datos) });
  }
  return entradas;
}

function destinoSeguro(nombre) {
  const limpio = normalize(nombre).split(sep).join('/');
  if (!limpio.startsWith(PREFIJO) || limpio.includes('..')) throw new Error(`Entrada fuera de ${PREFIJO}: ${nombre}`);
  return join(RAIZ, limpio);
}

function principal() {
  const revisar = process.argv.includes('--revisar');
  const { zip, sha } = leerZip();
  const entradas = entradasZip(zip);
  const distintos = [];
  for (const { nombre, datos } of entradas) {
    const destino = destinoSeguro(nombre);
    if (revisar) {
      let actual = null;
      try { actual = readFileSync(destino); } catch { /* falta */ }
      if (!actual || !actual.equals(datos)) distintos.push(nombre);
    } else {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, datos);
    }
  }
  const nombres = new Set(entradas.map((e) => e.nombre.slice(PREFIJO.length)));
  const faltan = REQUERIDOS.filter((r) => !nombres.has(r));
  if (faltan.length) throw new Error(`Faltan archivos requeridos en el paquete: ${faltan.join(', ')}`);
  if (distintos.length) throw new Error(`Assets extraídos distintos al paquete: ${distintos.join(', ')}`);
  console.log(revisar
    ? `OK: los ${entradas.length} assets de miniapp/public/assets coinciden con el paquete`
    : `OK: Monitor eSports Mini App assets extracted to miniapp/public/assets (${entradas.length} archivos)`);
  console.log(`SHA256: ${sha}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { principal(); } catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
}
