// Market Calibration Shadow v1
//
// Experimento prospectivo y observacional. Parte de los PASS de quality-gate-v1
// y compara la probabilidad del modelo con la probabilidad implícita del mercado
// sin margen (de-vig). NO decide qué publicar, no genera apuestas, no calcula
// stake/ROI/EV y no modifica Telegram, Discord ni las predicciones.
//
// La persistencia deliberadamente vive en artefactos inmutables de GitHub
// Actions. Para evaluación futura, la observación canónica de un match es la
// primera fila status=ok encontrada cronológicamente entre los artefactos.

import { seleccionar } from '../datos/supabase.mjs';

export const CALIBRATION_VERSION = 'market-calibration-shadow-v1';
export const SOURCE_GATE_VERSION = 'quality-gate-v1';

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const ms = (v) => (v ? new Date(v).getTime() : NaN);

export function relacionEquipos(pred, cuota) {
  const pa = Number(pred.equipo_a);
  const pb = Number(pred.equipo_b);
  const ca = Number(cuota.equipo_a);
  const cb = Number(cuota.equipo_b);
  if (pa === ca && pb === cb) return 'mismo';
  if (pa === cb && pb === ca) return 'invertido';
  return 'ajeno';
}

export function alinearCuota(pred, cuota) {
  const relacion = relacionEquipos(pred, cuota);
  if (relacion === 'ajeno') return null;

  if (relacion === 'mismo') {
    return {
      relacion,
      oddsA: n(cuota.coeff_a),
      oddsB: n(cuota.coeff_b),
      bestOddsA: n(cuota.max_coeff_a),
      bestOddsB: n(cuota.max_coeff_b),
    };
  }

  return {
    relacion,
    oddsA: n(cuota.coeff_b),
    oddsB: n(cuota.coeff_a),
    bestOddsA: n(cuota.max_coeff_b),
    bestOddsB: n(cuota.max_coeff_a),
  };
}

export function probabilidadMercadoDevig(oddsA, oddsB) {
  if (!Number.isFinite(oddsA) || !Number.isFinite(oddsB) || oddsA <= 1 || oddsB <= 1) return null;
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const total = rawA + rawB;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    rawA,
    rawB,
    devigA: rawA / total,
    devigB: rawB / total,
    overround: total - 1,
  };
}

// Bandas congeladas antes de mirar los resultados prospectivos. Son etiquetas
// descriptivas para calibración, NO reglas de selección ni PASS/REJECT.
export function bandaDelta(deltaPp) {
  if (!Number.isFinite(deltaPp)) return 'sin-delta';
  if (deltaPp < -5) return '<-5pp';
  if (deltaPp < -2) return '-5..-2pp';
  if (deltaPp < 0) return '-2..0pp';
  if (deltaPp < 2) return '0..2pp';
  if (deltaPp < 5) return '2..5pp';
  if (deltaPp < 8) return '5..8pp';
  return '8pp+';
}

export function elegirSnapshotCuota(pred, cuotas, { ahora = new Date() } = {}) {
  const ahoraMs = ahora.getTime();
  const inicioMs = ms(pred.inicio_programado);
  if (!Number.isFinite(inicioMs)) return null;

  return cuotas
    .filter((c) => relacionEquipos(pred, c) !== 'ajeno')
    .filter((c) => {
      const t = ms(c.capturado_en);
      return Number.isFinite(t) && t <= ahoraMs && t < inicioMs;
    })
    .filter((c) => {
      const a = alinearCuota(pred, c);
      return a && probabilidadMercadoDevig(a.oddsA, a.oddsB);
    })
    .sort((a, b) => ms(a.capturado_en) - ms(b.capturado_en))
    .at(-1) ?? null;
}

export function observarCalibracion(pred, gate, cuotas = [], { ahora = new Date() } = {}) {
  const base = {
    calibration_version: CALIBRATION_VERSION,
    source_gate_version: SOURCE_GATE_VERSION,
    observed_at: ahora.toISOString(),
    match_id: pred.match_id,
    juego: pred.juego,
    tier: pred.tier ?? gate?.tier ?? null,
    inicio_programado: pred.inicio_programado,
  };

  const pa = n(pred.prob_a);
  const pb = n(pred.prob_b);
  if (!Number.isFinite(pa) || !Number.isFinite(pb) || pa < 0 || pb < 0 || Math.abs(pa + pb - 1) > 1e-6) {
    return { ...base, status: 'invalid_model_probability' };
  }

  const snapshot = elegirSnapshotCuota(pred, cuotas, { ahora });
  if (!snapshot) return { ...base, status: 'no_quote' };

  const alineada = alinearCuota(pred, snapshot);
  const mercado = probabilidadMercadoDevig(alineada.oddsA, alineada.oddsB);
  if (!alineada || !mercado) return { ...base, status: 'invalid_quote' };

  const lado = pa >= pb ? 'A' : 'B';
  const modelProbability = lado === 'A' ? pa : pb;
  const marketProbabilityRaw = lado === 'A' ? mercado.rawA : mercado.rawB;
  const marketProbabilityDevig = lado === 'A' ? mercado.devigA : mercado.devigB;
  const providerOddsPick = lado === 'A' ? alineada.oddsA : alineada.oddsB;
  const bestObservedOddsPick = lado === 'A' ? alineada.bestOddsA : alineada.bestOddsB;
  const deltaPp = (modelProbability - marketProbabilityDevig) * 100;
  const quoteAgeMinutes = (ahora.getTime() - ms(snapshot.capturado_en)) / 60_000;

  return {
    ...base,
    status: 'ok',
    pick_side: lado,
    pick_team_id: Number(lado === 'A' ? pred.equipo_a : pred.equipo_b),
    model_probability: modelProbability,
    provider_odds_pick: providerOddsPick,
    best_observed_odds_pick: bestObservedOddsPick,
    market_probability_raw: marketProbabilityRaw,
    market_probability_devig: marketProbabilityDevig,
    market_overround: mercado.overround,
    model_market_delta_pp: deltaPp,
    delta_band: bandaDelta(deltaPp),
    quote_captured_at: snapshot.capturado_en,
    quote_age_minutes: quoteAgeMinutes,
    quote_provider_id: snapshot.proveedor_id ?? null,
    team_order_relation: alineada.relacion,
    // Deliberadamente NO se incluyen resultado_real, ROI, EV ni una decisión
    // comercial. Este registro existe para evaluación prospectiva posterior.
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

export function resumirCalibracion(observaciones) {
  const ok = observaciones.filter((x) => x.status === 'ok');
  const estados = [...agrupar(observaciones, (x) => x.status).entries()]
    .map(([status, xs]) => [status, xs.length])
    .sort((a, b) => b[1] - a[1]);
  const bandas = [...agrupar(ok, (x) => x.delta_band).entries()]
    .map(([band, xs]) => [band, xs.length])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return { total: observaciones.length, ok: ok.length, estados, bandas };
}

export async function ejecutarCalibracion({ ahora = new Date(), fetchImpl } = {}) {
  const gateRows = await seleccionar(
    'eslo_quality_gate',
    `?select=match_id,gate_version,juego,decision,evaluated_at,inicio_programado,tier,prob_a,prob_b,confidence,rd_max&gate_version=eq.${SOURCE_GATE_VERSION}&decision=eq.pass&order=match_id.asc`,
    { fetchImpl },
  );

  const ahoraMs = ahora.getTime();
  const gatesVigentes = gateRows.filter((g) => ms(g.inicio_programado) > ahoraMs);
  if (!gatesVigentes.length) return { observaciones: [], resumen: resumirCalibracion([]) };

  const ids = new Set(gatesVigentes.map((g) => String(g.match_id)));

  const predicciones = await seleccionar(
    'eslo_predicciones',
    '?select=match_id,juego,equipo_a,equipo_b,inicio_programado,tier,prob_a,prob_b,resultado_real&order=match_id.asc',
    { fetchImpl },
  );
  const predPorId = new Map(
    predicciones
      .filter((p) => ids.has(String(p.match_id)))
      .filter((p) => !p.resultado_real && ms(p.inicio_programado) > ahoraMs)
      .map((p) => [String(p.match_id), p]),
  );

  const cuotas = await seleccionar(
    'eslo_cuotas',
    '?select=match_id,capturado_en,juego,equipo_a,equipo_b,coeff_a,coeff_b,max_coeff_a,max_coeff_b,inicio_programado,proveedor_id&order=match_id.asc,capturado_en.asc',
    { fetchImpl },
  );
  const cuotasPorId = agrupar(cuotas.filter((c) => ids.has(String(c.match_id))), (c) => String(c.match_id));

  const observaciones = [];
  for (const gate of gatesVigentes) {
    const pred = predPorId.get(String(gate.match_id));
    if (!pred) continue;
    observaciones.push(
      observarCalibracion(pred, gate, cuotasPorId.get(String(gate.match_id)) ?? [], { ahora }),
    );
  }

  return { observaciones, resumen: resumirCalibracion(observaciones) };
}
