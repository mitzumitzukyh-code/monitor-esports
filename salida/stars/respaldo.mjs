import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const TABLAS_RESPALDO = ['eslo_predicciones','eslo_stars_usuarios','eslo_stars_ordenes',
  'eslo_stars_pagos','eslo_stars_reembolsos','eslo_stars_incidencias'];
const llave = (valor) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(valor ?? '')) throw Error('Falta TELEGRAM_STARS_BACKUP_KEY de 32 bytes base64url');
  return Buffer.from(valor, 'base64url');
};
export function validarRespaldo(copia) {
  if (copia?.version !== 1 || !Number.isFinite(Date.parse(copia.capturado_en)) ||
    TABLAS_RESPALDO.some((t) => !Array.isArray(copia.tablas?.[t]))) throw Error('Respaldo incompleto');
  const usuarios = new Set(copia.tablas.eslo_stars_usuarios.map((u) => String(u.user_id)));
  const partidos = new Set(copia.tablas.eslo_predicciones.map((p) => String(p.match_id)));
  const ordenes = new Map(copia.tablas.eslo_stars_ordenes.map((o) => [o.payload, o]));
  for (const o of ordenes.values()) {
    if (!usuarios.has(String(o.user_id)) || (o.match_id != null && !partidos.has(String(o.match_id)))) throw Error('Referencia de orden ausente');
  }
  for (const p of copia.tablas.eslo_stars_pagos) {
    if (!usuarios.has(String(p.user_id)) || ordenes.get(p.payload)?.user_id != p.user_id) throw Error('Referencia de pago ausente');
  }
  return copia;
}
export function cifrarRespaldo(copia, clave) {
  validarRespaldo(copia);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', llave(clave), iv);
  cipher.setAAD(Buffer.from('eslo-stars-respaldo-v1'));
  const datos = Buffer.concat([cipher.update(gzipSync(JSON.stringify(copia))), cipher.final()]);
  return JSON.stringify({ version: 1, algoritmo: 'aes-256-gcm', iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), datos: datos.toString('base64') });
}
export function descifrarRespaldo(texto, clave) {
  try {
    const e = JSON.parse(texto);
    if (e.version !== 1 || e.algoritmo !== 'aes-256-gcm') throw Error();
    const cipher = createDecipheriv('aes-256-gcm', llave(clave), Buffer.from(e.iv, 'base64'));
    cipher.setAAD(Buffer.from('eslo-stars-respaldo-v1'));
    cipher.setAuthTag(Buffer.from(e.tag, 'base64'));
    const comprimido = Buffer.concat([cipher.update(Buffer.from(e.datos, 'base64')), cipher.final()]);
    return validarRespaldo(JSON.parse(gunzipSync(comprimido, { maxOutputLength: 67108864 }).toString('utf8')));
  } catch { throw Error('No se pudo verificar el respaldo: clave incorrecta, archivo alterado o incompleto'); }
}
// Sólo para recuperar en una base vacía revisada por el operador. No ejecuta SQL.
export function sqlRestauracion(copia) {
  validarRespaldo(copia);
  const literal = (s) => `'${s.replaceAll("'", "''")}'`;
  const filas = TABLAS_RESPALDO.flatMap((tabla) => copia.tablas[tabla].map((f) =>
    `insert into public.${tabla} select * from jsonb_populate_record(null::public.${tabla}, ${literal(JSON.stringify(f))}::jsonb);`));
  return ['begin;', ...filas, 'commit;'].join('\n');
}
