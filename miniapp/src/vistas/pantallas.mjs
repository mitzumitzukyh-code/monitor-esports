// Las seis pantallas de la V1. Cada una recibe lo que entregó la fuente y un
// contexto { ahora, catalogo, demo, escenario, ruta } y devuelve HTML.

import { JUEGOS } from '../datos/tipos.mjs';
import { ESCENARIOS } from '../datos/demo.mjs';
import { dia, esc, formatoSerieLargo, pct, ZONA_PUBLICA } from '../formato.mjs';
import { PERIODOS, hrefHistorial, hrefPartido, hrefPartidos } from '../rutas.mjs';
import {
  ASSETS, acertado, avatarEquipo, barraProbabilidad, cuando, emblemaJuego, fondo, enlaceVerTodo, estadoVacio, favorito, filtrosJuego,
  heroe, icono, insignia, seccion, tarjetaPartido, tarjetaResultado,
} from './componentes.mjs';

export const VERSION = 'v1 · UI';
export const LEMA = 'Predicciones y estadísticas para entender cada partido.';
export const LEMA_PRO = 'Más contexto para entender cada partido.';

const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es', { timeZone: 'Etc/GMT+4', dateStyle: 'long' });

function resumenAciertos(lista) {
  const aciertos = lista.filter(acertado).length;
  const fallos = lista.length - aciertos;
  // Mismo tamaño para fallos y aciertos. Sin rachas: sólo el conteo.
  return '<dl class="marcador">' +
    `<div class="marcador__celda"><dt>Aciertos</dt><dd class="mono">${aciertos}</dd></div>` +
    `<div class="marcador__celda"><dt>Fallos</dt><dd class="mono">${fallos}</dd></div>` +
    `<div class="marcador__celda"><dt>Predicciones</dt><dd class="mono">${lista.length}</dd></div></dl>`;
}

function estadoPlan(perfil) {
  return perfil.plan === 'pro'
    ? `<p class="plan">${insignia('pro')}<span>Activo hasta <strong>${esc(fechaLarga(perfil.pro_hasta))}</strong></span></p>`
    : `<p class="plan">${insignia('free')}<span>1 predicción diaria</span></p>`;
}

// ── Inicio ───────────────────────────────────────────────────────────────
export function pantallaInicio({ perfil, gratis, proximos, recientes }, { ahora, catalogo }) {
  const ctaFree = gratis ? hrefPartido(gratis.match_id) : hrefPartidos();
  const partes = [heroe({
    imagen: ASSETS.heroInicio,
    titulo: `<img class="heroe__logo" src="${ASSETS.logo}" width="400" height="125" alt="Monitor eSports">`,
    bajada: esc(LEMA),
    extra: estadoPlan(perfil) +
      '<p class="heroe__promesa">1 predicción gratis al día · historial visible · análisis PRO completo</p>' +
      '<div class="heroe__confianza" aria-label="Transparencia del servicio">' +
        '<span>Datos reales</span><span>Fallos visibles</span><span>Sin promesas de ganancias</span>' +
      '</div>' +
      '<div class="heroe__acciones">' +
        `<a class="boton boton--primario" href="${ctaFree}">${gratis ? 'Ver predicción FREE' : 'Ver partidos'}</a>` +
        '<a class="boton boton--secundario" href="#/pro">Ver PRO</a>' +
      '</div>',
    clase: 'heroe--inicio',
  })];

  if (perfil.plan === 'free') {
    partes.push(seccion('Tu predicción FREE de hoy', gratis
      ? tarjetaPartido(gratis, { ahora })
      : '<p class="aviso">Tu predicción FREE de hoy aún no está lista. Revisa más tarde.</p>'));
  }

  partes.push(seccion('Próximos partidos', proximos.length
    ? `<div class="lista">${proximos.map((p) => tarjetaPartido(p, { ahora })).join('')}</div>`
    : estadoVacio({ imagen: ASSETS.vacioPartidos, titulo: 'Sin partidos por ahora', texto: 'Cuando haya series programadas aparecerán aquí.' }),
  { enlace: proximos.length ? enlaceVerTodo(hrefPartidos()) : '' }));

  if (recientes.length) {
    partes.push(seccion('Resultados recientes', resumenAciertos(recientes) +
      `<p class="nota">Últimas ${recientes.length} series cerradas. Los fallos se publican igual que los aciertos.</p>`,
    { enlace: enlaceVerTodo(hrefHistorial(), 'Historial') }));
  }

  if (perfil.plan === 'free') {
    partes.push(`<a class="promo" href="#/pro"><span class="promo__texto"><strong>${esc(LEMA_PRO)}</strong>` +
      `<span>Desbloquea informes completos con PRO o elige un análisis individual cuando las compras estén activas · <span class="mono">${catalogo.pro_stars}</span> Stars / ${catalogo.pro_dias} días</span></span>` +
      `${icono('flecha')}</a>`);
  }
  return partes.join('');
}

// ── Partidos ─────────────────────────────────────────────────────────────
export function pantallaPartidos({ partidos }, { ahora, ruta }) {
  const { juego = null, periodo = 'proximos' } = ruta;
  const segmento = '<nav class="segmento" aria-label="Periodo">' + Object.entries(PERIODOS).map(([clave, texto]) =>
    `<a class="segmento__opcion${clave === periodo ? ' es-activo' : ''}" href="${hrefPartidos({ juego, periodo: clave })}"` +
    `${clave === periodo ? ' aria-current="true"' : ''}>${esc(texto)}</a>`).join('') + '</nav>';

  const grupos = new Map();
  for (const p of partidos) {
    const clave = p.estado === 'en_vivo' ? 'En vivo' : dia(p.inicio_programado, ahora);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  const lista = partidos.length
    ? [...grupos].map(([titulo, filas]) => `<h2 class="grupo">${esc(titulo)}</h2>` +
      `<div class="lista">${filas.map((p) => tarjetaPartido(p, { ahora })).join('')}</div>`).join('')
    : estadoVacio({
      imagen: ASSETS.vacioPartidos,
      titulo: 'No hay partidos para este filtro',
      texto: juego ? `No hay series de ${JUEGOS[juego]} en este periodo.` : 'No hay series programadas en este periodo.',
      accion: juego || periodo !== 'proximos' ? `<a class="boton boton--secundario" href="${hrefPartidos()}">Ver todos los próximos</a>` : '',
    });

  return '<header class="titular"><h1>Partidos</h1>' +
    `<p class="titular__bajada">Horario ${ZONA_PUBLICA}</p></header>` +
    segmento + filtrosJuego(juego, (j) => hrefPartidos({ juego: j, periodo })) + lista;
}

// ── Detalle de partido ───────────────────────────────────────────────────
/**
 * Una fila de "Forma reciente". El resumen sale de las últimas 5 (`ultimas`),
 * no de victorias/total. Si `total` cubre más series que las últimas 5, se
 * muestra aparte como conteo de esa ventana: no es una racha (el dato no
 * dice si fueron seguidas) y el diseño no publica rachas.
 */
export function filaForma(equipo, f) {
  const cronologico = [...f.ultimas].reverse(); // `ultimas` viene de la más reciente a la más vieja
  const v = f.ultimas.filter((x) => x === 'G').length;
  const d = f.ultimas.length - v;
  const resumen = f.ultimas.length
    ? `<span class="forma__resumen mono"><span class="forma__v">${v}V</span><span class="forma__sep">·</span><span class="forma__d">${d}D</span></span>`
    : '<span class="forma__resumen forma__resumen--vacio">Sin datos</span>';
  const etiqueta = `Últimas ${f.ultimas.length} series, de la más antigua a la más reciente: ` +
    cronologico.map((x) => (x === 'G' ? 'victoria' : 'derrota')).join(', ');
  const serie = f.ultimas.length
    ? `<span class="forma__serie" role="img" aria-label="${etiqueta}" title="De la más antigua a la más reciente">` +
      cronologico.map((x) => `<span class="forma__marca forma__marca--${x === 'G' ? 'v' : 'd'}"></span>`).join('') + '</span>'
    : '';
  const extra = f.total > f.ultimas.length
    ? `<span class="forma__extra">Últimas <span class="mono">${f.total}</span>: <span class="mono">${f.victorias}V · ${f.total - f.victorias}D</span></span>`
    : '';
  return `<div class="forma__fila"><span class="forma__equipo">${esc(equipo.nombre)}</span>${resumen}${serie}${extra}</div>`;
}

function panelForma(p) {
  const { formaA, formaB, h2h } = p.analisis;
  return seccion('Forma reciente', `<div class="panel forma">${filaForma(p.equipo_a, formaA)}${filaForma(p.equipo_b, formaB)}</div>`,
    { bajada: 'Últimas 5 series' }) +
    seccion('Enfrentamientos previos · H2H', `<div class="panel">${h2h.series
      ? `<p class="h2h"><span>${esc(p.equipo_a.nombre)}</span><span class="mono">${h2h.ganadasA}–${h2h.series - h2h.ganadasA}</span><span>${esc(p.equipo_b.nombre)}</span></p>` +
        `<p class="nota"><span class="mono">${h2h.series}</span> series registradas.</p>`
      : '<p class="nota">Sin enfrentamientos previos registrados.</p>'}</div>`);
}

function panelBloqueado(p, catalogo) {
  const compras = catalogo.compras_habilitadas;
  const aviso = compras ? '' : '<p class="nota nota--centro">Las compras desde la Mini App todavía no están activas.</p>';
  return `<section class="bloqueo" aria-labelledby="bloqueo-titulo">${icono('candado', 'icono icono--grande')}` +
    '<h2 id="bloqueo-titulo" class="bloqueo__titulo">Probabilidad y análisis completo</h2>' +
    '<p class="bloqueo__texto">Probabilidades estimadas, forma reciente, últimos resultados y H2H de este partido.</p>' +
    '<div class="bloqueo__opciones">' +
    `<button class="boton boton--pro" type="button" data-accion="comprar" data-producto="pro" ${compras ? '' : 'disabled aria-disabled="true"'}>` +
    `PRO · <span class="mono">${catalogo.pro_stars}</span> Stars / ${catalogo.pro_dias} días</button>` +
    `<button class="boton boton--secundario" type="button" data-accion="comprar" data-producto="partido:${p.match_id}" ${compras ? '' : 'disabled aria-disabled="true"'}>` +
    `Solo este partido · <span class="mono">${catalogo.analisis_stars}</span> Stars</button></div>${aviso}</section>`;
}

export function pantallaDetalle({ partido: p }, { ahora, catalogo, demo = false }) {
  if (!p) {
    return estadoVacio({
      imagen: ASSETS.vacioPartidos, titulo: 'Partido no encontrado',
      texto: 'Puede que ya no esté en la lista.', accion: `<a class="boton boton--secundario" href="${hrefPartidos()}">Ver partidos</a>`,
    });
  }
  const momento = p.estado === 'en_vivo' ? insignia('vivo')
    : `${cuando(p.inicio_programado, ahora)} · ${ZONA_PUBLICA}`;
  const cabeza = `<section class="ficha juego--${p.juego}" style="${fondo(ASSETS.heroPartido)}">` +
    `<p class="ficha__juego">${emblemaJuego(p.juego, 22)}<span>${esc(JUEGOS[p.juego])}</span>` +
    (p.competicion ? `<span class="ficha__competicion">${esc(p.competicion)}</span>` : '') + '</p>' +
    `<h1 class="ficha__equipos"><span class="equipo equipo--grande">${avatarEquipo(p.equipo_a)}<span>${esc(p.equipo_a.nombre)}</span></span>` +
    '<span class="ficha__vs">vs</span>' +
    `<span class="equipo equipo--grande">${avatarEquipo(p.equipo_b)}<span>${esc(p.equipo_b.nombre)}</span></span></h1>` +
    `<p class="ficha__cuando">${momento}</p><p class="ficha__formato">${esc(formatoSerieLargo(p.formato))}</p></section>`;

  const partes = [cabeza];
  if (p.acceso === 'bloqueado') {
    partes.push(panelBloqueado(p, catalogo));
  } else {
    const etiqueta = { gratis: insignia('free', 'Tu predicción FREE'), individual: insignia('individual', 'Análisis comprado'),
      pro: insignia('pro'), auditoria: insignia(acertado(p) ? 'acierto' : 'fallo') }[p.acceso] ?? '';
    const f = favorito(p);
    const resultado = p.estado === 'finalizado'
      ? `<p class="nota">Ganó <strong>${esc((p.resultado_real === 'ganaA' ? p.equipo_a : p.equipo_b).nombre)}</strong>. ` +
        `Le dábamos <span class="mono">${pct(f.prob)}</span> a ${esc(f.equipo.nombre)}.</p>`
      : '';
    partes.push(seccion('Probabilidad estimada', `<div class="panel">${etiqueta}${barraProbabilidad(p)}${resultado}` +
      (demo
        ? '<p class="nota nota--demo">Cifra de demostración: no sale del modelo ni corresponde a un partido real.</p></div>'
        : '<p class="nota">Estimación del modelo de rating con partidas reales. No es una garantía.</p></div>')));
    if (p.analisis) partes.push(panelForma(p));
    else if (p.acceso === 'gratis') {
      partes.push(`<a class="promo" href="#/pro"><span class="promo__texto"><strong>${esc(LEMA_PRO)}</strong>` +
        '<span>Forma reciente, últimos resultados y H2H con PRO o con el análisis de este partido.</span></span>' +
        `${icono('flecha')}</a>`);
    }
  }
  return partes.join('');
}

// ── Historial / Resultados ───────────────────────────────────────────────
export function pantallaHistorial({ partidos }, { ahora, ruta }) {
  const juego = ruta.juego ?? null;
  const cabeza = heroe({
    imagen: ASSETS.heroHistorial, titulo: 'Historial',
    bajada: 'Cada predicción cerrada, con aciertos y fallos. Nada se borra.', clase: 'heroe--compacto',
  });
  if (!partidos.length) {
    return cabeza + filtrosJuego(juego, hrefHistorial) + estadoVacio({
      imagen: ASSETS.vacioHistorial, titulo: 'Todavía no hay resultados',
      texto: juego ? `No hay series cerradas de ${JUEGOS[juego]}.` : 'Cuando se cierren las primeras series aparecerán aquí.',
    });
  }
  return cabeza + filtrosJuego(juego, hrefHistorial) + resumenAciertos(partidos) +
    '<p class="nota">Acierto: ganó el equipo al que le dábamos 50% o más.</p>' +
    `<div class="lista">${partidos.map((p) => tarjetaResultado(p, { ahora })).join('')}</div>`;
}

// ── PRO ──────────────────────────────────────────────────────────────────
export function pantallaPro({ perfil }, { catalogo }) {
  const compras = catalogo.compras_habilitadas;
  const inactivo = compras ? '' : 'disabled aria-disabled="true"';
  const lista = (items) => `<ul class="beneficios">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const actual = perfil.plan === 'pro'
    ? `<p class="plan plan--centro">${insignia('pro')}<span>Tu PRO está activo hasta <strong>${esc(fechaLarga(perfil.pro_hasta))}</strong></span></p>`
    : '';
  return heroe({
    imagen: ASSETS.heroPro, titulo: 'Monitor eSports <span class="dorado">PRO</span>',
    bajada: 'Probabilidades completas, alertas y contexto en un solo lugar.', extra: actual, clase: 'heroe--pro',
  }) +
    `<article class="plan-tarjeta plan-tarjeta--pro"><header><h2>PRO</h2><p class="precio"><span class="mono">${catalogo.pro_stars}</span> Stars / ${catalogo.pro_dias} días</p></header>` +
    lista(['Probabilidades completas de cada partido', 'Alertas antes del inicio', 'Mis partidos y favoritos', 'Resultados e historial agrupado', 'Resumen diario', 'Avisos si cambia la predicción']) +
    `<button class="boton boton--pro" type="button" data-accion="comprar" data-producto="pro" ${inactivo}>` +
    `${perfil.plan === 'pro' ? 'PRO activo' : 'Activar PRO'}</button></article>` +
    `<article class="plan-tarjeta"><header><h2>Análisis individual</h2><p class="precio"><span class="mono">${catalogo.analisis_stars}</span> Stars</p></header>` +
    '<p class="plan-tarjeta__intro">Compra solo el partido que te interesa.</p>' +
    lista(['Informe completo por partido', 'Probabilidades, contexto y estadísticas clave', 'Pago único, sin renovación']) +
    `<a class="boton boton--secundario" href="${hrefPartidos()}">Elegir partido</a></article>` +
    `<article class="plan-tarjeta"><header><h2>FREE</h2><p class="precio">Gratis</p></header>` +
    lista(['1 predicción diaria', 'Historial y resultados visibles']) + '</article>' +
    (compras ? '' : '<p class="nota nota--centro">Las compras desde la Mini App todavía no están activas.</p>') +
    '<p class="nota nota--centro">Son estimaciones, sin resultados ni ganancias garantizadas. PRO dura 30 días; ' +
    'puedes cancelar la renovación y conservar el período pagado.</p>';
}

// ── Más / soporte ────────────────────────────────────────────────────────
export function pantallaMas(_datos, { catalogo, demo, escenario }) {
  const soporte = catalogo.soporte.replace(/^@/, '');
  const fila = ({ icono: i, titulo, texto, accion, url }) =>
    `<button class="fila" type="button" data-accion="${accion}" data-url="${esc(url)}">${icono(i)}` +
    `<span class="fila__texto"><strong>${esc(titulo)}</strong><span>${esc(texto)}</span></span>${icono('flecha', 'icono icono--xs')}</button>`;
  const partes = [
    '<header class="titular"><h1>Más</h1></header>',
    seccion('Ayuda', '<div class="filas">' +
      fila({ icono: 'soporte', titulo: 'Soporte', texto: `${catalogo.soporte} · compras, recibos y acceso`, accion: 'telegram', url: `https://t.me/${soporte}` }) +
      fila({ icono: 'bot', titulo: 'Abrir el bot', texto: 'Comandos, avisos y compras', accion: 'telegram', url: `https://t.me/${catalogo.bot}` }) +
      '</div>'),
    seccion('Cómo calculamos', '<div class="panel texto">' +
      '<p>Los porcentajes salen de un modelo estadístico de rating (Elo / Glicko-2) calculado con partidas profesionales reales. ' +
      'Ningún modelo de lenguaje estima probabilidades.</p>' +
      '<p>Cada predicción se guarda antes del partido y después se compara con el resultado real. Los fallos se publican igual que los aciertos.</p>' +
      `<p>Horarios en ${ZONA_PUBLICA}. No son apuestas seguras ni ganancias garantizadas.</p></div>`),
  ];
  if (demo) {
    partes.push(seccion('Modo demostración', '<div class="panel">' +
      '<p class="nota">Equipos y cifras de esta versión son ficticios. Cambia el estado para revisar cada pantalla.</p>' +
      '<div class="escenarios" role="group" aria-label="Estado de la demo">' +
      Object.entries(ESCENARIOS).map(([clave, texto]) =>
        `<button class="chip${clave === escenario ? ' chip--activo' : ''}" type="button" data-accion="escenario" data-valor="${clave}"` +
        ` aria-pressed="${clave === escenario}">${esc(texto)}</button>`).join('') + '</div></div>'));
  }
  partes.push(`<p class="version mono">Monitor eSports · Mini App ${VERSION}</p>`);
  return partes.join('');
}

export const PANTALLA = Object.freeze({
  inicio: pantallaInicio,
  partidos: pantallaPartidos,
  detalle: pantallaDetalle,
  historial: pantallaHistorial,
  pro: pantallaPro,
  mas: pantallaMas,
});

/** Qué pedirle a la fuente para cada pantalla. */
export function cargarPantalla(fuente, ruta) {
  switch (ruta.pantalla) {
    case 'partidos': return fuente.partidos({ juego: ruta.juego, periodo: ruta.periodo });
    case 'detalle': return fuente.partido(ruta.id);
    case 'historial': return fuente.historial({ juego: ruta.juego });
    case 'pro': return fuente.perfil().then((perfil) => ({ perfil }));
    case 'mas': return Promise.resolve({});
    default: return fuente.inicio();
  }
}
