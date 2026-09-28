// Piezas de interfaz. Funciones puras: reciben datos y devuelven HTML en
// texto, así se prueban en Node sin navegador. Todo texto que viene de datos
// pasa por esc().

import { JUEGOS } from '../datos/tipos.mjs';
import { dia, esc, fechaCorta, formatoSerie, hora, pct } from '../formato.mjs';
import { hrefPartido } from '../rutas.mjs';

export const ASSETS = Object.freeze({
  logo: 'assets/brand/logo-full.webp',
  simbolo: 'assets/brand/logo-symbol.webp',
  cargando: 'assets/brand/loading-mark.webp',
  heroInicio: 'assets/heroes/hero-home.webp',
  heroPartido: 'assets/heroes/match-header.webp',
  heroPro: 'assets/heroes/hero-pro.webp',
  heroHistorial: 'assets/heroes/hero-history.webp',
  vacioPartidos: 'assets/states/empty-matches.webp',
  vacioHistorial: 'assets/states/empty-history.webp',
  error: 'assets/states/error-state.webp',
  juego: (j) => `assets/games/${j}.svg`,
});

// Iconos de trazo, 24×24. SVG en línea: nada que descargar.
const TRAZOS = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  partidos: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  historial: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
  pro: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flecha: '<path d="m9 6 6 6-6 6"/>',
  soporte: '<path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19a3 3 0 0 1-3 3h-3"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  estrella: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  recargar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
};

export function icono(nombre, clase = 'icono') {
  return `<svg class="${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TRAZOS[nombre] ?? ''}</svg>`;
}

const TEXTO_INSIGNIA = {
  free: 'FREE', pro: 'PRO', vivo: 'EN VIVO', acierto: 'Acierto', fallo: 'Fallo',
  demo: 'DEMO', individual: 'Análisis', bloqueado: 'PRO',
};

/** FREE / PRO / EN VIVO / Acierto / Fallo: componentes CSS, no imágenes. */
export function insignia(tipo, texto = TEXTO_INSIGNIA[tipo]) {
  const candado = tipo === 'bloqueado' ? icono('candado', 'icono icono--xs') : '';
  return `<span class="insignia insignia--${tipo}">${candado}${esc(texto)}</span>`;
}

export function emblemaJuego(juego, tamano = 24) {
  return `<img class="emblema" src="${ASSETS.juego(juego)}" width="${tamano}" height="${tamano}" alt="" loading="lazy" decoding="async">`;
}

/** Monograma del equipo: fallback si no hay logo o el CDN falla. */
export function monograma(nombre) {
  const letras = String(nombre).trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="monograma" aria-hidden="true">${esc(letras)}</span>`;
}

function logoHttps(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Logo real del equipo encima del monograma; si falla, el fallback queda visible. */
export function avatarEquipo(equipo) {
  const logo = logoHttps(equipo?.logo);
  return '<span class="equipo__avatar">' + monograma(equipo?.nombre ?? '') +
    (logo ? `<img class="equipo__logo" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-logo-equipo>` : '') +
    '</span>';
}

/** Favorito según la misma convención del bot: prob_a >= 0.5 es el equipo A. */
export function favorito(p) {
  if (p.prob_a == null) return null;
  const a = p.prob_a >= 0.5;
  return { equipo: a ? p.equipo_a : p.equipo_b, prob: a ? p.prob_a : 1 - p.prob_a, lado: a ? 'a' : 'b' };
}

export function acertado(p) {
  return (p.prob_a >= 0.5) === (p.resultado_real === 'ganaA');
}

/** "Hoy · 7:19 AM": el día en texto, la hora en mono. */
export function cuando(iso, ahora) {
  return `<span class="tarjeta__hora">${esc(dia(iso, ahora))} · <span class="mono">${esc(hora(iso))}</span></span>`;
}

function cuandoPartido(p, ahora) {
  return p.estado === 'en_vivo' ? insignia('vivo') : cuando(p.inicio_programado, ahora);
}

function ladoTarjeta(p) {
  if (p.acceso === 'bloqueado') {
    return `<span class="tarjeta__lado">${insignia('bloqueado')}<span class="tarjeta__nota">Disponible con PRO</span></span>`;
  }
  const f = favorito(p);
  if (!f) return '<span class="tarjeta__lado"><span class="tarjeta__nota">Pendiente</span></span>';
  const marca = p.acceso === 'gratis' ? insignia('free') : p.acceso === 'individual' ? insignia('individual') : '';
  return `<span class="tarjeta__lado"><span class="cifra mono">${pct(f.prob)}</span>` +
    `<span class="tarjeta__nota">${esc(f.equipo.nombre)}</span>${marca}</span>`;
}

/** Tarjeta de partido de las listas. Todo el bloque es un enlace al detalle. */
export function tarjetaPartido(p, { ahora = Date.now() } = {}) {
  const etiqueta = `${p.equipo_a.nombre} contra ${p.equipo_b.nombre}, ${JUEGOS[p.juego]}, ` +
    (p.estado === 'en_vivo' ? 'en vivo' : fechaCorta(p.inicio_programado, ahora));
  return `<a class="tarjeta tarjeta--partido juego--${p.juego}" href="${hrefPartido(p.match_id)}" ` +
    `data-partido="${p.match_id}" aria-label="${esc(etiqueta)}">` +
    `<span class="tarjeta__cabeza">${emblemaJuego(p.juego, 20)}` +
    `<span class="tarjeta__juego">${esc(JUEGOS[p.juego])}</span>` +
    `<span class="tarjeta__formato mono">${esc(formatoSerie(p.formato))}</span>${cuandoPartido(p, ahora)}</span>` +
    '<span class="tarjeta__cuerpo"><span class="tarjeta__equipos">' +
    `<span class="equipo">${avatarEquipo(p.equipo_a)}<span class="equipo__nombre">${esc(p.equipo_a.nombre)}</span></span>` +
    `<span class="equipo">${avatarEquipo(p.equipo_b)}<span class="equipo__nombre">${esc(p.equipo_b.nombre)}</span></span>` +
    `</span>${ladoTarjeta(p)}</span></a>`;
}

/** Fila de historial: fallos y aciertos con el mismo peso visual. */
export function tarjetaResultado(p, { ahora = Date.now() } = {}) {
  const ganoA = p.resultado_real === 'ganaA';
  const f = favorito(p);
  const ok = acertado(p);
  const equipo = (e, gano) => `<span class="equipo${gano ? ' equipo--ganador' : ''}">${avatarEquipo(e)}` +
    `<span class="equipo__nombre">${esc(e.nombre)}</span>${gano ? '<span class="equipo__marca">Ganó</span>' : ''}</span>`;
  return `<a class="tarjeta tarjeta--resultado juego--${p.juego}" href="${hrefPartido(p.match_id)}" data-partido="${p.match_id}">` +
    `<span class="tarjeta__cabeza">${emblemaJuego(p.juego, 20)}<span class="tarjeta__juego">${esc(JUEGOS[p.juego])}</span>` +
    `<span class="tarjeta__formato mono">${esc(formatoSerie(p.formato))}</span>` +
    `${cuando(p.inicio_programado, ahora)}</span>` +
    `<span class="tarjeta__equipos">${equipo(p.equipo_a, ganoA)}${equipo(p.equipo_b, !ganoA)}</span>` +
    `<span class="tarjeta__pie">${insignia(ok ? 'acierto' : 'fallo')}` +
    `<span class="tarjeta__nota">Le dábamos <span class="mono">${pct(f.prob)}</span> a ${esc(f.equipo.nombre)}</span></span></a>`;
}

/** Barra de probabilidad de los dos lados. Las cifras son texto real. */
export function barraProbabilidad(p) {
  const a = p.prob_a, b = 1 - p.prob_a;
  const favA = a >= 0.5;
  return '<div class="probabilidad" role="group" aria-label="Probabilidad estimada de ganar la serie">' +
    '<div class="probabilidad__cifras">' +
    `<span class="probabilidad__lado${favA ? ' es-favorito' : ''}"><span class="probabilidad__equipo">${esc(p.equipo_a.nombre)}</span>` +
    `<span class="cifra cifra--grande mono">${pct(a)}</span></span>` +
    `<span class="probabilidad__lado probabilidad__lado--b${favA ? '' : ' es-favorito'}"><span class="probabilidad__equipo">${esc(p.equipo_b.nombre)}</span>` +
    `<span class="cifra cifra--grande mono">${pct(b)}</span></span></div>` +
    `<div class="probabilidad__barra" aria-hidden="true"><span class="probabilidad__a${favA ? ' es-favorito' : ''}" style="width:${(a * 100).toFixed(1)}%"></span>` +
    `<span class="probabilidad__b${favA ? '' : ' es-favorito'}" style="width:${(b * 100).toFixed(1)}%"></span></div></div>`;
}

/**
 * Fondo en línea: un url() relativo dentro de una variable CSS se resolvería
 * contra src/estilos.css y no contra la página, y la imagen no cargaría.
 */
export const fondo = (imagen) => `background-image:url('${imagen}')`;

export function heroe({ imagen, titulo, bajada = '', extra = '', clase = '' }) {
  return `<section class="heroe ${clase}" style="${fondo(imagen)}">` +
    `<div class="heroe__contenido"><h1 class="heroe__titulo">${titulo}</h1>` +
    (bajada ? `<p class="heroe__bajada">${bajada}</p>` : '') + `${extra}</div></section>`;
}

export function estadoVacio({ imagen, titulo, texto, accion = '' }) {
  return `<div class="estado" role="status"><img class="estado__arte" src="${imagen}" width="256" height="192" alt="">` +
    `<h2 class="estado__titulo">${esc(titulo)}</h2><p class="estado__texto">${esc(texto)}</p>${accion}</div>`;
}

export function estadoError(mensaje) {
  return `<div class="estado estado--error" role="alert"><img class="estado__arte" src="${ASSETS.error}" width="256" height="192" alt="">` +
    '<h2 class="estado__titulo">No pudimos cargar esto</h2>' +
    `<p class="estado__texto">${esc(mensaje || 'Revisa tu conexión e inténtalo otra vez.')}</p>` +
    `<button class="boton boton--secundario" type="button" data-accion="reintentar">${icono('recargar')}Reintentar</button></div>`;
}

export function estadoCargando() {
  return `<div class="estado estado--cargando" role="status" aria-live="polite">` +
    `<img class="cargando" src="${ASSETS.cargando}" width="40" height="40" alt="">` +
    '<p class="estado__texto">Cargando partidos…</p>' +
    '<div class="skeleton-lista" aria-hidden="true">' +
      '<span class="skeleton-card"><i></i><b></b><b></b></span>' +
      '<span class="skeleton-card"><i></i><b></b><b></b></span>' +
    '</div></div>';
}

export function dialogoCompra(producto, catalogo) {
  const esPro = producto === 'pro';
  const match = !esPro && /^partido:\d+$/.test(producto ?? '') ? Number(producto.split(':')[1]) : null;
  if (!esPro && !Number.isSafeInteger(match)) return '';
  const amount = esPro ? Number(catalogo?.pro_stars) : Number(catalogo?.analisis_stars);
  if (!Number.isSafeInteger(amount) || amount <= 0) return '';
  const recurrente = esPro && catalogo?.pro_recurrente !== false;
  const titulo = esPro ? 'Activar Monitor eSports PRO' : `Comprar análisis #${match}`;
  const precio = esPro
    ? `${amount} Stars / 30 días${recurrente ? ' · renovación automática' : ' · pago único'}`
    : `${amount} Stars · pago único`;
  const productoApi = esPro ? 'pro' : 'partido';
  return '<dialog class="compra-dialogo" data-compra-dialogo>' +
    '<div class="compra-dialogo__cuerpo">' +
      '<span class="insignia insignia--pro">Stars</span>' +
      `<h2 class="compra-dialogo__titulo">${esc(titulo)}</h2>` +
      `<p class="compra-dialogo__precio mono">${esc(precio)}</p>` +
      '<p class="compra-dialogo__texto">Compras acceso a análisis, predicciones y estadísticas. Son estimaciones, sin resultados ni ganancias garantizadas.</p>' +
      (recurrente ? '<p class="compra-dialogo__texto">Telegram cobrará automáticamente cada 30 días mientras la suscripción esté activa y tengas Stars. Puedes cancelar la renovación y conservar el período pagado.</p>' : '') +
      (!esPro ? '<p class="compra-dialogo__texto">El análisis individual da acceso únicamente a este partido y no se renueva.</p>' : '') +
      '<p class="compra-dialogo__texto">Ante cobros duplicados o problemas de acceso, contacta soporte con tu recibo.</p>' +
      '<div class="compra-dialogo__acciones">' +
        '<button class="boton boton--secundario" type="button" data-accion="cerrar-compra">Cancelar</button>' +
        `<button class="boton boton--pro" type="button" data-accion="confirmar-compra" data-producto="${productoApi}"${match ? ` data-match-id="${match}"` : ''}>Acepto los términos · Continuar</button>` +
      '</div>' +
    '</div></dialog>';
}

/** Chips de juego. `href(juego)` arma el enlace de cada filtro. */
export function filtrosJuego(activo, href) {
  const chip = (juego, texto) => `<a class="chip${activo === juego ? ' chip--activo' : ''}" href="${href(juego)}"` +
    `${activo === juego ? ' aria-current="true"' : ''}>${juego ? emblemaJuego(juego, 18) : ''}${esc(texto)}</a>`;
  return `<nav class="chips" aria-label="Filtrar por juego">${chip(null, 'Todos')}` +
    Object.entries(JUEGOS).map(([j, n]) => chip(j, n)).join('') + '</nav>';
}

export function seccion(titulo, contenido, { enlace = '', idTitulo = '', bajada = '' } = {}) {
  const id = idTitulo ? ` id="${idTitulo}"` : '';
  const h2 = `<h2 class="seccion__titulo"${id}>${esc(titulo)}</h2>`;
  // Sin bajada el marcado queda igual que siempre.
  const titular = bajada ? `<div>${h2}<p class="seccion__bajada">${esc(bajada)}</p></div>` : h2;
  return `<section class="seccion"${idTitulo ? ` aria-labelledby="${idTitulo}"` : ''}>` +
    `<header class="seccion__cabeza">${titular}${enlace}</header>${contenido}</section>`;
}

export function enlaceVerTodo(href, texto = 'Ver todo') {
  return `<a class="enlace" href="${href}">${esc(texto)}${icono('flecha', 'icono icono--xs')}</a>`;
}
