// Constructores del PERFIL DE UNA SERIE (disenos/B-perfil-de-serie.html).
//
// Mismas reglas que sala.mjs: nada de red ni de disco, entran filas y salen
// strings de HTML, y todo se prueba con números verificables a mano.
//
// Lo que hace especial a esta pantalla: es la única que muestra POR QUÉ salió
// el número. eslo_predicciones guarda el estado del motor con el que se
// predijo -- rating_a, rd_a, rating_b, rd_b -- así que el porcentaje se puede
// volver a calcular acá mismo y enseñar los dos lado a lado. Un panel de
// predicciones que no puede hacer eso está pidiendo fe.
//
// Los gráficos son SVG escrito a mano, sin librerías: son dos formas simples
// y una dependencia de 200 KB para dibujar cuatro líneas no se gana el puesto.

import { esc, favoritoDe, BASE_INGENUA } from './sala.mjs';
import { probabilidadGanar } from '../../motor/glicko2.mjs';

export { esc };

const pct1 = (p) => (p * 100).toFixed(1);
const num = (x, d = 1) => Number(x).toFixed(d);

// ─────────────────────────────────────────────────────────────────────────
// 1 · La verificación: el número guardado contra el número recalculado.
// ─────────────────────────────────────────────────────────────────────────

// Devuelve null si la predicción no guardó el estado del motor (las primeras
// de la era Dota no lo hacían). Sin los cuatro números no hay nada que
// verificar y la sección no se dibuja -- no se inventa una cuenta.
export function verificacion(f) {
  // parseFloat y no Number, por lo mismo que en favoritoDe: Number(null) es 0
  // y un rating nulo se colaba como "0 ± 350", con una cuenta inventada.
  const r = [f.rating_a, f.rd_a, f.rating_b, f.rd_b].map((x) => Number.parseFloat(x));
  if (r.some((x) => !Number.isFinite(x))) return null;
  const [ratingA, rdA, ratingB, rdB] = r;
  const guardado = Number.parseFloat(f.prob_a);
  if (!Number.isFinite(guardado)) return null;

  const recalculado = probabilidadGanar({ rating: ratingA, rd: rdA }, { rating: ratingB, rd: rdB });
  // Doble tolerancia: la exacta (el número salió de acá) y la de pantalla
  // (redondeado a un decimal da lo mismo). Si ni siquiera la segunda pasa,
  // algo se reescribió y hay que decirlo, no taparlo.
  const exacta = Math.abs(recalculado - guardado) < 1e-12;
  const enPantalla = pct1(recalculado) === pct1(guardado);
  return { guardado, recalculado, exacta, enPantalla, ratingA, rdA, ratingB, rdB, motor: f.motor ?? '—' };
}

// De qué lado se cuenta. La base guarda prob_a (la de A) pero la pantalla
// habla del FAVORITO: sin voltearlo, el titular decía 69.4% y la verificación
// 30.6% justo debajo. Los dos números eran correctos y juntos parecían una
// contradicción.
export function ladoDelFavorito(v) {
  if (v.guardado === 0.5) return { empate: true, esA: null };
  return { empate: false, esA: v.guardado > 0.5 };
}

export function bloqueVerificacion(v, nombreA, nombreB) {
  if (!v) {
    return '<p class="sin-dato">Esta predicción es anterior a que se guardara el estado del motor, ' +
      'así que su número no se puede volver a calcular acá. Las nuevas sí.</p>';
  }
  const { empate, esA } = ladoDelFavorito(v);
  const voltea = (p) => (empate || esA ? p : 1 - p);
  const dueno = empate ? null : esA ? nombreA : nombreB;
  const sello = v.exacta
    ? '<span class="sello ok">cuadra exacto</span>'
    : v.enPantalla
      ? '<span class="sello aviso">cuadra al redondear</span>'
      : '<span class="sello mal">NO cuadra</span>';
  return (
    `<div class="verifica">` +
    `<div class="cuenta"><span class="rotulo">guardado en la base${dueno ? ` · para ${esc(dueno)}` : ''}</span>` +
    `<b class="mono">${pct1(voltea(v.guardado))}%</b></div>` +
    `<div class="igual" aria-hidden="true">=</div>` +
    `<div class="cuenta"><span class="rotulo">recalculado con ${esc(v.motor)}</span>` +
    `<b class="mono">${pct1(voltea(v.recalculado))}%</b></div>` +
    `${sello}</div>` +
    `<p class="pie">Entran los cuatro números que quedaron congelados el día de la predicción: ` +
    `<b>${esc(nombreA)}</b> ${num(v.ratingA, 0)} ± ${num(v.rdA, 0)} contra ` +
    `<b>${esc(nombreB)}</b> ${num(v.ratingB, 0)} ± ${num(v.rdB, 0)}. ` +
    `Nadie los puede tocar después: la fila no se reescribe nunca.</p>`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2 · Gráfico de ratings: dos intervalos sobre el mismo eje.
// ─────────────────────────────────────────────────────────────────────────

// El ancho del intervalo es rating ± rd. Cuando los dos se solapan mucho, el
// porcentaje se acerca a 50/50 -- y acá eso se VE, que es justo lo que un
// número solo no puede explicar.
export function graficoRatings(v, nombreA, nombreB) {
  if (!v) return '';
  const An = 520;
  const Al = 148;
  const izq = 12;
  const der = An - 12;

  const lo = Math.min(v.ratingA - v.rdA, v.ratingB - v.rdB);
  const hi = Math.max(v.ratingA + v.rdA, v.ratingB + v.rdB);
  const margen = Math.max(30, (hi - lo) * 0.08);
  const min = lo - margen;
  const max = hi + margen;
  const x = (r) => izq + ((r - min) / (max - min)) * (der - izq);

  const fila = (y, rating, rd, color, nombre) => {
    const x1 = x(rating - rd);
    const x2 = x(rating + rd);
    const xc = x(rating);
    return (
      `<line x1="${num(x1, 1)}" y1="${y}" x2="${num(x2, 1)}" y2="${y}" stroke="${color}" stroke-width="10" stroke-opacity=".22" stroke-linecap="round"/>` +
      `<circle cx="${num(xc, 1)}" cy="${y}" r="5.5" fill="${color}"/>` +
      `<text x="${izq}" y="${y - 14}" class="eje">${esc(nombre)}</text>` +
      `<text x="${der}" y="${y - 14}" text-anchor="end" class="cifra">${num(rating, 0)} ± ${num(rd, 0)}</text>`
    );
  };

  const { empate, esA } = ladoDelFavorito(v);
  const ladoA = { rating: v.ratingA, rd: v.rdA, nombre: nombreA };
  const ladoB = { rating: v.ratingB, rd: v.rdB, nombre: nombreB };
  const arriba = empate || esA ? ladoA : ladoB;
  const abajo = empate || esA ? ladoB : ladoA;

  const solape = Math.min(v.ratingA + v.rdA, v.ratingB + v.rdB) - Math.max(v.ratingA - v.rdA, v.ratingB - v.rdB);
  const nota = solape > 0
    ? `Los dos rangos se solapan en ${num(solape, 0)} puntos: por eso el motor no se juega mucho.`
    : `Los rangos no se tocan — hay ${num(-solape, 0)} puntos de aire entre uno y otro.`;

  return (
    '<div class="desliza">' +
    `<svg class="grafico" viewBox="0 0 ${An} ${Al}" role="img" ` +
    `aria-label="${esc(arriba.nombre)} ${num(arriba.rating, 0)} más menos ${num(arriba.rd, 0)} contra ${esc(abajo.nombre)} ${num(abajo.rating, 0)} más menos ${num(abajo.rd, 0)}">` +
    // Arriba y en rojo va el FAVORITO, no el equipo A: si el rojo fuera
    // siempre A, en la mitad de los perfiles el color de la marca estaría
    // señalando al que el motor NO escogió.
    fila(48, arriba.rating, arriba.rd, '#FF2638', arriba.nombre) +
    fila(112, abajo.rating, abajo.rd, '#A7ADB8', abajo.nombre) +
    `<text x="${izq}" y="${Al - 6}" class="eje">${num(min, 0)}</text>` +
    `<text x="${der}" y="${Al - 6}" text-anchor="end" class="eje">${num(max, 0)}</text>` +
    '</svg></div>' +
    `<p class="pie">${nota} El ancho de cada barra es la incertidumbre del rating (RD): ` +
    'mientras menos partidas tiene un equipo en la base, más ancha es.</p>'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · Mercado contra motor.
// ─────────────────────────────────────────────────────────────────────────

// Hay partidos con 300 capturas y el gráfico no necesita 300 puntos. Se toman
// N repartidos parejo, SIEMPRE con la primera y la última: son las que
// cuentan la historia (dónde abrió y dónde cerró).
export function muestrear(lista, n = 60) {
  if (lista.length <= n) return [...lista];
  const paso = (lista.length - 1) / (n - 1);
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(lista[Math.round(i * paso)]);
  return out;
}

// `capturas` viene ordenada por capturado_en. prob_a de eslo_cuotas ya está
// normalizada (sin el margen de la casa), así que es comparable con la del
// motor sin tocarla.
export function graficoMercado(capturas, f) {
  const fav = favoritoDe(f);
  if (!capturas || capturas.length < 2 || fav.prob == null) return '';

  // Todo se mira desde el lado del FAVORITO del motor, o las dos líneas
  // estarían midiendo cosas distintas.
  const puntos = muestrear(capturas).map((c) => ({
    t: new Date(c.capturado_en).getTime(),
    p: fav.ladoA === false ? 1 - Number(c.prob_a) : Number(c.prob_a),
    margen: Number(c.margen),
  })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p));
  if (puntos.length < 2) return '';

  const An = 520;
  const Al = 200;
  const izq = 44;
  const der = An - 12;
  const arr = 16;
  const aba = Al - 26;

  const t0 = puntos[0].t;
  const t1 = puntos[puntos.length - 1].t;
  const motorP = fav.prob;
  const todos = [...puntos.map((p) => p.p), motorP];
  const lo = Math.max(0, Math.min(...todos) - 0.04);
  const hi = Math.min(1, Math.max(...todos) + 0.04);

  const x = (t) => (t1 === t0 ? izq : izq + ((t - t0) / (t1 - t0)) * (der - izq));
  const y = (p) => aba - ((p - lo) / (hi - lo)) * (aba - arr);

  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${num(x(p.t), 1)} ${num(y(p.p), 1)}`).join(' ');
  const yMotor = num(y(motorP), 1);

  const abre = puntos[0].p;
  const cierra = puntos[puntos.length - 1].p;
  const margenMedio = puntos.reduce((s, p) => s + (Number.isFinite(p.margen) ? p.margen : 0), 0) / puntos.length;

  return (
    '<div class="desliza">' +
    `<svg class="grafico" viewBox="0 0 ${An} ${Al}" role="img" ` +
    `aria-label="El mercado fue de ${pct1(abre)} por ciento a ${pct1(cierra)} por ciento mientras el motor se quedó en ${pct1(motorP)}">` +
    `<line x1="${izq}" y1="${yMotor}" x2="${der}" y2="${yMotor}" stroke="#FF2638" stroke-width="1.5" stroke-dasharray="5 4"/>` +
    `<text x="${der}" y="${Number(yMotor) - 7}" text-anchor="end" class="cifra motor">motor ${pct1(motorP)}%</text>` +
    `<path d="${linea}" fill="none" stroke="#A7ADB8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${num(x(t1), 1)}" cy="${num(y(cierra), 1)}" r="4" fill="#F2F4F7"/>` +
    `<text x="${izq - 6}" y="${arr + 4}" text-anchor="end" class="eje">${pct1(hi)}%</text>` +
    `<text x="${izq - 6}" y="${aba}" text-anchor="end" class="eje">${pct1(lo)}%</text>` +
    `<text x="${izq}" y="${Al - 6}" class="eje">${capturas.length} capturas</text>` +
    `<text x="${der}" y="${Al - 6}" text-anchor="end" class="eje">cierre ${pct1(cierra)}%</text>` +
    '</svg></div>' +
    `<p class="pie">La línea gris es lo que pagaban las casas, ya sin su margen ` +
    `(${(margenMedio * 100).toFixed(1)} % en promedio). La roja punteada es el motor, que no se movió: ` +
    'su número quedó congelado antes de que empezara la serie y no se toca. ' +
    `El mercado abrió en ${pct1(abre)} % y cerró en ${pct1(cierra)} %.</p>`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · El veredicto.
// ─────────────────────────────────────────────────────────────────────────

export function bloqueVeredicto(f, statsJuego, nombreA, nombreB) {
  const decidido = f.resultado_real === 'ganaA' || f.resultado_real === 'ganaB';
  if (!decidido) return '';
  const ganoA = f.resultado_real === 'ganaA';
  const fav = favoritoDe(f);
  const ganador = ganoA ? nombreA : nombreB;
  const brier = Number(f.brier);
  const acerto = fav.hay ? fav.ladoA === ganoA : null;

  const marcador = f.marcador_a != null && f.marcador_b != null
    ? `${ganoA ? f.marcador_a : f.marcador_b}–${ganoA ? f.marcador_b : f.marcador_a}`
    : null;

  // Dónde cae este Brier: 0 es perfecto, 0.25 es la moneda, 1 es lo peor
  // posible. La barra usa esa escala completa para no maquillar nada.
  let barra = '';
  if (Number.isFinite(brier)) {
    const pos = Math.min(100, Math.max(0, brier * 100));
    const moneda = BASE_INGENUA * 100;
    barra =
      '<div class="brier">' +
      `<div class="via"><i style="left:${num(pos, 1)}%"></i>` +
      `<u style="left:${moneda}%" title="una moneda saca 0.250"></u></div>` +
      `<div class="brier-pies"><span>0 · perfecto</span><span>0.250 · moneda</span><span>1 · lo peor</span></div>` +
      '</div>';
  }

  const juicio = fav.hay
    ? acerto
      ? `El motor le dio la ventaja a <b>${esc(ganador)}</b> y ganó.`
      : `El motor le dio la ventaja a <b>${esc(fav.ladoA ? nombreA : nombreB)}</b> y ganó ${esc(ganador)}.`
    : `El motor no se jugó por ninguno. Ganó <b>${esc(ganador)}</b>.`;

  return (
    `<p class="resultado ${acerto === null ? 'espera' : acerto ? 'ok' : 'mal'}">` +
    `${acerto === null ? '·' : acerto ? '✓' : '✗'} ${juicio}` +
    `${marcador ? ` <span class="marcador mono">${esc(marcador)}</span>` : ''}</p>` +
    (Number.isFinite(brier)
      ? `<p class="cifra-grande mono">${brier.toFixed(4)}<span>puntaje de Brier de esta predicción</span></p>${barra}` +
        `<p class="pie">${textoDelBrier(brier, statsJuego)}</p>`
      : '<p class="sin-dato">Se calificó sin puntaje de Brier guardado.</p>')
  );
}

function textoDelBrier(brier, statsJuego) {
  const contraMoneda = brier < BASE_INGENUA
    ? `Mejor que la moneda, que saca ${BASE_INGENUA.toFixed(3)}.`
    : brier > BASE_INGENUA
      ? `Peor que la moneda, que saca ${BASE_INGENUA.toFixed(3)}.`
      : 'Exactamente lo mismo que una moneda.';
  if (!statsJuego || statsJuego.brier == null) return contraMoneda;
  const dif = brier - statsJuego.brier;
  const contraElJuego = Math.abs(dif) < 0.0005
    ? 'Justo en el promedio del juego.'
    : `${dif < 0 ? 'Mejor' : 'Peor'} que el promedio del juego (${statsJuego.brier.toFixed(3)} en ${statsJuego.juzgadas} series).`;
  return `${contraMoneda} ${contraElJuego}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · La forma de cada equipo.
// ─────────────────────────────────────────────────────────────────────────

// Las últimas series YA CALIFICADAS de un equipo, de la más nueva a la más
// vieja. Dice dos cosas a la vez: cómo le fue al equipo y cómo le fue al
// motor prediciéndolo.
export function historialDeEquipo(todas, teamId, { excluir = null, limite = 6 } = {}) {
  return todas
    .filter((f) => (f.equipo_a === teamId || f.equipo_b === teamId)
      && f.match_id !== excluir
      && (f.resultado_real === 'ganaA' || f.resultado_real === 'ganaB'))
    .sort((a, b) => new Date(b.inicio_programado) - new Date(a.inicio_programado))
    .slice(0, limite);
}

export function bloqueForma(historial, teamId, nombre, nombreDe) {
  if (historial.length === 0) {
    return `<div class="forma"><h3>${esc(nombre)}</h3><p class="sin-dato">Sin series calificadas en la base.</p></div>`;
  }
  const filas = historial.map((h) => {
    const ganoA = h.resultado_real === 'ganaA';
    const esA = h.equipo_a === teamId;
    const gano = esA === ganoA;
    const rival = nombreDe(esA ? h.equipo_b : h.equipo_a);
    const fav = favoritoDe(h);
    const suProb = fav.prob == null ? null : (fav.ladoA === esA ? fav.prob : 1 - fav.prob);
    const acerto = fav.hay ? fav.ladoA === ganoA : null;
    return (
      `<li class="${gano ? 'gano' : 'perdio'}">` +
      `<span class="gp mono">${gano ? 'V' : 'P'}</span>` +
      `<span class="rival">${esc(rival)}</span>` +
      `<span class="suya mono">${suProb == null ? '—' : `${pct1(suProb)}%`}</span>` +
      `<span class="tino mono ${acerto === null ? '' : acerto ? 'ok' : 'mal'}">` +
      `${acerto === null ? '·' : acerto ? '✓' : '✗'}</span></li>`
    );
  }).join('');
  const ganadas = historial.filter((h) => (h.equipo_a === teamId) === (h.resultado_real === 'ganaA')).length;
  return (
    `<div class="forma"><h3>${esc(nombre)}<small>${ganadas} de ${historial.length}</small></h3>` +
    `<ul>${filas}</ul>` +
    '<p class="pie">Columna del medio: lo que el motor le daba a este equipo. ' +
    'La última: si el motor le atinó a esa serie.</p></div>'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 6 · Encabezado y <head>.
// ─────────────────────────────────────────────────────────────────────────

const SITIO = 'https://mitzumitzukyh-code.github.io/monitor-esports';

// El <head> de cada perfil es distinto: título, descripción, canónica y og.
// Sin esto los 659 perfiles compartirían título y Google los trataría como
// copias del mismo.
export function cabeza(f, nombreA, nombreB) {
  const fav = favoritoDe(f);
  const quien = fav.hay ? (fav.ladoA ? nombreA : nombreB) : null;
  const resumen = fav.prob == null
    ? 'Sin probabilidad guardada.'
    : fav.hay
      ? `${pct1(fav.prob)}% para ${quien}.`
      : '50/50 exacto: el motor no se jugó por ninguno.';
  const titulo = `${nombreA} vs ${nombreB} · Monitor eSports`;
  const desc = `${resumen} La predicción quedó congelada antes de la serie y acá están los números con los que se hizo.`;
  return (
    `<title>${esc(titulo)}</title>\n` +
    `<meta name="description" content="${esc(desc)}">\n` +
    `<link rel="canonical" href="${SITIO}/serie-${f.match_id}.html">\n` +
    `<meta property="og:title" content="${esc(`${nombreA} vs ${nombreB}`)}">\n` +
    `<meta property="og:description" content="${esc(resumen)}">\n` +
    `<meta property="og:url" content="${SITIO}/serie-${f.match_id}.html">`
  );
}

// bo3.gg no publica la URL del stream en su API -- sólo dice si hay cobertura
// (live_coverage) con un código numérico de fuente. Lo honesto es mandar a la
// página de la partida en bo3.gg, que es donde SÍ están los reproductores.
// Sin slug no hay botón: no se inventa un link.
export function enlaceDirecto(slug, { enCurso = false } = {}) {
  if (!slug) return '';
  return (
    `<a class="directo${enCurso ? ' vivo' : ''}" href="https://bo3.gg/matches/${esc(slug)}" ` +
    'target="_blank" rel="noopener noreferrer">' +
    `${enCurso ? '<i class="late" aria-hidden="true"></i>Ver el directo' : 'Ver la serie en bo3.gg'}</a>`
  );
}

export function encabezado(f, { nombreA, nombreB, etiqueta, chip, logoDe = null, slug = null, fase = 'proxima', conReproductor = false }) {
  const fav = favoritoDe(f);
  const decidido = f.resultado_real === 'ganaA' || f.resultado_real === 'ganaB';
  const ganoA = f.resultado_real === 'ganaA';
  const escudo = (id) => {
    const url = logoDe ? logoDe(id) : null;
    return url ? `<img class="escudo" src="${esc(url)}" alt="" width="26" height="26" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  };

  // Igual que en la tabla: manda el ganador si ya terminó, el favorito si no.
  const aIzq = decidido ? ganoA : (fav.hay ? fav.ladoA : true);
  const idIzq = aIzq ? f.equipo_a : f.equipo_b;
  const idDer = aIzq ? f.equipo_b : f.equipo_a;
  const izq = aIzq ? nombreA : nombreB;
  const der = aIzq ? nombreB : nombreA;
  const fuerte = decidido || fav.hay;

  const estado = decidido
    ? `<span class="${(fav.hay ? fav.ladoA === ganoA : null) === null ? '' : fav.ladoA === ganoA ? 'curso' : 'viejo'}">` +
      `${fav.hay ? (fav.ladoA === ganoA ? '✓ Acertó' : '✗ Falló') : '· 50/50'}</span>`
    : `<span class="estado-vivo" data-formato="${esc(f.formato ?? '')}"></span>`;

  const quien = fav.hay
    ? `<span class="aquien">→ <b>${esc(fav.ladoA ? nombreA : nombreB)}</b></span>`
    : '<span class="aquien">sin favorito · moneda al aire</span>';
  const parejo = fav.prob != null && fav.prob <= 0.55 ? '<span class="parejo">MUY PAREJO</span>' : '';

  return (
    `<p class="donde"><span class="chip ${esc(chip)}">${esc(etiqueta)}</span>` +
    `<span>${esc(f.formato ?? '—')}</span>` +
    `${f.tier ? `<span>·</span><span>tier ${esc(f.tier)}</span>` : ''}</p>` +
    `<h1>${escudo(idIzq)}${fuerte ? `<b>${esc(izq)}</b>` : `<span>${esc(izq)}</span>`}` +
    `<span class="vs">vs</span>${escudo(idDer)}<span class="pierde">${esc(der)}</span></h1>` +
    `<p class="estado-linea"><span class="hora mono" data-inicio="${esc(f.inicio_programado)}">—</span>` +
    // Con el reproductor incrustado abajo, el botón sobra: dos cosas para lo
    // mismo, y encima medía 31px de alto -- por debajo de los 44 que hace
    // falta para tocar cómodo con el dedo.
    `${estado}${conReproductor ? '' : enlaceDirecto(slug, { enCurso: fase === 'curso' })}</p>` +
    `<p class="numero"><span class="gordo">${fav.prob == null ? '—' : `${pct1(fav.prob)}%`}</span>` +
    `${quien}${parejo}</p>`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 7 · El directo.
// ─────────────────────────────────────────────────────────────────────────

// El dominio donde vive el sitio. Twitch EXIGE ?parent=<dominio> o el
// reproductor se niega a cargar, y bo3.gg no lo incluye en su embed_url
// porque su propio front se lo agrega. localhost va también para poder
// probarlo con salida/web/servir.mjs sin tocar nada.
const DOMINIOS = ['mitzumitzukyh-code.github.io', 'localhost'];

export function urlDeEmbed(s) {
  if (!s?.embed) return null;
  if (s.plataforma !== 'twitch') return s.embed;
  const sep = s.embed.includes('?') ? '&' : '?';
  return `${s.embed}${sep}${DOMINIOS.map((d) => `parent=${d}`).join('&')}`;
}

const ETIQUETA_PLATAFORMA = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };

// Un reproductor y, debajo, los demás canales para cambiar de uno a otro.
// Los canales son enlaces de verdad al canal: sin JavaScript se abre el
// stream en su sitio, y con JavaScript se cambia el reproductor sin salir.
export function bloqueStream(streams, { enCurso = false } = {}) {
  const utiles = (streams ?? []).filter((s) => urlDeEmbed(s));
  if (utiles.length === 0) return '';

  const primero = utiles[0];
  const tarjeta = (s, i) => (
    `<a class="canal${i === 0 ? ' activo' : ''}" href="${esc(s.url ?? '#')}" ` +
    `data-embed="${esc(urlDeEmbed(s))}" target="_blank" rel="noopener noreferrer">` +
    `<span class="plat ${esc(s.plataforma)}">${esc(ETIQUETA_PLATAFORMA[s.plataforma] ?? s.plataforma)}</span>` +
    `<span class="nom">${esc(s.nombre || s.plataforma)}</span>` +
    `<span class="meta mono">${s.oficial ? 'oficial · ' : ''}` +
    `${s.espectadores > 0 ? `${s.espectadores.toLocaleString('es-VE')} viendo` : 'sin conteo'}` +
    `${s.idioma ? ` · ${esc(s.idioma)}` : ''}</span></a>`
  );

  return (
    `<div class="marco"><iframe id="reproductor" src="${esc(urlDeEmbed(primero))}" ` +
    `title="Transmisión de la serie" allowfullscreen loading="lazy" ` +
    'referrerpolicy="origin" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe></div>' +
    `<div class="canales">${utiles.map(tarjeta).join('')}</div>` +
    `<p class="pie">${enCurso ? 'La serie está en curso.' : 'El canal ya está al aire.'} ` +
    'La transmisión es de terceros: la trae bo3.gg y no pasa por acá. ' +
    'Los canales de arriba cambian el reproductor sin salir de la página.</p>'
  );
}
