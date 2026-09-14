// Punto de entrada CLI deliberadamente mínimo: importar este archivo SIEMPRE
// ejecuta una evaluación. La lógica vive en quality-gate.mjs para poder probarla
// sin tocar producción.

import { ejecutarQualityGate, GATE_VERSION } from './quality-gate.mjs';

const { decisiones, resumen } = await ejecutarQualityGate();

console.log(`# Quality Gate ${GATE_VERSION}`);
console.log(`evaluadas=${resumen.total} pass=${resumen.pass} reject=${resumen.reject}`);
for (const [reason, count] of resumen.reasons) console.log(`reject.${reason}=${count}`);
for (const d of decisiones.filter((x) => x.decision === 'pass')) {
  console.log(
    `PASS match=${d.match_id} juego=${d.juego} tier=${d.tier} ` +
    `conf=${(d.confidence * 100).toFixed(1)} rdMax=${d.rd_max?.toFixed?.(1) ?? d.rd_max} ` +
    `h=${d.hours_to_start?.toFixed?.(1) ?? d.hours_to_start}`,
  );
}

// Un runner que no evalúa nada cuando existen pendientes próximas es un silencio
// que merece verse. El workflow puede seguir verde si realmente no hay nada.
if (resumen.total === 0) console.log('INFO no hay predicciones pendientes dentro de las próximas 24h.');
