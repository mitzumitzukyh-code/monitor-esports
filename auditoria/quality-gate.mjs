// Quality Gate prospectivo para decidir qué predicciones tienen calidad suficiente
// para publicación analítica. NO usa cuotas, edge ni ROI para seleccionar.
// Cada evaluación se registra con versión de reglas y motivos explícitos.

import { seleccionar, upsert } from '../datos/supabase.mjs';

export const GATE_VERSION = 'quality-gate-v1';
export const GATE_RULES = Object.freeze({
  juegosPermitidos: new Set(['lol']),
  tiersPermitidos: new Set(['s', 'a']),
  horasMaximas: 24,
  confianzaMin: 0.55,
  confianzaMaxExclusiva: 0.75,
  rdMaxExclusivo: 150,
});

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function evaluarQualityGate(pred, { ahora = new Date() } = {}) {
  const reasons = [];
  const juego = String(pred.juego ?? '').toLowerCase();
  const tier = String(pred.tier ?? '').toLowerCase();
  const pa = n(pred.prob_a);
  const pb = n(pred.prob_b);
  const rdA = n(pred.rd_a);
  const rdB = n(pred.rd_b);
  const inicio = new Date(pred.inicio_programado);
  const ahoraMs = ahora.getTime();
  const inicioMs = inicio.getTime();
  const hoursToStart = Number.isFinite(inicioMs) ? (inicioMs - ahoraMs) / 3_600_000 : null;
  const confidence = Number.isFinite(pa) && Number.isFinite(pb) ? Math.max(pa, pb) : null;
  const rdMax = Number.isFinite(rdA) && Number.isFinite(rdB) ? Math.max(rdA, rdB) : null;

  if (!GATE_RULES.juegosPermitidos.has(juego)) reasons.push('GAME_NOT_ALLOWED');
  if (!GATE_RULES.tiersPermitidos.has(tier)) reasons.push('TIER_NOT_ALLOWED');

  const probsValidas = Number.isFinite(pa) && Number.isFinite(pb) && pa >= 0 && pa <= 1 && pb >= 0 && pb <= 1 && Math.abs(pa + pb - 1) <= 1e-6;
  if (!probsValidas) reasons.push('INVALID_PROBABILITIES');

  if (!Number.isFinite(inicioMs)) reasons.push('INVALID_START_TIME');
  else {
    if (inicioMs <= ahoraMs) reasons.push('ALREADY_STARTED');
    if (hoursToStart > GATE_RULES.horasMaximas) reasons.push('TOO_FAR_AHEAD');
  }

  if (!Number.isFinite(confidence)) reasons.push('INVALID_CONFIDENCE');
  else {
    if (confidence < GATE_RULES.confianzaMin) reasons.push('CONFIDENCE_TOO_LOW');
    if (confidence >= GATE_RULES.confianzaMaxExclusiva) reasons.push('CONFIDENCE_TOO_HIGH_FOR_V1');
  }

  if (!Number.isFinite(rdMax)) reasons.push('RD_UNAVAILABLE');
  else if (rdMax >= GATE_RULES.rdMaxExclusivo) reasons.push('RD_TOO_HIGH');

  return {
    match_id: pred.match_id,
    gate_version: GATE_VERSION,
    juego,
    decision: reasons.length === 0 ? 'pass' : 'reject',
    reasons,
    evaluated_at: ahora.toISOString(),
    inicio_programado: pred.inicio_programado,
    tier: pred.tier ?? null,
    prob_a: pa,
    prob_b: pb,
    confidence,
    rd_max: rdMax,
    hours_to_start: hoursToStart,
  };
}

export function resumirQualityGate(decisiones) {
  const pass = decisiones.filter((d) => d.decision === 'pass');
  const reject = decisiones.filter((d) => d.decision === 'reject');
  const reasons = new Map();
  for (const d of reject) for (const r of d.reasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  return {
    total: decisiones.length,
    pass: pass.length,
    reject: reject.length,
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export async function ejecutarQualityGate({ ahora = new Date(), fetchImpl } = {}) {
  const ahoraMs = ahora.getTime();
  const limiteMs = ahoraMs + GATE_RULES.horasMaximas * 3_600_000;

  // PostgREST ya nos causó silencios por filtros/paginación. Aquí priorizamos
  // observabilidad: traemos todas las pendientes con orden total y aplicamos
  // la ventana temporal en JS, usando la misma lógica probada del gate.
  const pendientes = await seleccionar(
    'eslo_predicciones',
    '?select=match_id,juego,tier,prob_a,prob_b,rd_a,rd_b,inicio_programado,resultado_real&resultado_real=is.null&order=match_id.asc',
    { fetchImpl },
  );

  const predicciones = pendientes.filter((p) => {
    const inicioMs = new Date(p.inicio_programado).getTime();
    return Number.isFinite(inicioMs) && inicioMs > ahoraMs && inicioMs <= limiteMs;
  });

  const decisiones = predicciones.map((p) => evaluarQualityGate(p, { ahora }));
  if (decisiones.length) {
    await upsert('eslo_quality_gate', decisiones, { onConflict: 'match_id,gate_version', fetchImpl });
  }

  return { decisiones, resumen: resumirQualityGate(decisiones) };
}

const esDirecto = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (esDirecto) {
  const { decisiones, resumen } = await ejecutarQualityGate();
  console.log(`# Quality Gate ${GATE_VERSION}`);
  console.log(`evaluadas=${resumen.total} pass=${resumen.pass} reject=${resumen.reject}`);
  for (const [reason, count] of resumen.reasons) console.log(`reject.${reason}=${count}`);
  for (const d of decisiones.filter((x) => x.decision === 'pass')) {
    console.log(`PASS match=${d.match_id} juego=${d.juego} tier=${d.tier} conf=${(d.confidence * 100).toFixed(1)} rdMax=${d.rd_max?.toFixed?.(1) ?? d.rd_max} h=${d.hours_to_start?.toFixed?.(1) ?? d.hours_to_start}`);
  }
}
