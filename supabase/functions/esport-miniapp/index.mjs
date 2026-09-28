import { accesoDe, estadoDe, forma, h2h, politicaAcceso } from './acceso.mjs';
import { validarInitData } from './telegram-init.mjs';
import { VERSION_TERMINOS, configuracionCompra, facturaTelegram } from './compra.mjs';

const JUEGOS = new Set(['cs2', 'dota2', 'lol', 'valorant']);
const DISCIPLINAS = { cs2: 1, valorant: 2, lol: 3, dota2: 4 };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-telegram-init-data',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

function secretKey() {
  const moderno = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (moderno) {
    try {
      const parsed = JSON.parse(moderno);
      if (parsed?.default) return parsed.default;
    } catch { /* fallback legacy */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

function supabaseUrl() { return Deno.env.get('SUPABASE_URL') ?? ''; }

async function pedirJson(url, opciones = {}) {
  const res = await fetch(url, { ...opciones, signal: opciones.signal ?? AbortSignal.timeout(4000) });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return cuerpo;
}

function dbHeaders() {
  const key = secretKey();
  if (!key || !supabaseUrl()) throw new Error('Faltan credenciales Supabase');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function seleccionar(tabla, query) {
  return pedirJson(`${supabaseUrl()}/rest/v1/${tabla}${query}`, { headers: dbHeaders() });
}

async function rpc(nombre, body) {
  return pedirJson(`${supabaseUrl()}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: dbHeaders(), body: JSON.stringify(body),
  });
}

async function telegramApi(metodo, datos) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
    signal: AbortSignal.timeout(6000),
  });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok || cuerpo?.ok !== true) throw new Error(`Telegram ${metodo}: ${res.status}`);
  return cuerpo.result;
}

async function crearCompra(userId, solicitud) {
  const config = configuracionCompra();
  if (!config.habilitado) return { status: 409, error: 'compras_desactivadas' };

  const producto = solicitud?.producto;
  const matchId = producto === 'partido' ? Number(solicitud?.match_id) : null;
  if (!['pro', 'partido'].includes(producto)) return { status: 400, error: 'producto' };
  if (producto === 'partido' && (!Number.isSafeInteger(matchId) || matchId <= 0)) {
    return { status: 400, error: 'partido' };
  }
  if (solicitud?.aceptar_terminos !== true) return { status: 400, error: 'terminos' };

  await rpc('eslo_stars', {
    p_accion: 'terminos',
    p_datos: { user_id: userId, version: VERSION_TERMINOS },
  });

  const payload = `espro:${crypto.randomUUID()}`;
  const amount = producto === 'pro' ? config.pro : config.partido;
  const recurrente = producto === 'pro' && config.recurrente;
  const creada = await rpc('eslo_stars', {
    p_accion: 'crear',
    p_datos: {
      user_id: userId,
      payload,
      producto,
      match_id: matchId,
      amount,
      recurrente,
      terminos_version: VERSION_TERMINOS,
    },
  });
  if (creada?.error) {
    const status = ['pro_activo_o_pendiente', 'ya_comprado'].includes(creada.error) ? 409 : 400;
    return { status, error: creada.error };
  }

  const factura = facturaTelegram({ producto, amount, payload, matchId, recurrente });
  try {
    const invoiceUrl = await telegramApi('createInvoiceLink', factura);
    return {
      status: 200,
      data: {
        invoice_url: invoiceUrl,
        producto,
        amount,
        recurrente,
      },
    };
  } catch (e) {
    await rpc('eslo_stars', { p_accion: 'fallo_factura', p_datos: { user_id: userId, payload } }).catch(() => {});
    throw e;
  }
}

function diaUtcMenos4(ms) {
  const d = new Date(ms - 4 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 4 * 3600_000;
}

async function historialAnalisis(row) {
  const juego = encodeURIComponent(row.juego);
  const antes = encodeURIComponent(row.inicio_programado);
  const [a, b, ambos] = await Promise.all([
    seleccionar('eslo_predicciones',
      `?select=match_id,equipo_a,equipo_b,resultado_real,inicio_programado&juego=eq.${juego}&inicio_programado=lt.${antes}&resultado_real=in.(ganaA,ganaB)&or=(equipo_a.eq.${row.equipo_a},equipo_b.eq.${row.equipo_a})&order=inicio_programado.desc,match_id.desc&limit=8`),
    seleccionar('eslo_predicciones',
      `?select=match_id,equipo_a,equipo_b,resultado_real,inicio_programado&juego=eq.${juego}&inicio_programado=lt.${antes}&resultado_real=in.(ganaA,ganaB)&or=(equipo_a.eq.${row.equipo_b},equipo_b.eq.${row.equipo_b})&order=inicio_programado.desc,match_id.desc&limit=8`),
    seleccionar('eslo_predicciones',
      `?select=match_id,equipo_a,equipo_b,resultado_real,inicio_programado&juego=eq.${juego}&inicio_programado=lt.${antes}&resultado_real=in.(ganaA,ganaB)&or=(and(equipo_a.eq.${row.equipo_a},equipo_b.eq.${row.equipo_b}),and(equipo_a.eq.${row.equipo_b},equipo_b.eq.${row.equipo_a}))&order=inicio_programado.desc,match_id.desc&limit=50`),
  ]);
  return {
    formaA: forma(a, Number(row.equipo_a)),
    formaB: forma(b, Number(row.equipo_b)),
    h2h: h2h(ambos, Number(row.equipo_a), Number(row.equipo_b)),
  };
}

async function resolverEquipos(filas) {
  const mapa = new Map();
  const porJuego = new Map();
  for (const p of filas) {
    if (!JUEGOS.has(p.juego)) continue;
    if (!porJuego.has(p.juego)) porJuego.set(p.juego, new Set());
    porJuego.get(p.juego).add(Number(p.equipo_a));
    porJuego.get(p.juego).add(Number(p.equipo_b));
  }
  await Promise.all([...porJuego].map(async ([juego, ids]) => {
    try {
      const disciplina = DISCIPLINAS[juego];
      const lista = [...ids].filter((n) => Number.isSafeInteger(n) && n > 0);
      if (!disciplina || !lista.length) return;
      const url = 'https://api.bo3.gg/api/v1/teams?page[limit]=100' +
        `&filter[teams.discipline_id][eq]=${disciplina}&filter[teams.id][in]=${lista.join(',')}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'monitor-esports-miniapp/1.0' },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const t of data.results ?? []) {
        if (t?.id && t?.name) {
          const logo = typeof t.image_url === 'string' && /^https:\/\//i.test(t.image_url) ? t.image_url : null;
          mapa.set(`${juego}:${t.id}`, { id: Number(t.id), nombre: t.name, logo });
        }
      }
    } catch { /* los IDs siguen siendo una salida válida si bo3.gg falla */ }
  }));
  return mapa;
}

function equipo(mapa, juego, id) {
  return mapa.get(`${juego}:${id}`) ?? { id: Number(id), nombre: `Equipo #${id}`, logo: null };
}

const BO3_BASE = 'https://api.bo3.gg/api/v1';
const HOST_MINIAPP = 'monitor-esports.vercel.app';

function httpsUrl(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function youtubeId(...urls) {
  for (const valor of urls) {
    const u = httpsUrl(valor);
    if (!u) continue;
    let id = null;
    if (u.hostname === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] ?? null;
    if (u.hostname.endsWith('youtube.com')) {
      id = u.searchParams.get('v') ?? (u.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)/)?.[1] ?? null);
    }
    if (id && /^[A-Za-z0-9_-]{6,32}$/.test(id)) return id;
  }
  return null;
}

function twitchChannel(...urls) {
  for (const valor of urls) {
    const u = httpsUrl(valor);
    if (!u) continue;
    if (u.hostname === 'player.twitch.tv') {
      const canal = u.searchParams.get('channel');
      if (canal && /^[A-Za-z0-9_]{2,64}$/.test(canal)) return canal;
    }
    if (u.hostname === 'twitch.tv' || u.hostname === 'www.twitch.tv') {
      const canal = u.pathname.split('/').filter(Boolean)[0] ?? null;
      if (canal && !['videos','directory','downloads'].includes(canal) && /^[A-Za-z0-9_]{2,64}$/.test(canal)) return canal;
    }
  }
  return null;
}

function streamSeguro(stream) {
  if (!stream || stream.blocked || stream.official !== true) return null;
  const raw = httpsUrl(stream.raw_url)?.toString() ?? null;
  const embedCrudo = httpsUrl(stream.embed_url)?.toString() ?? null;
  const plataforma = Number(stream.platform);

  if (plataforma === 2) {
    const id = youtubeId(embedCrudo, raw);
    if (!id) return null;
    return {
      plataforma: 'youtube',
      embed_url: \`https://www.youtube-nocookie.com/embed/\${id}?rel=0&playsinline=1\`,
      url: raw,
      idioma: typeof stream.language === 'string' ? stream.language : null,
      espectadores: Number.isFinite(Number(stream.viewers_number)) ? Number(stream.viewers_number) : 0,
      oficial: true,
    };
  }

  if (plataforma === 1) {
    const canal = twitchChannel(embedCrudo, raw);
    if (!canal) return null;
    return {
      plataforma: 'twitch',
      embed_url: \`https://player.twitch.tv/?channel=\${encodeURIComponent(canal)}&parent=\${HOST_MINIAPP}&autoplay=false\`,
      url: raw,
      idioma: typeof stream.language === 'string' ? stream.language : null,
      espectadores: Number.isFinite(Number(stream.viewers_number)) ? Number(stream.viewers_number) : 0,
      oficial: true,
    };
  }

  return null;
}

async function metadatosPartidasBo3(filas) {
  const mapa = new Map();
  const porJuego = new Map();
  for (const row of filas) {
    if (!JUEGOS.has(row.juego)) continue;
    if (!porJuego.has(row.juego)) porJuego.set(row.juego, []);
    porJuego.get(row.juego).push(Number(row.match_id));
  }

  await Promise.all([...porJuego].map(async ([juego, ids]) => {
    const disciplina = DISCIPLINAS[juego];
    if (!disciplina) return;
    try {
      const unicos = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 50);
      if (!unicos.length) return;
      const url = BO3_BASE + '/matches?page[limit]=50' +
        \`&filter[matches.discipline_id][eq]=\${disciplina}\` +
        \`&filter[matches.id][in]=\${unicos.join(',')}\`;
      const data = await pedirJson(url, { signal: AbortSignal.timeout(2500) });
      for (const m of data?.results ?? []) {
        if (m?.id && m?.slug) mapa.set(Number(m.id), {
          slug: m.slug,
          cobertura: Boolean(m.live_coverage),
          status: m.status ?? null,
        });
      }
    } catch {
      // La portada no falla si la fuente de streams está temporalmente caída.
    }
  }));
  return mapa;
}

async function directosEnVivo(filas, { ahora = Date.now() } = {}) {
  const candidatas = filas
    .filter((row) => {
      const inicio = Date.parse(row.inicio_programado);
      return Number.isFinite(inicio) && inicio <= ahora && inicio >= ahora - 8 * 3600_000 && !row.resultado_real;
    })
    .sort((a, b) => Date.parse(b.inicio_programado) - Date.parse(a.inicio_programado));

  if (!candidatas.length) return [];

  const meta = await metadatosPartidasBo3(candidatas);
  const conCobertura = candidatas
    .filter((row) => {
      const m = meta.get(Number(row.match_id));
      return m?.cobertura && (!m.status || m.status === 'live' || m.status === 'ongoing');
    })
    .slice(0, 6);

  if (!conCobertura.length) return [];

  const encontrados = await Promise.all(conCobertura.map(async (row) => {
    const m = meta.get(Number(row.match_id));
    try {
      const detalle = await pedirJson(\`\${BO3_BASE}/matches/\${encodeURIComponent(m.slug)}\`, {
        signal: AbortSignal.timeout(2500),
      });
      const streams = (detalle?.streams ?? [])
        .map(streamSeguro)
        .filter(Boolean)
        .sort((a, b) => b.espectadores - a.espectadores);
      return streams.length ? { row, stream: streams[0] } : null;
    } catch {
      return null;
    }
  }));

  return encontrados.filter(Boolean).slice(0, 2).map(({ row, stream }) => ({
    match_id: Number(row.match_id),
    juego: row.juego,
    inicio_programado: row.inicio_programado,
    plataforma: stream.plataforma,
    embed_url: stream.embed_url,
    url: stream.url,
    idioma: stream.idioma,
    oficial: true,
  }));
}

async function normalizarFilas(filas, perfil, { incluirAnalisisId = null, ahora = Date.now() } = {}) {
  const equipos = await resolverEquipos(filas);
  const salida = [];
  for (const row of filas) {
    const politica = politicaAcceso(row, perfil);
    const acceso = politica.acceso;
    const puedeAnalisis = politica.analisisPermitido && Number(row.match_id) === incluirAnalisisId;
    const analisis = puedeAnalisis ? await historialAnalisis(row) : null;
    salida.push({
      match_id: Number(row.match_id),
      juego: row.juego,
      equipo_a: equipo(equipos, row.juego, row.equipo_a),
      equipo_b: equipo(equipos, row.juego, row.equipo_b),
      inicio_programado: row.inicio_programado,
      formato: row.formato || 'bo3',
      estado: estadoDe(row, ahora),
      prob_a: politica.prob_a,
      acceso,
      analisis,
      ...(row.resultado_real ? { resultado_real: row.resultado_real } : {}),
    });
  }
  return salida;
}

async function perfilDe(userId) {
  const [estado, gratis, ordenes, pagos] = await Promise.all([
    rpc('eslo_stars', { p_accion: 'estado', p_datos: { user_id: userId } }),
    rpc('eslo_stars_engagement', { p_accion: 'gratis', p_datos: { user_id: userId } }),
    seleccionar('eslo_stars_ordenes',
      `?select=payload,match_id,pagada_en&user_id=eq.${userId}&producto=eq.partido&pagada_en=not.is.null&order=pagada_en.desc&limit=50`),
    seleccionar('eslo_stars_pagos',
      `?select=payload&user_id=eq.${userId}&reembolsado_en=is.null&limit=100`),
  ]);
  const activos = new Set(pagos.map((p) => p.payload));
  const individuales = [...new Set(ordenes.filter((o) => activos.has(o.payload))
    .map((o) => Number(o.match_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  return {
    plan: estado?.premium ? 'pro' : 'free',
    pro_hasta: estado?.premium ? estado.expira_en ?? null : null,
    gratis_hoy: gratis?.ok ? Number(gratis.match_id) : null,
    analisis_comprados: individuales,
  };
}

async function abiertas({ juego = null, periodo = 'proximos', ahora = Date.now() } = {}) {
  if (juego && !JUEGOS.has(juego)) throw new Error('juego inválido');
  if (!['hoy', 'manana', 'proximos'].includes(periodo)) throw new Error('periodo inválido');
  let desde = new Date(ahora - 6 * 3600_000).toISOString();
  let hasta = null;
  if (periodo !== 'proximos') {
    const hoy = diaUtcMenos4(ahora);
    const inicio = periodo === 'hoy' ? hoy : hoy + 86400_000;
    desde = new Date(Math.max(ahora - 6 * 3600_000, inicio)).toISOString();
    hasta = new Date(inicio + 86400_000).toISOString();
  }
  const q = '?select=match_id,juego,equipo_a,equipo_b,inicio_programado,formato,prob_a,resultado_real' +
    `&inicio_programado=gte.${encodeURIComponent(desde)}&resultado_real=is.null` +
    (hasta ? `&inicio_programado=lt.${encodeURIComponent(hasta)}` : '') +
    (juego ? `&juego=eq.${juego}` : '') +
    '&order=inicio_programado.asc,match_id.asc&limit=50';
  return seleccionar('eslo_predicciones', q);
}

async function cerradas({ juego = null, limite = 50 } = {}) {
  if (juego && !JUEGOS.has(juego)) throw new Error('juego inválido');
  return seleccionar('eslo_predicciones',
    '?select=match_id,juego,equipo_a,equipo_b,inicio_programado,formato,prob_a,resultado_real' +
    '&resultado_real=in.(ganaA,ganaB)' + (juego ? `&juego=eq.${juego}` : '') +
    `&order=inicio_programado.desc,match_id.desc&limit=${limite}`);
}

async function atender(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'POST'].includes(req.method)) return json({ ok: false, error: 'metodo' }, 405);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const maxAge = Number(Deno.env.get('TELEGRAM_MINIAPP_MAX_AGE_SECONDS') ?? 3600);
  let sesion;
  try {
    sesion = await validarInitData(req.headers.get('x-telegram-init-data') ?? '', {
      botToken: token,
      maxAgeSeconds: Number.isSafeInteger(maxAge) ? maxAge : 3600,
    });
  } catch {
    return json({ ok: false, error: 'telegram_auth' }, 401);
  }

  const limite = await rpc('eslo_stars_rate_limit', { p_user_id: sesion.user.id });
  if (!limite?.ok) return json({ ok: false, error: 'limite' }, 429, {
    'Retry-After': String(limite?.reintentar_en ?? 60),
  });

  const url = new URL(req.url);
  const recurso = url.searchParams.get('recurso') ?? '';

  if (req.method === 'POST') {
    if (recurso !== 'compra') return json({ ok: false, error: 'recurso' }, 400);
    if (Number(req.headers.get('content-length')) > 4096) return json({ ok: false, error: 'cuerpo' }, 413);
    const cuerpo = await req.json().catch(() => null);
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      return json({ ok: false, error: 'cuerpo' }, 400);
    }
    const compra = await crearCompra(sesion.user.id, cuerpo);
    if (compra.status !== 200) return json({ ok: false, error: compra.error }, compra.status);
    return json({ ok: true, data: compra.data });
  }

  // El catálogo no necesita tocar perfil, pagos ni asignar la FREE diaria.
  if (recurso === 'catalogo') {
    const compra = configuracionCompra();
    return json({ ok: true, data: {
      pro_stars: compra.pro ?? 250,
      pro_dias: 30,
      analisis_stars: compra.partido ?? 50,
      compras_habilitadas: compra.habilitado,
      pro_recurrente: compra.recurrente,
      terminos_version: VERSION_TERMINOS,
      soporte: (Deno.env.get('TELEGRAM_PAY_SUPPORT') ?? '@mitzukyhs').replace(/^@/, '@'),
      bot: 'monitor_esports_avisos_bot',
    } });
  }

  const perfil = await perfilDe(sesion.user.id);
  if (recurso === 'perfil') return json({ ok: true, data: perfil });

  if (recurso === 'inicio') {
    const [a, h] = await Promise.all([abiertas(), cerradas({ limite: 6 })]);
    const ahora = Date.now();
    const baseProximos = a.slice(0, 8);
    const candidatasDirecto = a
      .filter((row) => {
        const inicio = Date.parse(row.inicio_programado);
        return Number.isFinite(inicio) && inicio <= ahora && inicio >= ahora - 8 * 3600_000;
      })
      .sort((x, y) => Date.parse(y.inicio_programado) - Date.parse(x.inicio_programado))
      .slice(0, 8);
    const filasInicio = [...new Map(
      [...baseProximos, ...candidatasDirecto].map((row) => [Number(row.match_id), row]),
    ).values()];

    const [normalizadas, recientes, streams] = await Promise.all([
      normalizarFilas(filasInicio, perfil, { ahora }),
      normalizarFilas(h, perfil, { ahora }),
      directosEnVivo(candidatasDirecto, { ahora }).catch(() => []),
    ]);
    const porId = new Map(normalizadas.map((p) => [p.match_id, p]));
    const proximos = baseProximos.map((row) => porId.get(Number(row.match_id))).filter(Boolean);
    const directos = streams.map((d) => {
      const p = porId.get(d.match_id);
      return p ? {
        ...d,
        equipo_a: p.equipo_a,
        equipo_b: p.equipo_b,
      } : null;
    }).filter(Boolean);

    return json({ ok: true, data: {
      perfil,
      gratis: proximos.find((p) => p.match_id === perfil.gratis_hoy) ?? null,
      directos,
      proximos: proximos.slice(0, 4),
      recientes,
    } });
  }

  if (recurso === 'partidos') {
    const filas = await abiertas({
      juego: url.searchParams.get('juego') || null,
      periodo: url.searchParams.get('periodo') || 'proximos',
    });
    return json({ ok: true, data: { perfil, partidos: await normalizarFilas(filas, perfil) } });
  }

  if (recurso === 'historial') {
    const filas = await cerradas({ juego: url.searchParams.get('juego') || null });
    return json({ ok: true, data: { perfil, partidos: await normalizarFilas(filas, perfil) } });
  }

  if (recurso === 'partido') {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) return json({ ok: false, error: 'partido' }, 400);
    const filas = await seleccionar('eslo_predicciones',
      `?select=match_id,juego,equipo_a,equipo_b,inicio_programado,formato,prob_a,resultado_real&match_id=eq.${id}&limit=1`);
    if (!filas.length) return json({ ok: true, data: { perfil, partido: null } });
    const [partido] = await normalizarFilas(filas, perfil, { incluirAnalisisId: id });
    return json({ ok: true, data: { perfil, partido } });
  }

  return json({ ok: false, error: 'recurso' }, 400);
}

Deno.serve((req) => atender(req).catch((e) => {
  console.error('esport-miniapp:', e?.message ?? 'error');
  return json({ ok: false, error: 'interno' }, 500);
}));
