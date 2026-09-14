import { writeFileSync } from 'node:fs';
import {
  CALIBRATION_VERSION,
  SOURCE_GATE_VERSION,
  ejecutarCalibracion,
} from './market-calibration-shadow.mjs';

const { observaciones, resumen } = await ejecutarCalibracion();

const payload = {
  calibration_version: CALIBRATION_VERSION,
  source_gate_version: SOURCE_GATE_VERSION,
  generated_at: new Date().toISOString(),
  canonical_rule: 'usar la primera observacion cronologica status=ok por match_id entre artefactos',
  summary: {
    total: resumen.total,
    ok: resumen.ok,
    statuses: Object.fromEntries(resumen.estados),
    delta_bands: Object.fromEntries(resumen.bandas),
  },
  observations: observaciones,
};

writeFileSync('market-calibration-shadow.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const columnas = [
  'calibration_version',
  'source_gate_version',
  'observed_at',
  'match_id',
  'juego',
  'tier',
  'inicio_programado',
  'status',
  'pick_side',
  'pick_team_id',
  'model_probability',
  'provider_odds_pick',
  'best_observed_odds_pick',
  'market_probability_raw',
  'market_probability_devig',
  'market_overround',
  'model_market_delta_pp',
  'delta_band',
  'quote_captured_at',
  'quote_age_minutes',
  'quote_provider_id',
  'team_order_relation',
];

function csv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const lineas = [columnas.join(',')];
for (const obs of observaciones) {
  lineas.push(columnas.map((k) => csv(obs[k])).join(','));
}
writeFileSync('market-calibration-shadow.csv', `${lineas.join('\n')}\n`, 'utf8');

console.log(`# ${CALIBRATION_VERSION}`);
console.log(`source_gate=${SOURCE_GATE_VERSION}`);
console.log(`evaluadas=${resumen.total} calibrables=${resumen.ok}`);
for (const [status, count] of resumen.estados) console.log(`status.${status}=${count}`);
for (const [band, count] of resumen.bandas) console.log(`delta_band.${band}=${count}`);
console.log('canonical=primera observacion cronologica status=ok por match_id entre artefactos');
console.log('output=market-calibration-shadow.json,market-calibration-shadow.csv');

for (const obs of observaciones.filter((x) => x.status === 'ok')) {
  console.log(
    `OBS match=${obs.match_id} juego=${obs.juego} tier=${obs.tier} ` +
    `modelo=${(obs.model_probability * 100).toFixed(2)}% ` +
    `mercado_devig=${(obs.market_probability_devig * 100).toFixed(2)}% ` +
    `delta=${obs.model_market_delta_pp.toFixed(2)}pp ` +
    `band=${obs.delta_band} quote_age=${obs.quote_age_minutes.toFixed(1)}m`,
  );
}

if (resumen.total === 0) console.log('INFO no hay PASS futuros de quality-gate-v1 para observar.');
