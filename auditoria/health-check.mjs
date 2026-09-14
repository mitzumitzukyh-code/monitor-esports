import { readFile, stat } from 'node:fs/promises';
import { seleccionar } from '../datos/supabase.mjs';

const HORA = 3600 * 1000;
const ahora = Date.now();
const iso24h = new Date(ahora - 24 * HORA).toISOString();

const predicciones = await seleccionar(
  'eslo_predicciones',
  '?select=*&order=match_id.asc',
);
const cuotas24h = await seleccionar(
  'eslo_cuotas',
  `?select=*&capturado_en=gte.${encodeURIComponent(iso24h)}&order=capturado_en.asc,match_id.asc`,
);

const inicioMs = (p) => new Date(p.inicio_programado).getTime();
const creadaMs = (p) => new Date(p.creada_en ?? 0).getTime();
const calificadaMs = (p) => new Date(p.calificada_en ?? 0).getTime();
const capturaMs = (c) => new Date(c.capturado_en).getTime();
const tierAvisable = (p) => ['s', 'a'].includes(String(p.tier ?? '').toLowerCase());

const futuras24h = predicciones.filter((p) => {
  const t = inicioMs(p);
  return !p.resultado_real && Number.isFinite(t) && t > ahora && t <= ahora + 24 * HORA;
});
const cuotas2h = cuotas24h.filter((c) => capturaMs(c) >= ahora - 2 * HORA);
const matchesConCuota2h = new Set(cuotas2h.map((c) => Number(c.match_id)));
const futurasConCuota = futuras24h.filter((p) => matchesConCuota2h.has(Number(p.match_id)));

const vencidas6a48h = predicciones.filter((p) => {
  if (p.resultado_real) return false;
  const edad = ahora - inicioMs(p);
  return Number.isFinite(edad) && edad > 6 * HORA && edad <= 48 * HORA;
});
const vencidas24h = predicciones.filter((p) => !p.resultado_real && ahora - inicioMs(p) > 24 * HORA);

const predPorId = new Map(predicciones.map((p) => [Number(p.match_id), p]));
let cuotasEquiposAjenos = 0;
const matchesEquiposAjenos = new Set();
for (const c of cuotas24h) {
  const p = predPorId.get(Number(c.match_id));
  if (!p) continue;
  const mismos = new Set([Number(p.equipo_a), Number(p.equipo_b)]);
  if (!mismos.has(Number(c.equipo_a)) || !mismos.has(Number(c.equipo_b))) {
    cuotasEquiposAjenos++;
    matchesEquiposAjenos.add(Number(c.match_id));
  }
}

// Silencio de canales: sólo consideramos filas con al menos 30 minutos de
// antigüedad, para no marcar como fallo una predicción que acaba de nacer en
// una corrida que todavía está enviando mensajes.
const antiguas30m = (p) => ahora - creadaMs(p) > 30 * 60 * 1000;
const resultadosAntiguos30m = (p) => ahora - calificadaMs(p) > 30 * 60 * 1000;
const pendientesDiscordPred = futuras24h.filter((p) => tierAvisable(p) && antiguas30m(p) && !p.avisado_prediccion_en);
const pendientesTelegramPred = futuras24h.filter((p) => tierAvisable(p) && antiguas30m(p) && !p.avisado_telegram_prediccion_en);
const calificadasRecientes = predicciones.filter((p) => p.resultado_real && calificadaMs(p) >= ahora - 24 * HORA);
const pendientesDiscordRes = calificadasRecientes.filter((p) => tierAvisable(p) && resultadosAntiguos30m(p) && !p.avisado_resultado_en);
const pendientesTelegramRes = calificadasRecientes.filter((p) => tierAvisable(p) && resultadosAntiguos30m(p) && !p.avisado_telegram_resultado_en);

const errores = [];
const avisos = [];

if (futuras24h.length >= 3 && cuotas2h.length === 0) {
  errores.push(`${futuras24h.length} partidos próximos pero 0 cuotas capturadas en 2h`);
}
if (futuras24h.length >= 5 && futurasConCuota.length === 0) {
  errores.push(`${futuras24h.length} partidos próximos y ninguno tiene cuota reciente`);
} else if (futuras24h.length >= 5 && futurasConCuota.length / futuras24h.length < 0.5) {
  avisos.push(`cobertura de cuotas baja: ${futurasConCuota.length}/${futuras24h.length} partidos próximos`);
}
if (vencidas6a48h.length > 20) {
  errores.push(`${vencidas6a48h.length} predicciones de 6-48h siguen sin calificar`);
}
if (matchesEquiposAjenos.size > 0) {
  avisos.push(`${cuotasEquiposAjenos} cuotas con equipos ajenos en ${matchesEquiposAjenos.size} matches durante 24h`);
}
if (pendientesDiscordPred.length > 3 || pendientesDiscordRes.length > 3) {
  errores.push(`Discord atrasado: ${pendientesDiscordPred.length} picks + ${pendientesDiscordRes.length} resultados sin avisar >30m`);
} else if (pendientesDiscordPred.length || pendientesDiscordRes.length) {
  avisos.push(`Discord pendiente: ${pendientesDiscordPred.length} picks + ${pendientesDiscordRes.length} resultados`);
}
if (pendientesTelegramPred.length > 3 || pendientesTelegramRes.length > 3) {
  errores.push(`Telegram atrasado: ${pendientesTelegramPred.length} picks + ${pendientesTelegramRes.length} resultados sin avisar >30m`);
} else if (pendientesTelegramPred.length || pendientesTelegramRes.length) {
  avisos.push(`Telegram pendiente: ${pendientesTelegramPred.length} picks + ${pendientesTelegramRes.length} resultados`);
}

// Si el workflow corrió el generador antes de este health-check, valida que
// no haya producido un archivo vacío/truncado. No sustituye la consulta real a
// Supabase de arriba; es una segunda barrera contra un panel técnicamente verde.
try {
  const ruta = new URL('../salida/web/index.html', import.meta.url);
  const info = await stat(ruta);
  const html = await readFile(ruta, 'utf8');
  if (info.size < 10_000 || !html.includes('<!--ZONA:')) {
    errores.push(`panel generado sospechoso: ${info.size} bytes o sin zonas`);
  }
} catch (e) {
  errores.push(`panel no verificable: ${e.message}`);
}

console.log('# HEALTH CHECK · MONITOR ESPORTS');
console.log(`predicciones=${predicciones.length} · futuras24h=${futuras24h.length}`);
console.log(`cuotas24h=${cuotas24h.length} · cuotas2h=${cuotas2h.length} · cobertura=${futurasConCuota.length}/${futuras24h.length}`);
console.log(`pendientes>24h=${vencidas24h.length} · pendientes6-48h=${vencidas6a48h.length}`);
console.log(`discord pendientes=${pendientesDiscordPred.length}+${pendientesDiscordRes.length} · telegram=${pendientesTelegramPred.length}+${pendientesTelegramRes.length}`);
console.log(`matching ajeno=${cuotasEquiposAjenos} filas/${matchesEquiposAjenos.size} matches`);
for (const a of avisos) console.log(`HEALTH_WARNING: ${a}`);
for (const e of errores) console.error(`HEALTH_ERROR: ${e}`);

if (errores.length) process.exitCode = 1;
