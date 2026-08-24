// Constructores puros de la SALA DE CONTROL (disenos/A-sala-de-control.html).
//
// Nada de red ni de disco acá: entran filas de eslo_predicciones y salen
// strings de HTML. Así se prueban con números verificables a mano y el
// generador (generar.mjs) sólo hace el transporte.
//
// Regla de la casa que aplica a esta pantalla: ninguna cifra se endulza.
// Si Valorant está peor que una moneda, sale peor que una moneda y del
// mismo tamaño que el resto.

export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

// La base ingenua del mundo eslo: el motor predice UNA clase por partida
// (gana A sí/no), así que adivinar siempre cuesta 0.25. Dota incluido --
// su base de 0.500 era de la era de tres clases en dota_*, no acá.
export const BASE_INGENUA = 0.25;

export const JUEGOS = [
  { id: 'dota2', etiqueta: 'DOTA 2', css: '--dota', logo: 'logos/logo-dota2.png' },
  { id: 'cs2', etiqueta: 'CS2', css: '--cs2', logo: 'logos/logo-cs2.jpg' },
  { id: 'lol', etiqueta: 'LOL', css: '--lol', logo: 'logos/logo-lol.png' },
  { id: 'valorant', etiqueta: 'VALORANT', css: '--val', logo: 'logos/logo-valorant.png' },
];

const ETIQUETA = new Map(JUEGOS.map((j) => [j.id, j.etiqueta]));

// Umbral del propio diseño: 55% o menos se lee "MUY PAREJO" y su anillo va
// en ámbar. Es presentación, no matemática: el número no cambia.
const UMBRAL_PAREJO = 0.55;

export function estadisticasPorJuego(filas) {
  const por = new Map();
  for (const f of filas) {
    let e = por.get(f.juego);
    if (!e) {
      e = { n: 0, juzgadas: 0, briers: [] };
      por.set(f.juego, e);
    }
    e.n += 1;
    if (f.resultado_real) {
      e.juzgadas += 1;
      const b = Number(f.brier);
      if (Number.isFinite(b)) e.briers.push(b);
    }
  }
  for (const e of por.values()) {
    const m = e.briers.length;
    if (m === 0) {
      e.brier = null;
      e.mejora = null;
      e.concluyente = false;
      continue;
    }
    e.brier = e.briers.reduce((s, x) => s + x, 0) / m;
    const sd = m > 1 ? Math.sqrt(e.briers.reduce((s, x) => s + (x - e.brier) ** 2, 0) / (m - 1)) : 0;
    const ee = m > 1 ? sd / Math.sqrt(m) : 0;
    e.mejora = e.brier / BASE_INGENUA - 1;
    // Concluyente = el intervalo del Brier NO contiene a la moneda.
    e.concluyente = m > 1 && !(BASE_INGENUA >= e.brier - 1.96 * ee && BASE_INGENUA <= e.brier + 1.96 * ee);
  }
  return por;
}

export function anilloConfianza(prob) {
  const p = Math.round(Number(prob) * 100);
  const color = Number(prob) > UMBRAL_PAREJO ? '#19E68C' : '#FFB000';
  return (
    `<svg class="conf" viewBox="0 0 36 36">` +
    `<circle cx="18" cy="18" r="15" fill="none" stroke="#242933" stroke-width="3.4"/>` +
    `<circle cx="18" cy="18" r="15" fill="none" stroke="${color}" stroke-width="3.4" stroke-dasharray="${p} 94" stroke-linecap="round" transform="rotate(-90 18 18)"/>` +
    `<text x="18" y="21.5" text-anchor="middle" fill="#F2F4F7" font-size="9.5" font-family="JetBrains Mono">${p}</text></svg>`
  );
}

// Una fila de la tabla. La fecha va ABSOLUTA (data-inicio ISO): el reloj del
// navegador la convierte a hora de Venezuela y decide el estado. El resultado,
// si ya se calificó, va en data-resultado + data-acierto: la fila nace
// TERMINADA, con el GANADOR en negrita, el marcador al lado y ✓/✗ según le
// hayamos atinado -- un "TERMINÓ" pelado no le dice a nadie qué pasó.
export function filaSerie(f, nombre) {
  const pa = Number(f.prob_a);
  const etiqueta = ETIQUETA.get(f.juego) ?? String(f.juego).toUpperCase();
  const nombreA = nombre(f.equipo_a);
  const nombreB = nombre(f.equipo_b);
  const tieneProb = Number.isFinite(pa);

  const decidido = f.resultado_real === 'ganaA' || f.resultado_real === 'ganaB';
  const ganoA = f.resultado_real === 'ganaA';
  // Con resultado, la negrita se la lleva el GANADOR (no el equipo A).
  const izq = decidido ? (ganoA ? nombreA : nombreB) : nombreA;
  const der = decidido ? (ganoA ? nombreB : nombreA) : nombreB;
  // Marcador orientado al ganador (los columnas vienen absolutas: A y B).
  const marcador =
    decidido && f.marcador_a != null && f.marcador_b != null
      ? ganoA
        ? `${f.marcador_a}–${f.marcador_b}`
        : `${f.marcador_b}–${f.marcador_a}`
      : null;
  const acerto = decidido ? (pa >= 0.5) === ganoA : null;

  const motor = tieneProb
    ? `<span class="prob">${(Math.max(pa, 1 - pa) * 100).toFixed(1)}%</span>${Math.max(pa, 1 - pa) <= UMBRAL_PAREJO ? ' <span class="parejo">MUY PAREJO</span>' : ''}`
    : '<span class="prob">—</span>';
  const confianza = tieneProb ? anilloConfianza(Math.max(pa, 1 - pa)) : '<span class="cuota mono">—</span>';

  const atributos = decidido ? ` data-resultado="${esc(f.resultado_real)}" data-acierto="${acerto ? 1 : 0}"` : '';

  return (
    `<tr data-inicio="${esc(f.inicio_programado)}" data-formato="${esc(f.formato)}"${atributos}>` +
    `<td class="mono"><span class="hora-txt">—</span><br><span class="estado"></span></td>` +
    `<td data-juego="${esc(etiqueta)}"><span class="chip" style="color:var(${cssDe(f.juego)}); border-color:#666">${esc(etiqueta)}</span></td>` +
    `<td class="equipos"><b>${esc(izq)}</b><span class="vs">VS</span><span>${esc(der)}</span>${marcador ? ` <span class="marcador mono">${esc(marcador)}</span>` : ''}</td>` +
    `<td class="mono">${esc(f.formato ?? '')}</td>` +
    `<td>${motor}</td>` +
    `<td>${confianza}</td>` +
    `<td class="cuota mono">—</td>` +
    '</tr>'
  );
}

function cssDe(juego) {
  return JUEGOS.find((j) => j.id === juego)?.css ?? '--tintaM';
}

const formatoPctMejora = (mejora) => {
  // Un cero con signo ("−0.0%") confunde más de lo que informa.
  if (Math.round(mejora * 1000) === 0) return '±0.0%';
  return `${mejora < 0 ? '−' : '+'}${Math.abs(mejora * 100).toFixed(1)}%`;
};

export function tarjetaJuego(cfg, stats, proximas) {
  const j = stats?.juzgadas ?? 0;
  const mejoraTxt = stats && stats.mejora != null ? formatoPctMejora(stats.mejora) : '—';
  return (
    `<div class="juego" data-filtro="${esc(cfg.etiqueta)}" style="--jc: var(${cfg.css})">` +
    `<div class="nom"><img src="${cfg.logo}" alt="${esc(cfg.etiqueta)}">${esc(cfg.etiqueta)}</div>` +
    `<div class="kpi"><span>mejora vs moneda</span><b>${mejoraTxt}</b></div>` +
    `<div class="kpi"><span>juzgadas</span><b>${j.toLocaleString('es-VE')}</b></div>` +
    `<div class="kpi"><span>próximas</span><b>${proximas.toLocaleString('es-VE')}</b></div>` +
    '</div>'
  );
}

export function tarjetaCalidad(cfg, stats) {
  const sinDatos = !stats || stats.brier == null;
  const big = sinDatos ? '—' : stats.brier.toFixed(3);
  const sub = sinDatos ? 'base 0.250 · sin series juzgadas aún' : `base 0.250 · n ${stats.juzgadas.toLocaleString('es-VE')}`;
  // Peor que la moneda NO va en verde. Ventaja negativa (o inexistente) =
  // ámbar, mismo criterio del diseño para las malas noticias.
  let badge = '';
  if (!sinDatos) {
    const mejor = stats.mejora <= 0;
    badge = `<span class="mejora ${mejor ? 'bien' : 'mal'}">${formatoPctMejora(stats.mejora)}</span>`;
  }
  const nc = sinDatos
    ? ''
    : stats.concluyente
      ? '<div class="nc" style="color:var(--ok)">CONCLUYENTE</div>'
      : '<div class="nc">NO CONCLUYENTE</div>';
  return (
    `<div class="cq" style="--jc: var(${cfg.css})">` +
    `<div class="nom">${esc(cfg.etiqueta)}</div><div class="big">${big}</div><div class="sub">${sub}</div>${badge}${nc}</div>`
  );
}

export function lineaJuicio(c, nombre) {
  const pa = Number(c.prob_a);
  const favA = pa >= 0.5;
  const ganoA = c.resultado_real === 'ganaA';
  const acerto = favA === ganoA;
  const favorito = favA ? nombre(c.equipo_a) : nombre(c.equipo_b);
  const ganador = ganoA ? nombre(c.equipo_a) : nombre(c.equipo_b);
  const probFav = Math.round(Math.abs(pa) * 100);
  const texto = acerto ? `<b>${esc(favorito)}</b> ${probFav}% — ganó` : `íbamos con <b>${esc(favorito)}</b> ${probFav}% — ganó ${esc(ganador)}`;
  const etiqueta = ETIQUETA.get(c.juego) ?? String(c.juego).toUpperCase();
  return (
    `<div class="juicio"><span class="marca2" style="color:var(${acerto ? '--ok' : '--acento'})">` +
    `${acerto ? '✓' : '✗'}</span><span>${texto}</span><small>${esc(etiqueta)} · ${esc(c.formato ?? '')}</small></div>`
  );
}

export function fuentesHtml({ bo3Ok = true, supabaseOk, discordOk, telegramOk }) {
  const fuente = (viva, nom, det, apagado = false) =>
    `<div class="fuente ${viva ? 'viva' : 'fria'}${apagado ? ' apagado' : ''}"><span class="dot"></span>` +
    `<div><div class="nom"${apagado ? ' style="color:var(--tintaM)"' : ''}>${nom}</div><div class="det">${det}</div></div></div>`;
  return (
    '<div class="fuentes">' +
    fuente(bo3Ok, 'bo3.gg', '4/4 juegos · historial y calendario') +
    fuente(supabaseOk, 'Supabase', supabaseOk ? 'predicciones y calificaciones al día' : 'sin respuesta al generar esta página') +
    fuente(discordOk, 'Discord', discordOk ? 'avisos activos' : 'sin webhook configurado') +
    fuente(telegramOk, 'Telegram', telegramOk ? 'avisos activos' : 'sin bot configurado') +
    fuente(false, 'OpenDota', 'solo histórico — sin ciclo en vivo', true) +
    '</div>'
  );
}

// Late = hubo actividad del ciclo hace poco. Quieto = el ciclo está callado
// (o la página se generó sin credenciales). Sin animación no hay mentira:
// un latido falso sería exactamente el número vendedor que prohíbe la casa.
export function botonVivo(vivo) {
  return `<div class="boton-vivo"><i${vivo ? ' class="late"' : ''}></i>${vivo ? 'EN VIVO' : 'CICLO EN PAUSA'}</div>`;
}
