import { seleccionar } from '../datos/supabase.mjs';

export const EVALUATOR_VERSION = 'prospective-evaluator-v1';
export const CALIBRATION_VERSION = 'market-calibration-shadow-v1';
export const CANONICAL_TABLE = 'eslo_market_calibration_shadow';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rounded = (v, d = 6) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

export function probabilityBand(p) {
  if (!Number.isFinite(p)) return 'unknown';
  if (p < 0.55) return '<55%';
  if (p < 0.60) return '55-60%';
  if (p < 0.65) return '60-65%';
  if (p < 0.70) return '65-70%';
  if (p < 0.75) return '70-75%';
  return '75%+';
}

export function readingMilestone(n) {
  if (n < 30) return 'PRE_N30_INTEGRITY_ONLY';
  if (n < 50) return 'N30_INTEGRITY_CHECKPOINT';
  if (n < 100) return 'N50_EXPLORATORY';
  return 'N100_OPERATIONAL_READ';
}

export function scoreObservation(obs, prediction) {
  const base = {
    evaluator_version: EVALUATOR_VERSION,
    calibration_version: obs?.calibration_version ?? CALIBRATION_VERSION,
    match_id: obs?.match_id ?? null,
    juego: obs?.juego ?? null,
    observed_at: obs?.observed_at ?? null,
    pick_side: obs?.pick_side ?? null,
    pick_team_id: obs?.pick_team_id ?? null,
    model_probability: num(obs?.model_probability),
    reference_probability: num(obs?.market_probability_devig),
    model_reference_delta_pp: num(obs?.model_market_delta_pp),
    delta_band: obs?.delta_band ?? null,
  };

  if (!prediction) return { ...base, status: 'missing_prediction' };

  const expectedTeam = obs.pick_side === 'A'
    ? Number(prediction.equipo_a)
    : obs.pick_side === 'B'
      ? Number(prediction.equipo_b)
      : NaN;
  if (!Number.isFinite(expectedTeam) || expectedTeam !== Number(obs.pick_team_id)) {
    return { ...base, status: 'identity_mismatch' };
  }

  if (!prediction.resultado_real) return { ...base, status: 'pending' };
  if (!['ganaA', 'ganaB'].includes(prediction.resultado_real)) {
    return { ...base, status: 'invalid_result' };
  }

  const observedAt = new Date(obs.observed_at).getTime();
  const gradedAt = prediction.calificada_en ? new Date(prediction.calificada_en).getTime() : NaN;
  if (Number.isFinite(observedAt) && Number.isFinite(gradedAt) && gradedAt <= observedAt) {
    return { ...base, status: 'result_precedes_observation' };
  }

  const modelP = num(obs.model_probability);
  const referenceP = num(obs.market_probability_devig);
  if (![modelP, referenceP].every((x) => Number.isFinite(x) && x >= 0 && x <= 1)) {
    return { ...base, status: 'invalid_probability' };
  }

  const aWon = prediction.resultado_real === 'ganaA';
  const outcome = obs.pick_side === 'A' ? Number(aWon) : Number(!aWon);
  const modelBrier = (modelP - outcome) ** 2;
  const referenceBrier = (referenceP - outcome) ** 2;

  return {
    ...base,
    status: 'resolved',
    resultado_real: prediction.resultado_real,
    calificada_en: prediction.calificada_en ?? null,
    outcome_pick: outcome,
    pick_correct: outcome === 1,
    probability_band: probabilityBand(modelP),
    brier_model: modelBrier,
    brier_reference: referenceBrier,
    brier_diff_model_minus_reference: modelBrier - referenceBrier,
  };
}

function groupSummary(rows) {
  const modelBrier = avg(rows.map((x) => x.brier_model));
  const referenceBrier = avg(rows.map((x) => x.brier_reference));
  const observed = avg(rows.map((x) => x.outcome_pick));
  const modelP = avg(rows.map((x) => x.model_probability));
  const referenceP = avg(rows.map((x) => x.reference_probability));
  const delta = avg(rows.map((x) => x.model_reference_delta_pp));
  return {
    n: rows.length,
    accuracy: rounded(observed),
    mean_model_probability: rounded(modelP),
    mean_reference_probability: rounded(referenceP),
    observed_rate: rounded(observed),
    calibration_gap_model_pp: rounded((observed - modelP) * 100, 3),
    brier_model: rounded(modelBrier),
    brier_reference: rounded(referenceBrier),
    brier_diff_model_minus_reference: rounded(modelBrier - referenceBrier),
    mean_delta_pp: rounded(delta, 3),
  };
}

function grouped(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, xs]) => [key, groupSummary(xs)]),
  );
}

export function summarizeEvaluation(rows) {
  const statuses = {};
  for (const row of rows) statuses[row.status] = (statuses[row.status] ?? 0) + 1;
  const resolved = rows.filter((x) => x.status === 'resolved');
  const pending = rows.filter((x) => x.status === 'pending');

  return {
    evaluator_version: EVALUATOR_VERSION,
    calibration_version: CALIBRATION_VERSION,
    total_canonical: rows.length,
    resolved: resolved.length,
    pending: pending.length,
    invalid_or_integrity: rows.length - resolved.length - pending.length,
    statuses,
    milestone: readingMilestone(resolved.length),
    global: groupSummary(resolved),
    by_delta_band: grouped(resolved, (x) => x.delta_band ?? 'unknown'),
    by_probability_band: grouped(resolved, (x) => x.probability_band ?? 'unknown'),
    by_cohort_date: grouped(resolved, (x) => String(x.observed_at ?? '').slice(0, 10) || 'unknown'),
  };
}

export async function runProspectiveEvaluator({ fetchImpl } = {}) {
  const canonical = await seleccionar(
    CANONICAL_TABLE,
    `?select=match_id,calibration_version,observed_at,juego,pick_side,pick_team_id,model_probability,market_probability_devig,model_market_delta_pp,delta_band&calibration_version=eq.${CALIBRATION_VERSION}&order=match_id.asc`,
    { fetchImpl },
  );

  if (!canonical.length) return { rows: [], summary: summarizeEvaluation([]) };

  const wanted = new Set(canonical.map((x) => String(x.match_id)));
  const predictions = await seleccionar(
    'eslo_predicciones',
    '?select=match_id,equipo_a,equipo_b,resultado_real,calificada_en&order=match_id.asc',
    { fetchImpl },
  );
  const byId = new Map(predictions.filter((x) => wanted.has(String(x.match_id))).map((x) => [String(x.match_id), x]));
  const rows = canonical.map((obs) => scoreObservation(obs, byId.get(String(obs.match_id))));
  return { rows, summary: summarizeEvaluation(rows) };
}
