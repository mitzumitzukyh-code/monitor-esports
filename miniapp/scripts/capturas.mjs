// Capturas móviles de todas las pantallas para revisar la UI.
//
//   node miniapp/scripts/capturas.mjs [carpeta]   (por defecto miniapp/capturas/)
//
// Necesita Playwright con Chromium. No es dependencia del repo: se busca el
// que haya instalado (local o global). El SDK de Telegram se sustituye por un
// doble de prueba, así las capturas no dependen de telegram.org y además
// ejercitan el adaptador (insets de pantalla completa, botón Atrás).

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearServidor } from './servir.mjs';

const MINIAPP = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function cargarPlaywright() {
  try { return await import('playwright'); } catch { /* probar la global */ }
  const { execSync } = await import('node:child_process');
  const global = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const ruta = createRequire(join(global, 'x.js')).resolve('playwright');
  const modulo = await import(pathToFileURL(ruta).href);
  return modulo.chromium ? modulo : modulo.default;
}

// Doble del SDK: lo mínimo que usa src/telegram.mjs.
const sdkFalso = ({ insets = false } = {}) => `
  window.__tg = { llamadas: [] };
  const anotar = (n) => (...a) => window.__tg.llamadas.push([n, ...a]);
  window.Telegram = { WebApp: {
    platform: 'ios', version: '8.0', colorScheme: 'dark', themeParams: {},
    initDataUnsafe: { user: { id: 1, first_name: 'Demo' } },
    safeAreaInset: ${insets ? '{ top: 47, bottom: 34, left: 0, right: 0 }' : '{ top: 0, bottom: 0, left: 0, right: 0 }'},
    contentSafeAreaInset: ${insets ? '{ top: 46, bottom: 0, left: 0, right: 0 }' : '{ top: 0, bottom: 0, left: 0, right: 0 }'},
    isVersionAtLeast: (v) => parseFloat(v) <= 8.0,
    ready: anotar('ready'), expand: anotar('expand'),
    setHeaderColor: anotar('setHeaderColor'), setBackgroundColor: anotar('setBackgroundColor'),
    setBottomBarColor: anotar('setBottomBarColor'), onEvent: anotar('onEvent'),
    openTelegramLink: anotar('openTelegramLink'),
    HapticFeedback: { selectionChanged: anotar('haptic') },
    BackButton: { show: anotar('back.show'), hide: anotar('back.hide'), onClick: anotar('back.onClick'), offClick: anotar('back.offClick') },
  } };`;

// Las fuentes se bajan desde Node y se entregan al navegador. Así funcionan
// también detrás de un proxy con CA propia (Node la toma de
// NODE_EXTRA_CA_CERTS; con proxy, correr con NODE_USE_ENV_PROXY=1). Si Node
// no llega, el navegador lo intenta solo y, en el peor caso, usa la fuente
// del sistema: la captura sale igual.
const cacheFuentes = new Map();
async function fuentes(ruta) {
  const url = ruta.request().url();
  try {
    if (!cacheFuentes.has(url)) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      cacheFuentes.set(url, { contentType: r.headers.get('content-type') ?? '', body: Buffer.from(await r.arrayBuffer()) });
    }
    await ruta.fulfill({ ...cacheFuentes.get(url), headers: { 'access-control-allow-origin': '*' } });
  } catch {
    await ruta.continue();
  }
}

export const CAPTURAS = [
  ['01-inicio-free', 'free', '#/inicio'],
  ['02-partidos', 'free', '#/partidos'],
  ['03-detalle-bloqueado', 'free', '#/partido/1105'],
  ['04-detalle-prediccion-free', 'free', '#/partido/1102'],
  ['05-detalle-analisis-individual', 'individual', '#/partido/1107'],
  ['06-detalle-pro', 'pro', '#/partido/1106'],
  ['07-historial', 'free', '#/historial'],
  ['08-pro', 'free', '#/pro'],
  ['09-mas-soporte', 'free', '#/mas'],
  ['10-inicio-pro', 'pro', '#/inicio'],
  ['11-partidos-vacio', 'vacio', '#/partidos'],
  ['12-error', 'error', '#/inicio'],
  ['13-telegram-pantalla-completa', 'free', '#/inicio', { insets: true, completa: false }],
];

async function principal() {
  const carpeta = resolve(process.argv[2] ?? join(MINIAPP, 'capturas'));
  mkdirSync(carpeta, { recursive: true });
  const { chromium } = await cargarPlaywright();
  const servidor = crearServidor();
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}/`;
  const navegador = await chromium.launch();
  try {
    for (const [nombre, escenario, hash, { insets = false, completa = true } = {}] of CAPTURAS) {
      const contexto = await navegador.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        locale: 'es-VE', reducedMotion: 'reduce',
      });
      await contexto.route('https://telegram.org/**', (ruta) =>
        ruta.fulfill({ contentType: 'text/javascript', body: sdkFalso({ insets }) }));
      await contexto.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fuentes);
      const pagina = await contexto.newPage();
      await pagina.goto(`${base}?demo=${escenario}${hash}`);
      await pagina.waitForSelector('#contenido:not([aria-busy]) > *');
      await pagina.waitForLoadState('networkidle');
      await pagina.evaluate(() => document.fonts.ready);
      // Página completa sin que la barra fija quede a mitad: se agranda la
      // ventana al alto del documento y la barra queda abajo, como en el móvil.
      if (completa) {
        const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
        await pagina.setViewportSize({ width: 390, height: Math.max(844, alto) });
        await pagina.waitForTimeout(100);
      }
      await pagina.screenshot({ path: join(carpeta, `${nombre}.jpg`), type: 'jpeg', quality: 82 });
      console.log(`  ${nombre}.jpg`);
      await contexto.close();
    }
  } finally {
    await navegador.close();
    servidor.close();
  }
  console.log(`OK: ${CAPTURAS.length} capturas en ${carpeta}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(e); process.exit(1); });
}
