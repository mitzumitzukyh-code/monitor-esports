// Constructores puros de la SALA DE CONTROL (disenos/A-sala-de-control.html).
//
// Nada de red ni de disco acá: entran filas de eslo_predicciones y salen
// strings de HTML. Así se prueban con números verificables a mano y el
// generador (generar.mjs) sólo hace el transporte.
//
// Regla de la casa que aplica a esta pantalla: ninguna cifra se endulza.
// Si Valorant está peor que una moneda, sale peor que una moneda y del
// mismo tamaño que el resto.
//
// Regla nueva del diseño v2: NINGÚN porcentaje sale huérfano. Un "50.0%"
// al lado de "A vs B" no se puede leer -- no dice a quién se le da la
// ventaja. Cada fila dice el nombre del equipo debajo del número, y cuando
// no hay favorito (50/50 exacto) lo dice con todas sus letras.

export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

// La base ingenua del mundo eslo: el motor predice UNA clase por partida
// (gana A sí/no), así que adivinar siempre cuesta 0.25. Dota incluido --
// su base de 0.500 era de la era de tres clases en dota_*, no acá.
export const BASE_INGENUA = 0.25;

export const JUEGOS = [
  { id: 'dota2', etiqueta: 'DOTA 2', css: '--dota', chip: 'j-dota', logo: 'logos/logo-dota2.png' },
  { id: 'cs2', etiqueta: 'CS2', css: '--cs2', chip: 'j-cs2', logo: 'logos/logo-cs2.jpg' },
  { id: 'lol', etiqueta: 'LOL', css: '--lol', chip: 'j-lol', logo: 'logos/logo-lol.png' },
  { id: 'valorant', etiqueta: 'VALORANT', css: '--val', chip: 'j-val', logo: 'logos/logo-valorant.png' },
];

const ETIQUETA = new Map(JUEGOS.map((j) => [j.id, j.etiqueta]));

// Los logos de los JUEGOS viven en el repo y Pages los publica: esa es la
// única URL estable que tienen, y la que usan los avisos de Discord y
// Telegram (los escudos de EQUIPO van directo al CDN de bo3.gg).
export const BASE_PUBLICA = 'https://mitzumitzukyh-code.github.io/monitor-esports/';

export function logoDeJuegoUrl(juego) {
  const cfg = JUEGOS.find((j) => j.id === juego);
  return cfg ? BASE_PUBLICA + cfg.logo : null;
}

// Umbral del propio diseño: 55% o menos se lee "MUY PAREJO". Es
// presentación, no matemática: el número no cambia.
const UMBRAL_PAREJO = 0.55;

// Cuánto se estima que dura una serie según su formato, en minutos. Sirve
// para decidir si una serie que ya empezó sigue en curso o se pasó de la
// hora sin que nadie la calificara. Minutos redondos: es un estado de
// pantalla, no una medición.
//
// OJO: el <script> del diseño tiene su propia copia de esta tabla, porque
// allá el estado se recalcula con el reloj del visitante. Si una cambia,
// cambian las dos.
export const DURACION_MIN = { bo1: 30, bo2: 90, bo3: 150, bo5: 240 };

// En qué momento de su vida está una serie. El orden de la tabla sale de
// acá: primero lo que está pasando, después lo que viene, y de último lo
// que ya murió. Antes la tabla se ordenaba por hora de inicio a secas, así
// que el panel abría mostrando las vencidas sin calificar -- lo más viejo
// arriba, que es justo lo que a nadie le sirve.
export function faseDe(f, ahoraMs = Date.now()) {
  if (f.resultado_real) return 'juzgada';
  const ini = new Date(f.inicio_programado).getTime();
  if (!Number.isFinite(ini)) return 'proxima';
  if (ini > ahoraMs) return 'proxima';
  const dura = (DURACION_MIN[f.formato] ?? 150) * 60 * 1000;
  return ahoraMs <= ini + dura ? 'curso' : 'vencida';
}

// Orden de la tabla. Dentro de cada fase: las próximas por cercanía (la que
// arranca primero, arriba) y las vencidas y juzgadas al revés (lo último que
// pasó, arriba), que es como se lee un historial.
const PESO_FASE = { curso: 0, proxima: 1, vencida: 2, juzgada: 3 };

export function ordenarParaLaTabla(filas, ahoraMs = Date.now()) {
  return [...filas].sort((a, b) => {
    const fa = faseDe(a, ahoraMs);
    const fb = faseDe(b, ahoraMs);
    if (fa !== fb) return PESO_FASE[fa] - PESO_FASE[fb];
    const ta = new Date(a.inicio_programado).getTime() || 0;
    const tb = new Date(b.inicio_programado).getTime() || 0;
    return fa === 'proxima' || fa === 'curso' ? ta - tb : tb - ta;
  });
}

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

// De una predicción a "quién es el favorito y con cuánto". Un solo lugar:
// la fila, la cinta y los juicios leían esto a mano y no siempre igual --
// de ahí salía "íbamos con Butterfly 13%", que es un absurdo (el 13% era
// del OTRO). Con 50/50 exacto NO hay favorito y se dice.
export function favoritoDe(f) {
  // parseFloat y no Number: Number(null) es 0 (finito) y hacía que una
  // predicción sin probabilidad saliera como "100% para B".
  const pa = Number.parseFloat(f.prob_a);
  if (!Number.isFinite(pa)) return { hay: false, prob: null, lado: null };
  if (pa === 0.5) return { hay: false, prob: 0.5, lado: null };
  const ladoA = pa > 0.5;
  return { hay: true, prob: ladoA ? pa : 1 - pa, lado: ladoA ? 'A' : 'B', ladoA };
}

const pct1 = (p) => (p * 100).toFixed(1);

// Una fila de la tabla. La fecha va ABSOLUTA (data-inicio ISO): el reloj del
// navegador la convierte a hora de Venezuela y decide el estado de las que
// siguen abiertas. Las juzgadas nacen con su veredicto escrito en el HTML --
// no dependen de JavaScript para decir qué pasó.
//
// Negrita en la columna SERIE = el protagonista de la fila: el ganador si ya
// terminó, el favorito si todavía no. Y en MOTOR va el nombre del equipo al
// que pertenece el porcentaje, siempre.
export function filaSerie(f, nombre, cuotaDe = null, logoDe = null) {
  const fav = favoritoDe(f);
  const etiqueta = ETIQUETA.get(f.juego) ?? String(f.juego).toUpperCase();
  const cfg = JUEGOS.find((j) => j.id === f.juego);
  const nombreA = nombre(f.equipo_a);
  const nombreB = nombre(f.equipo_b);
  const nombreFav = fav.hay ? (fav.ladoA ? nombreA : nombreB) : null;

  const decidido = f.resultado_real === 'ganaA' || f.resultado_real === 'ganaB';
  const ganoA = f.resultado_real === 'ganaA';

  // Orden en pantalla: con resultado manda el ganador (y el marcador va
  // orientado a él); sin resultado se respeta el orden real A/B y la
  // negrita se la lleva el favorito, esté donde esté.
  let izq;
  let der;
  let negritaIzq = true;
  if (decidido) {
    izq = ganoA ? nombreA : nombreB;
    der = ganoA ? nombreB : nombreA;
  } else {
    izq = nombreA;
    der = nombreB;
    negritaIzq = fav.hay ? fav.ladoA : null; // null = 50/50, nadie en negrita
  }
  const equipo = (txt, fuerte) => (fuerte ? `<b>${esc(txt)}</b>` : `<span>${esc(txt)}</span>`);

  // Escudo de cada equipo, enlazado al CDN de bo3.gg (no incrustado: decenas
  // por página). alt="" porque el nombre va al lado -- no hay que anunciarlo
  // dos veces. Si el CDN falla, la imagen se elimina sola y queda el texto.
  const idIzq = decidido ? (ganoA ? f.equipo_a : f.equipo_b) : f.equipo_a;
  const idDer = decidido ? (ganoA ? f.equipo_b : f.equipo_a) : f.equipo_b;
  const escudo = (id) => {
    const url = logoDe ? logoDe(id) : null;
    return url
      ? `<img class="escudo" src="${esc(url)}" alt="" width="18" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
      : '';
  };

  const marcador =
    decidido && f.marcador_a != null && f.marcador_b != null
      ? ganoA
        ? `${f.marcador_a}–${f.marcador_b}`
        : `${f.marcador_b}–${f.marcador_a}`
      : null;

  const acerto = decidido && fav.hay ? (fav.ladoA === ganoA) : null;

  // MERCADO: la mejor cuota que ofreció el mercado por el FAVORITO (el mismo
  // equipo del porcentaje, para que la columna se pueda leer contra MOTOR).
  // Sin cuota capturada, sin favorito o cuota inservible: «—», nunca cero.
  const cu = cuotaDe ? cuotaDe(f) : null;
  const mercado = Number.isFinite(cu) && cu > 1 ? cu.toFixed(2) : '—';

  // Celda del motor: número + a quién se le da + barra. Los tres dicen lo
  // mismo, y ninguno se entiende solo.
  let motor;
  if (fav.prob == null) {
    motor = '<div class="motor-fila"><span class="prob mono">—</span></div>';
  } else {
    const p = pct1(fav.prob);
    const parejo = fav.prob <= UMBRAL_PAREJO ? ' <span class="parejo">MUY PAREJO</span>' : '';
    const linea = fav.hay
      ? `<p class="favorito"><span class="rel">${decidido ? 'íbamos con' : '→'}</span> <b>${esc(nombreFav)}</b></p>`
      : '<p class="favorito ninguno">sin favorito · moneda al aire</p>';
    const aria = fav.hay
      ? `El motor le ${decidido ? 'dio' : 'da'} ${p} por ciento a ${nombreFav}`
      : 'El motor no le da ventaja a ninguno de los dos: 50 por ciento';
    motor =
      `<div class="motor-fila"><span class="prob mono">${p}%</span>${parejo}</div>` +
      `${linea}` +
      `<div class="barra" role="img" aria-label="${esc(aria)}"><i style="width:${p}%"></i></div>`;
  }

  // Sin favorito (50/50 exacto) no hubo acierto ni fallo que cobrar: la fila
  // nace juzgada pero el veredicto es "· 50/50", no "✗ FALLÓ".
  const hora = decidido
    ? `<span class="hora-txt">—</span>${
        acerto == null
          ? '<span class="veredicto espera">· 50/50</span>'
          : `<span class="veredicto ${acerto ? 'ok' : 'no'}">${acerto ? '✓ Acertó' : '✗ Falló'}</span>`
      }`
    : '<span class="hora-txt">—</span><span class="estado"></span>';

  const atributos = decidido
    ? ` data-resultado="${esc(f.resultado_real)}"${acerto == null ? '' : ` data-acierto="${acerto ? 1 : 0}"`}`
    : '';

  return (
    `<tr class="${decidido ? 'juzgada' : 'abierta'}" data-grupo="${decidido ? 'juzgada' : 'abierta'}"` +
    ` data-juego="${esc(etiqueta)}" data-inicio="${esc(f.inicio_programado)}" data-formato="${esc(f.formato)}"${atributos}>` +
    `<th scope="row" class="mono celda-hora">${hora}</th>` +
    `<td><span class="chip ${cfg?.chip ?? ''}">${esc(etiqueta)}</span></td>` +
    // El .serie de adentro es el que se puede recortar: una celda de tabla
    // crece con su contenido pase lo que pase, así que sin este envoltorio
    // un nombre como "Gamespace Mediterranean College Esports" estiraba la
    // fila y rompía la altura única. Y es un <a>: cada serie tiene su perfil
    // en serie-<match_id>.html, con los números con los que se predijo.
    `<td class="equipos"><a class="serie" href="serie-${esc(f.match_id)}.html">${escudo(idIzq)}${equipo(izq, negritaIzq === true)}` +
    `<span class="vs">vs</span>${escudo(idDer)}${equipo(der, negritaIzq === false)}` +
    `${marcador ? ` <span class="marcador mono">${esc(marcador)}</span>` : ''}</a></td>` +
    `<td class="mono fmt">${esc(f.formato ?? '')}</td>` +
    `<td class="celda-motor">${motor}</td>` +
    `<td class="mercado mono">${mercado}</td>` +
    '</tr>'
  );
}

const formatoPctMejora = (mejora) => {
  // Un cero con signo ("−0.0%") confunde más de lo que informa.
  if (Math.round(mejora * 1000) === 0) return '±0.0%';
  return `${mejora < 0 ? '−' : '+'}${Math.abs(mejora * 100).toFixed(1)}%`;
};

// Rail de juegos: botones de verdad (no divs con click), porque filtran.
export function tarjetaJuego(cfg, stats, proximas) {
  const j = stats?.juzgadas ?? 0;
  const mejoraTxt = stats && stats.mejora != null ? formatoPctMejora(stats.mejora) : '—';
  return (
    `<button class="juego" type="button" aria-pressed="false" data-filtro="${esc(cfg.etiqueta)}" style="--jc:var(${cfg.css})">` +
    `<span class="nom"><img src="${cfg.logo}" alt="" width="20" height="20" loading="lazy" decoding="async">${esc(cfg.etiqueta)}</span>` +
    '<dl>' +
    `<dt>mejora vs moneda</dt><dd>${mejoraTxt}</dd>` +
    `<dt>juzgadas</dt><dd>${j.toLocaleString('es-VE')}</dd>` +
    `<dt>próximas (24 h)</dt><dd>${proximas.toLocaleString('es-VE')}</dd>` +
    '</dl></button>'
  );
}

export function tarjetaCalidad(cfg, stats) {
  const sinDatos = !stats || stats.brier == null;
  const big = sinDatos ? '—' : stats.brier.toFixed(3);
  const sub = sinDatos ? 'sin series juzgadas aún' : `n = ${stats.juzgadas.toLocaleString('es-VE')}`;
  // Peor que la moneda NO va en verde. Ventaja negativa (o inexistente) =
  // ámbar, mismo criterio del diseño para las malas noticias.
  let badge = '';
  if (!sinDatos) {
    const mejor = stats.mejora <= 0;
    badge = `<p><span class="mejora ${mejor ? 'bien' : 'mal'}">${formatoPctMejora(stats.mejora)}</span></p>`;
  }
  const nc = sinDatos ? '' : `<p class="nc${stats.concluyente ? ' si' : ''}">${stats.concluyente ? 'Concluyente' : 'No concluyente'}</p>`;
  return (
    `<article class="cq" style="--jc:var(${cfg.css})">` +
    `<p class="nom">${esc(cfg.etiqueta)}</p><p class="big mono">${big}</p><p class="sub">${sub}</p>${badge}${nc}</article>`
  );
}

// Últimos juicios. El porcentaje que sale es SIEMPRE el del equipo nombrado.
export function lineaJuicio(c, nombre) {
  const fav = favoritoDe(c);
  const ganoA = c.resultado_real === 'ganaA';
  const ganador = ganoA ? nombre(c.equipo_a) : nombre(c.equipo_b);
  const etiqueta = ETIQUETA.get(c.juego) ?? String(c.juego).toUpperCase();
  const pie = `<small>${esc(etiqueta)} · ${esc(c.formato ?? '')}</small>`;

  // Sin favorito (50/50 exacto) no hubo acierto ni fallo que cobrar.
  if (!fav.hay) {
    return (
      // Neutral, no ámbar: un 50/50 no es una advertencia, es un empate de
      // criterio. El ámbar quedó sólo para lo que salió peor de lo esperado.
      '<p class="juicio"><span class="marca" style="color:var(--tintaM)">·</span>' +
      `<span>50/50 — ganó <b>${esc(ganador)}</b></span>${pie}</p>`
    );
  }

  const favorito = fav.ladoA ? nombre(c.equipo_a) : nombre(c.equipo_b);
  const acerto = fav.ladoA === ganoA;
  const probFav = Math.round(fav.prob * 100);
  const texto = acerto
    ? `<b>${esc(favorito)}</b> ${probFav}% — ganó`
    : `íbamos con <b>${esc(favorito)}</b> ${probFav}% — ganó ${esc(ganador)}`;
  return (
    `<p class="juicio"><span class="marca" style="color:var(${acerto ? '--ok' : '--acento'})">` +
    `${acerto ? '✓' : '✗'}</span><span>${texto}</span>${pie}</p>`
  );
}

// Cinta de veredictos: lo que diferencia al producto (publicar los fallos)
// en el primer pantallazo. Entra de la más vieja a la más nueva.
export function cintaVeredictos(juzgadas, nombre) {
  const marcas = [];
  let aciertos = 0;
  for (const c of juzgadas) {
    const fav = favoritoDe(c);
    if (!fav.hay) continue; // 50/50 exacto: no hay a quién cobrarle
    const ganoA = c.resultado_real === 'ganaA';
    const acerto = fav.ladoA === ganoA;
    if (acerto) aciertos += 1;
    const favorito = fav.ladoA ? nombre(c.equipo_a) : nombre(c.equipo_b);
    const otro = fav.ladoA ? nombre(c.equipo_b) : nombre(c.equipo_a);
    const titulo = `${favorito} ${pct1(fav.prob)}% vs ${otro} — ${acerto ? 'acertó' : 'falló'}`;
    // El veredicto va DENTRO de la marca, en español: V de victoria, P de
    // pérdida. Una fila de cuadros mudos obliga a pasar el mouse para saber
    // qué es cada uno.
    marcas.push(`<i class="${acerto ? 'ok' : 'no'}" title="${esc(titulo)}">${acerto ? 'V' : 'P'}</i>`);
  }
  const n = marcas.length;
  const aria =
    n === 0
      ? 'todavía no hay predicciones juzgadas'
      : `${n} predicciones juzgadas: ${aciertos} aciertos y ${n - aciertos} fallos, de la más vieja a la más nueva`;
  return (
    `<p class="rotulo" id="t-cinta">${n === 0 ? 'TODAVÍA SIN JUZGAR' : `ÚLTIMAS ${n} JUZGADAS`}<b>Aciertos y fallos, sin filtrar</b></p>` +
    `<div class="marcas" role="img" aria-label="${esc(aria)}">${marcas.join('')}</div>` +
    `<p class="cuenta"><b>${n === 0 ? '—' : `${aciertos}/${n}`}</b>al favorito</p>`
  );
}

// Los contadores de las pestañas salen de las filas que de verdad se
// pintaron: si dicen 15 y hay 3, la pantalla miente.
export function pestanas({ abiertas, juzgadas }) {
  const b = (grupo, texto, n, sel) =>
    `<button class="pestana" type="button" role="tab" aria-selected="${sel}" data-grupo="${grupo}">${texto} <em>${n}</em></button>`;
  return (
    b('abierta', 'En vivo y próximas', abiertas, true) +
    b('juzgada', 'Juzgadas', juzgadas, false) +
    b('todas', 'Todas', abiertas + juzgadas, false)
  );
}

export function fuentesHtml({ bo3Ok = true, supabaseOk, discordOk, telegramOk }) {
  const fuente = (viva, nom, det) =>
    `<li class="fuente ${viva ? 'viva' : 'fria'}"><span class="dot" aria-hidden="true"></span>` +
    `<b>${nom}</b><span>${det}</span></li>`;
  return (
    '<ul class="fuentes">' +
    fuente(bo3Ok, 'bo3.gg', '4/4 juegos') +
    fuente(supabaseOk, 'Supabase', supabaseOk ? 'al día' : 'sin respuesta al generar') +
    fuente(discordOk, 'Discord', discordOk ? 'avisos activos' : 'sin webhook configurado') +
    fuente(telegramOk, 'Telegram', telegramOk ? 'avisos activos' : 'sin bot configurado') +
    fuente(false, 'OpenDota', 'solo histórico') +
    '</ul>'
  );
}

// Late = hubo actividad del ciclo hace poco. Quieto = el ciclo está callado
// (o la página se generó sin credenciales). Sin animación no hay mentira:
// un latido falso sería exactamente el número vendedor que prohíbe la casa.
export function botonVivo(vivo) {
  return (
    `<p class="vivo${vivo ? '' : ' pausa'}" role="status"><i${vivo ? ' class="late"' : ''} aria-hidden="true"></i>` +
    `${vivo ? 'EN VIVO' : 'CICLO EN PAUSA'}</p>`
  );
}
