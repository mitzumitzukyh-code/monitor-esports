// Auditoría de producción del Monitor eSports.
//
// Objetivos:
//   1) Detectar silencios peligrosos: predicciones vencidas sin calificar,
//      cuotas ausentes/viejas/mal emparejadas y 50/50 sospechosos.
//   2) Medir valor real SIN fuga temporal: accuracy, Brier y ROI flat-stake.
//   3) Segmentar por juego, confianza y rango de cuota.
//
// El primer despliegue es observacional: informa problemas pero no rompe el
// workflow. Cuando tengamos una línea base estable, AUDIT_STRICT=1 puede hacer
// fallar sólo invariantes inequívocas de integridad.

import { seleccionar } from '../datos/supabase.mjs';

const HORA = 60 * 60 * 1000;
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

function cuotaDelPick(c, lado, mejor = true) {
  const a = mejor ? n(c.max_coeff_a) ?? n(c.coeff_a) : n(c.coeff_a);
  const b = mejor ? n(c.max_coeff_b) ?? n(c.coeff_b) : n(c.coeff_b);
  return lado === 'A' ? a : b;
}

function mismoEmparejamiento(pred, cuota) {
  return Number(pred.equipo_a) === Number(cuota.equipo_a) && Number(pred.equipo_b) === Number(cuota.equipo_b);
}

// Cuota de entrada sin mirar el futuro del resultado.
// El ciclo captura cuotas ANTES de crear nuevas predicciones, así que se usa:
// - la última cuota <= creada_en si tiene como máximo 30 min de antigüedad;
// - si no existe, la primera cuota posterior a creada_en, siempre prepartido.
// La segunda opción representa el primer precio realmente observable después
// de producir el pick y evita elegir retrospectivamente la mejor cuota.
export function elegirCuotaEntrada(pred, cuotas) {
  const tCreada = ms(pred.creada_en);
  const tInicio = ms(pred.inicio_programado);
  const validas = cuotas
    .filter((c) => mismoEmparejamiento(pred, c))
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
    .filter((c) => mismoEmparejamiento(pred, c))
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
  const cuotaEntrada = entrada ? cuotaDelPick(entrada, lado, true) : null;
  const cuotaProveedor = entrada ? cuotaDelPick(entrada, lado, false) : null;
  const cuotaCierre = cierre ? cuotaDelPick(cierre, lado, true) : null;

  const beneficio = (cuota) =>
    Number.isFinite(cuota) && cuota > 1 ? (acierto ? cuota - 1 : -1) : null;

  return {
    juego: pred.juego,
    matchId: pred.match_id,
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

function imprimirTabla(titulo, grupos) {
  console.log(`\n## ${titulo}`);
  console.log('segmento | N | acierto | Brier | N cuota | ROI entrada | ROI proveedor | ROI cierre');
  console.log('---|---:|---:|---:|---:|---:|---:|---:');
  for (const [nombre, filas] of grupos) {
    const r = resumir(filas);
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

  const resueltas = predicciones.filter((p) => p.resultado_real);
  const pendientes = predicciones.filter((p) => !p.resultado_real);
  const vencidas6h = pendientes.filter((p) => ms(p.inicio_programado) < ahora - 6 * HORA);
  const vencidas24h = pendientes.filter((p) => ms(p.inicio_programado) < ahora - 24 * HORA);
  const futuras = predicciones.filter((p) => ms(p.inicio_programado) > ahora);
  const sospecha5050 = predicciones.filter((p) => Math.abs(n(p.prob_a) - 0.5) < 1e-12);
  const probsInvalidas = predicciones.filter((p) => {
    const a = n(p.prob_a); const b = n(p.prob_b);
    return !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a > 1 || b < 0 || b > 1 || Math.abs(a + b - 1) > 1e-6;
  });

  let cuotasMalEmparejadas = 0;
  let cuotasPostInicio = 0;
  for (const c of cuotas) {
    const p = predicciones.find((x) => String(x.match_id) === String(c.match_id));
    if (p && !mismoEmparejamiento(p, c)) cuotasMalEmparejadas++;
    if (Number.isFinite(ms(c.inicio_programado)) && ms(c.capturado_en) >= ms(c.inicio_programado)) cuotasPostInicio++;
  }

  const evaluadas = resueltas
    .map((p) => evaluar(p, porMatch.get(String(p.match_id)) ?? []))
    .filter(Boolean);
  const sinCuotaEntrada = evaluadas.filter((e) => !Number.isFinite(e.cuotaEntrada));
  const cierresViejos2h = evaluadas.filter((e) => e.cierre && ms(e.cierre.capturado_en) < ms(predicciones.find((p) => p.match_id === e.matchId)?.inicio_programado) - 2 * HORA);
  const cierresViejos6h = evaluadas.filter((e) => e.cierre && ms(e.cierre.capturado_en) < ms(predicciones.find((p) => p.match_id === e.matchId)?.inicio_programado) - 6 * HORA);

  console.log('# AUDITORÍA PRODUCCIÓN · MONITOR ESPORTS');
  console.log(`generada: ${new Date().toISOString()}`);
  console.log(`predicciones: ${predicciones.length} · resueltas: ${resueltas.length} · pendientes: ${pendientes.length} · futuras: ${futuras.length}`);
  console.log(`pendientes vencidas >6h: ${vencidas6h.length} · >24h: ${vencidas24h.length}`);
  console.log(`cuotas almacenadas: ${cuotas.length} · matches con cuota: ${porMatch.size}`);
  console.log(`resueltas sin cuota de entrada utilizable: ${sinCuotaEntrada.length}/${evaluadas.length}`);
  console.log(`cuotas con equipos distintos a la predicción: ${cuotasMalEmparejadas}`);
  console.log(`capturas >= inicio programado: ${cuotasPostInicio}`);
  console.log(`cierres >2h antes del saque: ${cierresViejos2h.length} · >6h: ${cierresViejos6h.length}`);
  console.log(`predicciones 50/50 exactas: ${sospecha5050.length} · probabilidades inválidas: ${probsInvalidas.length}`);

  imprimirTabla('GLOBAL', new Map([['todos', evaluadas]]));
  imprimirTabla('POR JUEGO', agrupar(evaluadas, (x) => x.juego));
  imprimirTabla('POR CONFIANZA', agrupar(evaluadas, (x) => x.bucketConfianza));
  imprimirTabla('POR CUOTA DE ENTRADA', agrupar(evaluadas.filter((x) => Number.isFinite(x.cuotaEntrada)), (x) => x.bucketCuota));

  console.log('\n## INTERPRETACIÓN');
  console.log('- ROI entrada: mejor cuota observable alrededor de la creación del pick, sin elegir retrospectivamente el mejor momento.');
  console.log('- ROI proveedor: mismo instante, usando coeff del proveedor principal; sirve para comparar contra max_coeff.');
  console.log('- ROI cierre: última cuota prepartido; NO es el ROI que habríamos conseguido necesariamente, sirve como benchmark de cierre.');
  console.log('- Segmentos con N pequeño no deben comercializarse por una racha aislada.');

  const criticos = [];
  if (probsInvalidas.length) criticos.push(`${probsInvalidas.length} probabilidades inválidas`);
  if (cuotasMalEmparejadas) criticos.push(`${cuotasMalEmparejadas} cuotas mal emparejadas`);
  if (vencidas24h.length) criticos.push(`${vencidas24h.length} predicciones >24h sin calificar`);

  if (criticos.length) {
    console.log(`\nAUDIT_WARNING: ${criticos.join(' · ')}`);
    if (process.env.AUDIT_STRICT === '1') process.exitCode = 2;
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
