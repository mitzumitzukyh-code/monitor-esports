import { validarInitData } from './telegram-init.mjs';

const JUEGOS = new Set(['cs2', 'dota2', 'lol', 'valorant']);
const DISCIPLINAS = { cs2: 1, valorant: 2, lol: 3, dota2: 4 };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-telegram-init-data',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
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
  const res = await fetch(url, opciones);
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

function diaUtcMenos4(ms) {
  const d = new Date(ms - 4 * 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 4 * 3600_000;
}

function accesoDe(row, perfil, ahora = Date.now()) {
  if (row.resultado_real === 'ganaA' || row.resultado_real === 'ganaB') return 'auditoria';
  if (perfil.plan === 'pro') return 'pro';
  if (perfil.analisis_comprados.includes(Number(row.match_id))) return 'individual';
  if (perfil.gratis_hoy === Number(row.match_id)) return 'gratis';
  return 'bloqueado';
}

function estadoDe(row, ahora = Date.now()) {
  if (row.resultado_real === 'ganaA' || row.resultado_real === 'ganaB') return 'finalizado';
  return Date.parse(row.inicio_programado) <= ahora ? 'en_vivo' : 'proximo';
}

function gano(fila, teamId) {
  if (fila.resultado_real !== 'ganaA' && fila.resultado_real !== 'ganaB') return null;
  return (fila.resultado_real === 'ganaA') === (Number(fila.equipo_a) === Number(teamId));
}

function forma(filas, teamId) {
  const orden = [...filas].sort((a, b) => Date.parse(b.inicio_programado) - Date.parse(a.inicio_programado)).slice(0, 8);
  const resultados = orden.map((f) => gano(f, teamId)).filter((v) => v != null);
  return {
    victorias: resultados.filter(Boolean).length,
    total: resultados.length,
    ultimas: resultados.slice(0, 5).map((v) => v ? 'G' : 'P'),
  };
}

function h2h(filas, a, b) {
  const entre = filas.filter((f) => {
    const x = Number(f.equipo_a), y = Number(f.equipo_b);
    return (x === a && y === b) || (x === b && y === a);
  });
  return { series: entre.length, ganadasA: entre.filter((f) => gano(f, a)).length };
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
      const res = await fetch(url, { headers: { 'User-Agent': 'monitor-esports-miniapp/1.0' } });
      if (!res.ok) return;
      const data = await res.json();
      for (const t of data.results ?? []) {
        if (t?.id && t?.name) mapa.set(`${juego}:${t.id}`, { id: Number(t.id), nombre: t.name, logo: t.image_url ?? null });
      }
    } catch { /* los IDs siguen siendo una salida válida si bo3.gg falla */ }
  }));
  return mapa;
}

function equipo(mapa, juego, id) {
  return mapa.get(`${juego}:${id}`) ?? { id: Number(id), nombre: `Equipo #${id}`, logo: null };
}

async function normalizarFilas(filas, perfil, { incluirAnalisisId = null, ahora = Date.now() } = {}) {
  const equipos = await resolverEquipos(filas);
  const salida = [];
  for (const row of filas) {
    const acceso = accesoDe(row, perfil, ahora);
    const puedeAnalisis = ['pro', 'individual'].includes(acceso) && Number(row.match_id) === incluirAnalisisId;
    const analisis = puedeAnalisis ? await historialAnalisis(row) : null;
    salida.push({
      match_id: Number(row.match_id),
      juego: row.juego,
      equipo_a: equipo(equipos, row.juego, row.equipo_a),
      equipo_b: equipo(equipos, row.juego, row.equipo_b),
      inicio_programado: row.inicio_programado,
      formato: row.formato || 'bo3',
      estado: estadoDe(row, ahora),
      prob_a: acceso === 'bloqueado' ? null : Number(row.prob_a),
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
  if (req.method !== 'GET') return json({ ok: false, error: 'metodo' }, 405);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const maxAge = Number(Deno.env.get('TELEGRAM_MINIAPP_MAX_AGE_SECONDS') ?? 300);
  let sesion;
  try {
    sesion = await validarInitData(req.headers.get('x-telegram-init-data') ?? '', {
      botToken: token,
      maxAgeSeconds: Number.isSafeInteger(maxAge) ? maxAge : 300,
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
  const perfil = await perfilDe(sesion.user.id);

  if (recurso === 'perfil') return json({ ok: true, data: perfil });
  if (recurso === 'catalogo') return json({ ok: true, data: {
    pro_stars: Number(Deno.env.get('TELEGRAM_PRO_STARS') ?? 250),
    pro_dias: 30,
    analisis_stars: Number(Deno.env.get('TELEGRAM_MATCH_STARS') ?? 50),
    compras_habilitadas: false,
    soporte: (Deno.env.get('TELEGRAM_PAY_SUPPORT') ?? '@mitzukyhs').replace(/^@/, '@'),
    bot: 'monitor_esports_avisos_bot',
  } });

  if (recurso === 'inicio') {
    const [a, h] = await Promise.all([abiertas(), cerradas({ limite: 6 })]);
    const [proximos, recientes] = await Promise.all([
      normalizarFilas(a.slice(0, 8), perfil),
      normalizarFilas(h, perfil),
    ]);
    return json({ ok: true, data: {
      perfil,
      gratis: proximos.find((p) => p.match_id === perfil.gratis_hoy) ?? null,
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
