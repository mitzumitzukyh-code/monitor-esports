const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const BO3 = 'https://api.bo3.gg/api/v1';
const DISCIPLINAS = { cs2: 1, valorant: 2, lol: 3, dota2: 4 };

function headers() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

async function supabase(tabla, query) {
  const h = headers();
  if (!h) return [];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}${query}`, {
    headers: h,
    next: { revalidate: 60 },
  });
  if (!r.ok) throw new Error(`Supabase ${tabla}: ${r.status}`);
  return r.json();
}

async function countPredicciones() {
  const h = headers();
  if (!h) return 0;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/eslo_predicciones?select=match_id&limit=1`, {
    headers: { ...h, Prefer: 'count=exact' },
    next: { revalidate: 60 },
  });
  const range = r.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function feed(juego, status) {
  const id = DISCIPLINAS[juego];
  if (!id) return [];
  const url = `${BO3}/matches?page[limit]=100&page[offset]=0&sort=-start_date&filter[matches.discipline_id][eq]=${id}&filter[matches.status][eq]=${status}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'monitor-esports-web/0.1' },
      next: { revalidate: 180 },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return j.results ?? [];
  } catch {
    return [];
  }
}

function nombreEquipo(raw, lado, id) {
  const obj = raw?.[`team${lado}`] || raw?.[`team_${lado}`] || raw?.[`team${lado}_data`];
  return obj?.name || obj?.title || raw?.[`team${lado}_name`] || raw?.[`team_${lado}_name`] || `Equipo #${id}`;
}

function logoEquipo(raw, lado) {
  const obj = raw?.[`team${lado}`] || raw?.[`team_${lado}`] || raw?.[`team${lado}_data`];
  return obj?.logo_url || obj?.logo || obj?.image_url || raw?.[`team${lado}_logo`] || null;
}

function torneo(raw) {
  return raw?.tournament?.name || raw?.event?.name || raw?.tournament_name || raw?.event_name || 'Competición profesional';
}

export async function getDashboard() {
  const ahora = new Date().toISOString();
  const [preds, recientes, ratings, total, ...feeds] = await Promise.all([
    supabase('eslo_predicciones', `?select=*&inicio_programado=gt.${encodeURIComponent(ahora)}&order=inicio_programado.asc&limit=16`),
    supabase('eslo_predicciones', '?select=*&resultado_real=not.is.null&order=calificada_en.desc&limit=12'),
    supabase('eslo_ratings', '?select=*&order=rating.desc&limit=40'),
    countPredicciones(),
    ...Object.keys(DISCIPLINAS).flatMap((j) => [feed(j, 'upcoming'), feed(j, 'finished')]),
  ]);

  const rawById = new Map();
  let idx = 0;
  for (const juego of Object.keys(DISCIPLINAS)) {
    for (const raw of feeds[idx++] || []) rawById.set(String(raw.id), { raw, juego });
    for (const raw of feeds[idx++] || []) rawById.set(String(raw.id), { raw, juego });
  }

  const decorar = (p) => {
    const hit = rawById.get(String(p.match_id));
    const raw = hit?.raw;
    return {
      ...p,
      nombre_a: nombreEquipo(raw, 1, p.equipo_a),
      nombre_b: nombreEquipo(raw, 2, p.equipo_b),
      logo_a: logoEquipo(raw, 1),
      logo_b: logoEquipo(raw, 2),
      torneo: torneo(raw),
    };
  };

  const muestras = await supabase(
    'eslo_predicciones',
    '?select=prob_a,prob_b,brier,resultado_real&resultado_real=not.is.null&order=calificada_en.desc&limit=1000',
  );
  const conBrier = muestras.filter((x) => Number.isFinite(Number(x.brier)));
  const brier = conBrier.length ? conBrier.reduce((s, x) => s + Number(x.brier), 0) / conBrier.length : null;
  const aciertos = muestras.filter((x) => {
    const favA = Number(x.prob_a) >= Number(x.prob_b);
    return (favA && x.resultado_real === 'ganaA') || (!favA && x.resultado_real === 'ganaB');
  }).length;
  const accuracy = muestras.length ? aciertos / muestras.length : null;

  return {
    predicciones: preds.map(decorar),
    resultados: recientes.map(decorar),
    ratings,
    total,
    brier,
    accuracy,
    nCalificadas: muestras.length,
  };
}
