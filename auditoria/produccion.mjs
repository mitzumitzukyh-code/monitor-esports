// Auditoría de producción del Monitor eSports.
//
// Objetivos:
//   1) Detectar silencios peligrosos: predicciones vencidas sin calificar,
//      cuotas ausentes/viejas/mal emparejadas y 50/50 sospechosos.
//   2) Medir valor real SIN fuga temporal: accuracy, Brier y ROI flat-stake.
//   3) Segmentar por juego, confianza y rango de cuota.
//
// El primer despliegue es observacional: informa problemas pero no rompe el
// workflow. AUDIT_STRICT=1 queda reservado para invariantes inequívocas.

import { seleccionar } from '../datos/supabase.mjs';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const MEDIA_HORA = 30 * 60 * 1000;

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const ms = (v) => (v ? new Date(v).getTime() : NaN);
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'n/a');
const dec = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

export function bucketConfianza(c) {
  if (!Number.isFinite(c)) return 'sin confianza';
  if (c < 0.55) return '50-54.9%';
  if (c < 0.60) return '55-59.9%';
  if (c < 0.65) return '60-64.9%';
  if (c < 0.70) return '65-69.9%';
  if (c < 0.75) return '70-74.9%';
  return '75%+';
}

export function bucketCuota(o) {
  if (!Number.isFinite(o)) return 'sin cuota';
  if (o < 1.40) return '<1.40';
  if (o < 1.60) return '1.40-1.59';
  if (o < 1.80) return '1.60-1.79';
  if (o < 2.00) return '1.80-1.99';
  if (o < 2.50) return '2.00-2.49';
  return '2.50+';
}

export function relacionEquipos(pred, cuota) {
  const pa = Number(pred.equipo_a);
  const pb = Number(pred.equipo_b);
  const ca = Number(cuota.equipo_a);
  const cb = Number(cuota.equipo_b);
  if (pa === ca && pb === cb) return 'mismo';
  if (pa === cb && pb === ca) return 'invertido';
  return 'ajeno';
}

// Obtiene la cuota del EQUIPO elegido, no de una letra A/B asumida. Esto es
// esencial porque una predicción histórica puede guardar A/B en orden distinto
// al snapshot de cuotas aun siendo exactamente los mismos dos team_id.
function cuotaDelPick(pred, c, ladoPred, mejor = true) {
  const idPick = Number(ladoPred === 'A' ? pred.equipo_a : pred.equipo_b);
  let ladoCuota = null;
  if (Number(c.equipo_a) === idPick) ladoCuota = 'A';
  else if (Number(c.equipo_b) === idPick) ladoCuota = 'B';
  else return null;

  const a = mejor ? n(c.max_coeff_a) ?? n(c.coeff_a) : n(c.coeff_a);
  const b = mejor ? n(c.max_coeff_b) ?? n(c.coeff_b) : n(c.coeff_b);
  return ladoCuota === 'A' ? a : b;
}

// Cuota de entrada sin mirar el futuro del resultado.
// - última cuota <= creada_en si tiene como máximo 30 min de antigüedad;
// - si no existe, primera cuota posterior a creada_en, siempre prepartido.
export function elegirCuotaEntrada(pred, cuotas) {
  const tCreada = ms(pred.creada_en);
  const tInicio = ms(pred.inicio_programado);
  const validas = cuotas
    .filter((c) => relacionEquipos(pred, c) !== 'ajeno')
    .filter((c) => Number.isFinite(ms(c.capturado_en)) && ms(c.capturado_en) < tInicio)
    .sort((a, b) => ms(a.capturado_en) - ms(b.capturado_en));

  if (!validas.length) return null;
  if (!Number.isFinite(tCreada)) return validas[0];

  const antes = validas.filter((c) => ms(c.capturado_en) <= tCreada).at(-1);
  if (antes && tCreada - ms(antes.capturado_en) <= MEDIA_HORA) return antes;
  return validas.find((c) => ms(c.capturado_en) > tCreada) ?? null;
}

export function elegirCuotaCierre(pred, cuotas) {
  const tInicio = ms(pred.inicio_programado);
  return cuotas
    .filter((c) => relacionEquipos(pred, c) !== 'ajeno')
    .filter((c) => Number.isFinite(ms(c.capturado_en)) && ms(c.capturado_en) < tInicio)
    .sort((a, b) => ms(a.capturado_en) - ms(b.capturado_en))
    .at(-1) ?? null;
}

export function evaluar(pred, cuotasDelMatch = []) {
  if (!pred.resultado_real) return null;
  const pa = n(pred.prob_a);
  if (!Number.isFinite(pa)) return null;

  const lado = pa >= 0.5 ? 'A' : 'B';
  const confianza = lado === 'A' ? pa : 1 - pa;
  const ganoA = pred.resultado_real === 'ganaA';
  const acierto = lado === 'A' ? ganoA : !ganoA;
  const brier = (pa - (ganoA ? 1 : 0)) ** 2;

  const entrada = elegirCuotaEntrada(pred, cuotasDelMatch);
  const cierre = elegirCuotaCierre(pred, cuotasDelMatch);
  const cuotaEntrada = entrada ? cuotaDelPick(pred, entrada, lado, true) : null;
  const cuotaProveedor = entrada ? cuotaDelPick(pred, entrada, lado, false) : null;
  const cuotaCierre = cierre ? cuotaDelPick(pred, cierre, lado, true) : null;

  const beneficio = (cuota) =>
    Number.isFinite(cuota) && cuota > 1 ? (acierto ? cuota - 1 : -1) : null;

  return {
    juego: pred.juego,
    matchId: pred.match_id,
    inicioProgramado: pred.inicio_programado,
    lado,
    confianza,
    acierto,
    brier,
    cuotaEntrada,
    cuotaProveedor,
    cuotaCierre,
    roiEntrada: beneficio(cuotaEntrada),
    roiProveedor: beneficio(cuotaProveedor),
    roiCierre: beneficio(cuotaCierre),
    bucketConfianza: bucketConfianza(confianza),
    bucketCuota: bucketCuota(cuotaEntrada),
    entrada,
    cierre,
  };
}

export function resumir(filas) {
  const nTotal = filas.length;
  if (!nTotal) return { n: 0, accuracy: null, brier: null, nOdds: 0, roi: null, roiProveedor: null, roiCierre: null };
  const odds = filas.filter((x) => Number.isFinite(x.roiEntrada));
  const oddsProveedor = filas.filter((x) => Number.isFinite(x.roiProveedor));
  const oddsCierre = filas.filter((x) => Number.isFinite(x.roiCierre));
  const media = (xs, fn) => xs.length ? xs.reduce((s, x) => s + fn(x), 0) / xs.length : null;
  return {
    n: nTotal,
    accuracy: media(filas, (x) => (x.acierto ? 1 : 0)),
    brier: media(filas, (x) => x.brier),
    nOdds: odds.length,
    roi: media(odds, (x) => x.roiEntrada),
    roiProveedor: media(oddsProveedor, (x) => x.roiProveedor),
    roiCierre: media(oddsCierre, (x) => x.roiCierre),
  };
}

function agrupar(filas, fn) {
  const m = new Map();
  for (const f of filas) {
    const k = fn(f);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
}

function conteoPorJuego(filas) {
  return [...agrupar(filas, (x) => x.juego).entries()]
    .map(([j, xs]) => `${j}:${xs.length}`)
    .join(' · ') || 'ninguno';
}

function imprimirTabla(titulo, grupos, { minN = 0 } = {}) {
  console.log(`\n## ${titulo}`);
  console.log('segmento | N | acierto | Brier | N cuota | ROI entrada | ROI proveedor | ROI cierre');
  console.log('---|---:|---:|---:|---:|---:|---:|---:');
  for (const [nombre, filas] of grupos) {
    const r = resumir(filas);
    if (r.n < minN) continue;
    console.log(`${nombre} | ${r.n} | ${pct(r.accuracy)} | ${dec(r.brier)} | ${r.nOdds} | ${pct(r.roi)} | ${pct(r.roiProveedor)} | ${pct(r.roiCierre)}`);
  }
}

async function cargar() {
  const predicciones = await seleccionar(
    'eslo_predicciones',
    '?select=match_id,juego,equipo_a,equipo_b,inicio_programado,prob_a,prob_b,creada_en,resultado_real,brier,calificada_en&order=match_id.asc',
  );
  const cuotas = await seleccionar(
    'eslo_cuotas',
    '?select=match_id,capturado_en,juego,equipo_a,equipo_b,coeff_a,coeff_b,max_coeff_a,max_coeff_b,inicio_programado&order=match_id.asc,capturado_en.asc',
  );
  return { predicciones, cuotas };
}

export async function auditar() {
  const { predicciones, cuotas } = await cargar();
  const ahora = Date.now();
  const porMatch = agrupar(cuotas, (c) => String(c.match_id));
  const predPorMatch = new Map(predicciones.map((p) => [String(p.match_id), p]));

  const resueltas = predicciones.filter((p) => p.resultado_real);
  const pendientes = predicciones.filter((p) => !p.resultado_real);
  const vencidas6h = pendientes.filter((p) => ms(p.inicio_programado) < ahora - 6 * HORA);
  const vencidas24h = pendientes.filter((p) => ms(p.inicio_programado) < ahora - DIA);
  const futuras = predicciones.filter((p) => ms(p.inicio_programado) > ahora);
  const futuras24h = predicciones.filter((p) => ms(p.inicio_programado) > ahora && ms(p.inicio_programado) <= ahora + DIA);
  const sospecha5050 = predicciones.filter((p) => Math.abs(n(p.prob_a) - 0.5) < 1e-12);
  const probsInvalidas = predicciones.filter((p) => {
    const a = n(p.prob_a); const b = n(p.prob_b);
    return !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a > 1 || b < 0 || b > 1 || Math.abs(a + b - 1) > 1e-6;
  });

  let filasInvertidas = 0;
  let filasAjenas = 0;
  let cuotasPostInicio = 0;
  const matchesInvertidos = new Set();
  const matchesAjenos = new Set();
  for (const c of cuotas) {
    const p = predPorMatch.get(String(c.match_id));
    if (p) {
      const rel = relacionEquipos(p, c);
      if (rel === 'invertido') { filasInvertidas++; matchesInvertidos.add(String(c.match_id)); }
      if (rel === 'ajeno') { filasAjenas++; matchesAjenos.add(String(c.match_id)); }
    }
    if (Number.isFinite(ms(c.inicio_programado)) && ms(c.capturado_en) >= ms(c.inicio_programado)) cuotasPostInicio++;
  }

  const cuotas2h = cuotas.filter((c) => ms(c.capturado_en) >= ahora - 2 * HORA);
  const cuotas24h = cuotas.filter((c) => ms(c.capturado_en) >= ahora - DIA);

  const evaluadas = resueltas
    .map((p) => evaluar(p, porMatch.get(String(p.match_id)) ?? []))
    .filter(Boolean);
  const sinCuotaEntrada = evaluadas.filter((e) => !Number.isFinite(e.cuotaEntrada));
  const cierresViejos2h = evaluadas.filter((e) => e.cierre && ms(e.cierre.capturado_en) < ms(e.inicioProgramado) - 2 * HORA);
  const cierresViejos6h = evaluadas.filter((e) => e.cierre && ms(e.cierre.capturado_en) < ms(e.inicioProgramado) - 6 * HORA);
  const recientes30d = evaluadas.filter((e) => ms(e.inicioProgramado) >= ahora - 30 * DIA && ms(e.inicioProgramado) <= ahora);

  console.log('# AUDITORÍA PRODUCCIÓN · MONITOR ESPORTS');
  console.log(`generada: ${new Date().toISOString()}`);
  console.log(`predicciones: ${predicciones.length} · resueltas: ${resueltas.length} · pendientes: ${pendientes.length} · futuras: ${futuras.length} · futuras24h: ${futuras24h.length}`);
  console.log(`pendientes vencidas >6h: ${vencidas6h.length} · >24h: ${vencidas24h.length} [${conteoPorJuego(vencidas24h)}]`);
  console.log(`cuotas almacenadas: ${cuotas.length} · matches con cuota: ${porMatch.size} · últimas2h: ${cuotas2h.length} · últimas24h: ${cuotas24h.length}`);
  console.log(`resueltas sin cuota de entrada utilizable: ${sinCuotaEntrada.length}/${evaluadas.length}`);
  console.log(`orden A/B invertido pero remapeable: ${filasInvertidas} filas / ${matchesInvertidos.size} matches`);
  console.log(`equipos realmente ajenos al match: ${filasAjenas} filas / ${matchesAjenos.size} matches`);
  console.log(`capturas >= inicio programado: ${cuotasPostInicio}`);
  console.log(`cierres >2h antes del saque: ${cierresViejos2h.length} · >6h: ${cierresViejos6h.length}`);
  console.log(`predicciones 50/50 exactas: ${sospecha5050.length} [${conteoPorJuego(sospecha5050)}] · probabilidades inválidas: ${probsInvalidas.length}`);

  imprimirTabla('GLOBAL', new Map([['todos', evaluadas]]));
  imprimirTabla('ÚLTIMOS 30 DÍAS', new Map([['todos', recientes30d]]));
  imprimirTabla('POR JUEGO', agrupar(evaluadas, (x) => x.juego));
  imprimirTabla('30 DÍAS · POR JUEGO', agrupar(recientes30d, (x) => x.juego));
  imprimirTabla('POR CONFIANZA', agrupar(evaluadas, (x) => x.bucketConfianza));
  imprimirTabla('POR CUOTA DE ENTRADA', agrupar(evaluadas.filter((x) => Number.isFinite(x.cuotaEntrada)), (x) => x.bucketCuota));
  imprimirTabla('JUEGO × CONFIANZA (N>=20)', agrupar(evaluadas, (x) => `${x.juego} · ${x.bucketConfianza}`), { minN: 20 });
  imprimirTabla('JUEGO × CUOTA (N>=20)', agrupar(evaluadas.filter((x) => Number.isFinite(x.cuotaEntrada)), (x) => `${x.juego} · ${x.bucketCuota}`), { minN: 20 });

  console.log('\n## INTERPRETACIÓN');
  console.log('- ROI entrada: mejor cuota observable alrededor de la creación del pick, sin elegir retrospectivamente el mejor momento.');
  console.log('- ROI proveedor: mismo instante, usando coeff del proveedor principal; sirve para comparar contra max_coeff.');
  console.log('- ROI cierre: última cuota prepartido; NO es el ROI que habríamos conseguido necesariamente, sirve como benchmark de cierre.');
  console.log('- A/B invertido con los mismos team_id se remapea; sólo equipos ajenos se consideran corrupción de matching.');
  console.log('- Segmentos con N pequeño no deben comercializarse por una racha aislada.');

  const criticos = [];
  const avisos = [];
  if (probsInvalidas.length) criticos.push(`${probsInvalidas.length} probabilidades inválidas`);
  if (filasAjenas) criticos.push(`${filasAjenas} cuotas con equipos ajenos (${matchesAjenos.size} matches)`);
  if (vencidas24h.length) avisos.push(`${vencidas24h.length} predicciones >24h sin calificar`);
  if (futuras24h.length > 0 && cuotas2h.length === 0) avisos.push(`${futuras24h.length} partidos próximos pero 0 cuotas capturadas en 2h`);

  if (criticos.length || avisos.length) {
    console.log(`\nAUDIT_WARNING: ${[...criticos, ...avisos].join(' · ')}`);
    if (criticos.length && process.env.AUDIT_STRICT === '1') process.exitCode = 2;
  } else {
    console.log('\nAUDIT_OK: no se detectaron invariantes críticas rotas.');
  }

  return { predicciones, cuotas, evaluadas };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  auditar().catch((e) => {
    console.error(`AUDIT_ERROR: ${e.stack ?? e.message}`);
    process.exitCode = 1;
  });
}
