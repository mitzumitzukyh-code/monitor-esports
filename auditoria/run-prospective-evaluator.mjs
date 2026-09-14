import { writeFileSync } from 'node:fs';
import { EVALUATOR_VERSION, runProspectiveEvaluator } from './prospective-evaluator.mjs';

const { rows, summary } = await runProspectiveEvaluator();

const payload = {
  generated_at: new Date().toISOString(),
  ...summary,
  rows,
};

writeFileSync('prospective-evaluator.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const columns = [
  'match_id',
  'juego',
  'status',
  'observed_at',
  'pick_side',
  'pick_team_id',
  'model_probability',
  'reference_probability',
  'model_reference_delta_pp',
  'delta_band',
  'probability_band',
  'resultado_real',
  'calificada_en',
  'outcome_pick',
  'pick_correct',
  'brier_model',
  'brier_reference',
  'brier_diff_model_minus_reference',
];

function csv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const lines = [columns.join(',')];
for (const row of rows) lines.push(columns.map((key) => csv(row[key])).join(','));
writeFileSync('prospective-evaluator.csv', `${lines.join('\n')}\n`, 'utf8');

const out = [];
out.push(`# ${EVALUATOR_VERSION}`);
out.push(`canonical=${summary.total_canonical}`);
out.push(`resolved=${summary.resolved}`);
out.push(`pending=${summary.pending}`);
out.push(`integrity_issues=${summary.invalid_or_integrity}`);
out.push(`milestone=${summary.milestone}`);
for (const [status, count] of Object.entries(summary.statuses)) out.push(`status.${status}=${count}`);
if (summary.resolved > 0) {
  out.push(`global.accuracy=${(summary.global.accuracy * 100).toFixed(2)}%`);
  out.push(`global.brier_model=${summary.global.brier_model.toFixed(6)}`);
  out.push(`global.brier_reference=${summary.global.brier_reference.toFixed(6)}`);
  out.push(`global.brier_diff_model_minus_reference=${summary.global.brier_diff_model_minus_reference.toFixed(6)}`);
}
out.push('interpretation=brier_diff<0 modelo mejor; brier_diff>0 referencia mejor');
out.push('scope=calibracion prospectiva; sin ROI, EV, stake ni decisiones de publicacion');

const text = `${out.join('\n')}\n`;
writeFileSync('prospective-evaluator.txt', text, 'utf8');
process.stdout.write(text);
