import { seleccionar, upsert } from '../datos/supabase.mjs';
import { CALIBRATION_VERSION } from './market-calibration-shadow.mjs';

export const CANONICAL_TABLE = 'eslo_market_calibration_shadow';

const clave = (x) => `${x.match_id}:${x.calibration_version ?? CALIBRATION_VERSION}`;

export function filtrarNuevasCanonicas(observaciones, existentes = []) {
  const vistas = new Set(existentes.map(clave));
  const nuevas = [];

  for (const obs of observaciones) {
    if (obs?.status !== 'ok') continue;
    const normalizada = {
      ...obs,
      calibration_version: obs.calibration_version ?? CALIBRATION_VERSION,
    };
    const k = clave(normalizada);
    if (vistas.has(k)) continue;
    vistas.add(k);
    nuevas.push(normalizada);
  }

  return nuevas;
}

export async function persistirCanonicas(observaciones, { fetchImpl } = {}) {
  const existentes = await seleccionar(
    CANONICAL_TABLE,
    `?select=match_id,calibration_version&calibration_version=eq.${CALIBRATION_VERSION}&order=match_id.asc`,
    { fetchImpl },
  );

  const nuevas = filtrarNuevasCanonicas(observaciones, existentes);
  if (!nuevas.length) {
    return { candidatas: observaciones.filter((x) => x?.status === 'ok').length, insertadas: 0, existentes: existentes.length };
  }

  // El workflow de calibración tiene concurrency serializada. Primero leemos
  // las claves existentes y sólo escribimos las nuevas para mantener semántica
  // first-write-wins. La PK (match_id, calibration_version) protege además la
  // tabla ante duplicados accidentales.
  await upsert(CANONICAL_TABLE, nuevas, {
    onConflict: 'match_id,calibration_version',
    fetchImpl,
  });

  return {
    candidatas: observaciones.filter((x) => x?.status === 'ok').length,
    insertadas: nuevas.length,
    existentes: existentes.length,
  };
}
