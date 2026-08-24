// Genera el panel a partir de `disenio.dc.html`, el archivo que sale de
// claude.ai/design tal cual.
//
//   node salida/web/generar.mjs
//
// Escribe:
//   index.html        el panel: Inicio, Predicciones, Clasificación,
//                     Calidad, Cambios y las cuatro estáticas
//   serie-<id>.html   la ficha de cada una de las últimas series juzgadas,
//                     con URL propia y compartible
//
// No necesita credenciales: todo sale de datos/historico.json, versionado.
//
// EL DISEÑO NO SE TOCA. Si hay que cambiar un color o una caja, se cambia en
// claude.ai/design, se baja el archivo encima de disenio.dc.html y se vuelve
// a generar. Ver CLAUDE.md, "La interfaz web: un solo diseño, y es este".

import { readFile, writeFile, readdir, unlink, mkdir, copyFile } from 'node:fs/promises';
import { resumen } from './datos.mjs';
import { valores, C } from './valores.mjs';
import { proximasSeries, hayCredenciales } from './vivo.mjs';
import { renderizar, partesDelDisenio, envolverVista, esc } from './plantilla.mjs';

const AQUI = new URL('./', import.meta.url);
const RAIZ = new URL('../../', import.meta.url);
// Cuántas series lleva la tabla de Predicciones. Las fichas se generan para
// TODAS las que se enlazan — antes eran 60 fijas contra 150 filas, y 93 de
// cada 153 enlaces daban 404.
const FILAS_TABLA = 150;

// Marca real del repo. El diseño apunta a ./logo-monitor.png, que no está en
// este proyecto; el logotipo bueno vive en assets/.
async function logoIncrustado() {
  // El mark solo: el diseño ya pone "MONITOR eSPORTS" en texto al lado, y el
  // logotipo horizontal trae el nombre dentro — juntos se ve duplicado.
  for (const nombre of ['logo-mark.svg', 'logo-mark-simple.svg']) {
    try {
      const svg = await readFile(new URL(`assets/${nombre}`, RAIZ), 'utf8');
      return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
    } catch { /* siguiente */ }
  }
  return null;
}

// Lo que el diseño resuelve con `style-hover` y con su runtime, acá va como
// CSS de verdad. Es lo único que se agrega al estilo del diseño.
const ESTILO_EXTRA = `
  html { background: ${C.fondo}; }
  body { min-width: 1440px; }
  [data-accion] { cursor: pointer; }
  [data-accion]:hover { filter: brightness(1.18); }
  /* Las vistas y las filas traen \`display\` en el atributo style, que le gana
     a la regla \`[hidden]{display:none}\` del navegador. Sin el !important, el
     filtro de juego no ocultaba nada. */
  [data-vista][hidden], [data-fila][hidden] { display: none !important; }
  a { color: inherit; text-decoration: none; }
  /* Foco visible: el diseño no trae ninguno y sin esto el panel no se puede
     recorrer con el teclado. */
  [data-accion]:focus-visible { outline: 2px solid ${C.acento}; outline-offset: 2px; border-radius: 6px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

// Cada vista del diseño vive dentro de su propio <sc-if>. Acá se le pone el
// ancla que usa el script para mostrar una a la vez.
const VISTAS = [
  ['viewHome', 'home'], ['viewPreds', 'preds'], ['viewBoard', 'board'],
  ['viewCalidad', 'calidad'], ['viewNews', 'news'], ['viewMatch', 'match'],
  ['viewAbout', 'about'], ['viewFaq', 'faq'], ['viewTerms', 'terms'],
  ['viewContacto', 'contacto'],
];

function marcarVistas(plantilla) {
  let out = plantilla;
  for (const [clave, nombre] of VISTAS) out = envolverVista(out, clave, nombre);
  return out;
}

const CLIENTE = `
(function(){
  'use strict';
  var vistas = document.querySelectorAll('[data-vista]');
  function existe(v){
    for (var i=0;i<vistas.length;i++) if (vistas[i].getAttribute('data-vista')===v) return true;
    return false;
  }
  function ir(v){
    // En una ficha sólo existe la vista 'match'. Sin esta salida, pulsar
    // INICIO ocultaba TODAS las vistas y dejaba la página en blanco.
    if (!existe(v)) { location.href = 'index.html#' + v; return; }
    for (var i=0;i<vistas.length;i++) vistas[i].hidden = vistas[i].getAttribute('data-vista') !== v;
    try { history.replaceState(null,'','#'+v); } catch(e){}
    window.scrollTo(0,0);
    // el rail y la nav se repintan marcando el activo
    var botones = document.querySelectorAll('[data-accion^="ir:"]');
    for (var j=0;j<botones.length;j++){
      var destino = botones[j].getAttribute('data-accion').slice(3);
      botones[j].setAttribute('aria-current', destino===v ? 'page' : 'false');
    }
  }
  var filtro='todos', orden='cierra';
  function filas(){ return Array.prototype.slice.call(document.querySelectorAll('[data-fila]')); }

  // Las pastillas de juego y las cabeceras de orden tienen que mostrar cuál
  // está activa. El diseño trae la de «TODOS» encendida y ahí se quedaba,
  // aunque se pulsara otra.
  function marcarActivas(){
    var p = document.querySelectorAll('[data-accion^="filtro:"]');
    for (var i=0;i<p.length;i++){
      var on = p[i].getAttribute('data-accion').slice(7)===filtro;
      p[i].style.borderColor = on ? '#FF2638' : '#242933';
      p[i].style.color = on ? '#FF2638' : '#A7ADB8';
      p[i].style.background = on ? 'rgba(255,255,255,0.035)' : '#0D1015';
      p[i].style.boxShadow = on ? '0 0 12px #FF263840' : 'none';
      p[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    var o = document.querySelectorAll('[data-accion^="orden:"]');
    for (var j=0;j<o.length;j++){
      var act = o[j].getAttribute('data-accion').slice(6)===orden;
      o[j].style.color = act ? '#F2F4F7' : '#6F7784';
      o[j].setAttribute('aria-sort', act ? 'descending' : 'none');
    }
  }

  // Aviso para cuando el filtro no deja ninguna fila. Sin esto, pulsar CS2
  // (que todavía no tiene series) dejaba un hueco en blanco que parece rota.
  var vacio = null;
  function avisoVacio(padre, mostrar){
    if (!mostrar){ if (vacio) vacio.hidden = true; return; }
    if (!vacio){
      vacio = document.createElement('div');
      vacio.setAttribute('data-vacio','');
      vacio.style.cssText = 'padding:26px 18px;text-align:center;font-size:11.5px;letter-spacing:0.06em;color:#6F7784';
      vacio.textContent = 'TODAVÍA NO HAY SERIES DE ESTE JUEGO EN EL HISTÓRICO';
    }
    if (padre && vacio.parentNode !== padre) padre.appendChild(vacio);
    vacio.hidden = false;
  }

  function aplicar(){
    var f = filas();
    if (f.length === 0) return;
    var padre = f[0].parentNode;
    f.forEach(function(el){
      var ok = filtro==='todos' || el.getAttribute('data-juego')===filtro;
      el.hidden = !ok;
    });
    var visibles = f.filter(function(el){ return !el.hidden; });
    var clave = { edge:'data-edge', motor:'data-motor', cierra:'data-cierra' }[orden];
    visibles.sort(function(a,b){
      var va=a.getAttribute(clave), vb=b.getAttribute(clave);
      if (orden==='cierra') return String(vb).localeCompare(String(va));
      return parseFloat(vb)-parseFloat(va);
    });
    visibles.forEach(function(el){ padre.appendChild(el); });
    avisoVacio(padre, visibles.length===0);
    marcarActivas();
  }
  document.addEventListener('click', function(ev){
    var el = ev.target.closest('[data-accion]');
    if (!el) return;
    var a = el.getAttribute('data-accion');
    if (a.indexOf('ir:')===0){ ev.preventDefault(); ir(a.slice(3)); return; }
    if (a.indexOf('ficha:')===0){ location.href = 'serie-'+a.slice(6)+'.html'; return; }
    if (a.indexOf('filtro:')===0){ filtro = a.slice(7); aplicar(); return; }
    if (a.indexOf('orden:')===0){ orden = a.slice(6); aplicar(); return; }
  });
  document.addEventListener('keydown', function(ev){
    if (ev.key!=='Enter' && ev.key!==' ') return;
    var el = ev.target.closest('[data-accion]');
    if (el){ ev.preventDefault(); el.click(); }
  });
  // Al arrancar hay que mostrar una vista que EXISTA en esta página. En una
  // ficha la única es 'match': si acá se pidiera 'home', ir() rebotaría a
  // index.html y la ficha no se podría ni abrir.
  var inicial = (location.hash||'').slice(1);
  if (!existe(inicial)) inicial = existe('home') ? 'home' : (vistas[0] && vistas[0].getAttribute('data-vista'));
  if (inicial) ir(inicial);
})();
`;

function documento({ cuerpo, estiloDisenio, titulo, conCliente }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="Predicciones de esports calificadas contra el resultado real. No apuesta ni recomienda apostar.">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${estiloDisenio}${ESTILO_EXTRA}</style>
</head>
<body>
${cuerpo}
${conCliente ? `<script>${CLIENTE}</script>` : ''}
</body>
</html>
`;
}

// Dos rótulos del diseño están escritos a mano en el HTML y dicen algo que
// no es cierto con los datos que hay. No se toca `disenio.dc.html` —manda el
// diseño— así que se corrigen acá, en la salida:
//
//  · «MAYOR DESVÍO VS MERCADO»: Dota no tiene cuotas en ninguna tabla, así
//    que no hay casa contra la cual desviarse. Ese panel muestra las series
//    donde el motor más se alejó de la base ingenua, que es otra cosa.
//  · «PRÓXIMAS SERIES»: sólo es verdad si Supabase respondió. Sin
//    credenciales la rejilla cae a las últimas series ya juzgadas, y
//    llamarlas «próximas» es mentir en el título.
function rotulosHonestos(html, hayProximas) {
  let out = html
    .replace('MAYOR DESVÍO VS MERCADO', 'MAYOR DESVÍO VS LA BASE')
    .replace('Donde más se separa el motor de la casa.', 'Donde el motor más se alejó de la base ingenua.');
  if (!hayProximas) {
    out = out
      .replace('>PRÓXIMAS SERIES<', '>ÚLTIMAS SERIES JUZGADAS<')
      .replace('Análisis y probabilidades actualizadas', 'Sin próximas: Supabase no respondió');
  }
  return out;
}

// Las filas de la tabla llevan los datos que el filtro y el orden necesitan.
function anotarFilas(html, filas) {
  let i = 0;
  // OJO con el espacio: estiloATexto() escribe `grid-template-columns:minmax(`
  // sin espacio tras los dos puntos. La versión anterior de este patrón lo
  // exigía, no casaba con ninguna fila, y el filtro y el orden quedaban
  // muertos sin dar error.
  return html.replace(/<div data-accion="ficha:(\d+)" style="([^"]*grid-template-columns:\s*minmax\(0, 1\.7fr\)[^"]*)"/g, (m, id, estilo) => {
    const f = filas[i++];
    if (!f) return m;
    return `<div data-fila data-juego="${esc(f.juego)}" data-edge="${esc(f._edge)}" data-motor="${esc(f._pa)}" data-cierra="${esc(f.cierra)}" data-accion="ficha:${id}" style="${estilo}"`;
  });
}

// Arte propio para la banda de las tarjetas. Hoy no hay ninguno: el key art
// del diseño es de los publishers y este sitio se publica. Si algún día se
// consigue arte con derechos claros, se pone en assets/arte-dota.jpg y esto
// lo recoge solo.
async function arteIncrustado() {
  try {
    const img = await readFile(new URL('assets/arte-dota.jpg', RAIZ));
    return 'data:image/jpeg;base64,' + img.toString('base64');
  } catch {
    return null;
  }
}

// El artefacto de Pages es SÓLO salida/web, así que lo que se quede en la
// raíz del repo no llega al sitio. Se copian los iconos al generar en vez de
// versionar una segunda copia: el original manda y no hay dos verdades.
const ICONOS = ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

async function copiarIconos() {
  const destino = new URL('assets/', AQUI);
  await mkdir(destino, { recursive: true });
  let n = 0;
  for (const icono of ICONOS) {
    try {
      await copyFile(new URL(`assets/${icono}`, RAIZ), new URL(icono, destino));
      n += 1;
    } catch { /* si no está, el sitio funciona igual */ }
  }
  return n;
}

async function limpiarFichasViejas() {
  const archivos = await readdir(AQUI);
  await Promise.all(archivos.filter((a) => /^serie-\d+\.html$/.test(a)).map((a) => unlink(new URL(a, AQUI))));
}

async function main() {
  const archivo = await readFile(new URL('disenio.dc.html', AQUI), 'utf8');
  const { cuerpo: plantilla, estiloHelmet } = partesDelDisenio(archivo);

  const r = await resumen();
  const [logo, arte, proximas] = await Promise.all([logoIncrustado(), arteIncrustado(), proximasSeries()]);

  // El diseño enlaza ./logo-monitor.png, que no existe en este repo.
  const conLogo = marcarVistas(
    logo
      ? plantilla.replace(/src="\.\/logo-monitor\.png"/g, `src="${logo}"`)
      : plantilla.replace(/<img src="\.\/logo-monitor\.png"[^>]*>/g, '')
  );

  await limpiarFichasViejas();

  // --- panel ---
  const v = valores(r, { vista: 'home', arte, proximas, cuantasFilas: FILAS_TABLA });
  let cuerpo = rotulosHonestos(anotarFilas(renderizar(conLogo, v), v.tabla), v._hayProximas);
  await writeFile(new URL('index.html', AQUI), documento({
    cuerpo, estiloDisenio: estiloHelmet, titulo: 'Monitor eSports', conCliente: true,
  }));

  // --- fichas: una por CADA serie que el panel enlaza ---
  // Se sacan del propio HTML ya generado, así no hay forma de que la lista se
  // separe de los enlaces: si algo enlaza a una ficha, esa ficha existe.
  const enlazadas = new Set([...cuerpo.matchAll(/data-accion="ficha:([^"]+)"/g)].map((m) => m[1]));
  const recientes = r.series.filter((s) => enlazadas.has(String(s.seriesId)));
  for (const s of recientes) {
    const vf = valores(r, { vista: 'match', serie: s, arte, proximas });
    const cf = rotulosHonestos(renderizar(conLogo, vf), vf._hayProximas);
    await writeFile(new URL(`serie-${s.seriesId}.html`, AQUI), documento({
      cuerpo: cf, estiloDisenio: estiloHelmet, titulo: `${s.nombreA} vs ${s.nombreB} · Monitor eSports`, conCliente: true,
    }));
  }

  const iconos = await copiarIconos();

  const g = r.calidad.global;
  const sinFicha = [...enlazadas].filter((id) => !recientes.some((s) => String(s.seriesId) === id));
  console.log(`index.html + ${recientes.length} fichas · ${iconos} iconos`);
  if (sinFicha.length > 0) console.log(`  AVISO: ${sinFicha.length} enlaces sin ficha: ${sinFicha.slice(0, 3).join(', ')}`);
  console.log(`${g.cantidad} series · brier ${g.brier.toFixed(4)} vs base ${g.base.toFixed(4)} · acierto ${(g.acierto * 100).toFixed(2)} %`);
  console.log(`logotipo: ${logo ? 'assets/logo-mark.svg' : 'no encontrado'} · arte: ${arte ? 'assets/arte-dota.jpg' : 'degradado por juego'}`);
  if (!hayCredenciales()) console.log('próximas series: sin credenciales (corre con --env-file=.env si tienes uno)');
  else if (proximas && proximas.error) console.log(`próximas series: Supabase no respondió (${proximas.error})`);
  else console.log(`próximas series: ${proximas.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

export { documento, marcarVistas, anotarFilas, rotulosHonestos, CLIENTE };
