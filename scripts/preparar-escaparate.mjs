import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seleccionar } from '../datos/supabase.mjs';
import { datosDeEquipos } from '../datos/juegos/bo3.mjs';
import { almacenStars } from '../salida/stars/persistencia.mjs';
import { informePremium } from '../salida/stars/informe.mjs';
import { calcularMetricas, NOMBRE_JUEGO } from '../salida/discord-esports.mjs';
import { configuracionStars } from '../salida/stars/config.mjs';

const argumento = (nombre, defecto) => process.argv.find((a) => a.startsWith(`${nombre}=`))?.slice(nombre.length + 1) ?? defecto;
const desde = argumento('--desde', '2026-08-27'), hasta = argumento('--hasta', '2026-09-26');
if (![desde,hasta].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) || desde >= hasta) throw Error('Período inválido');
const config = configuracionStars();
const destino = resolve(argumento('--salida', 'work/escaparate'));
await mkdir(destino, { recursive: true });
const filas = await seleccionar('eslo_predicciones', `?select=*&inicio_programado=gte.${desde}T04:00:00Z` +
  `&inicio_programado=lt.${hasta}T04:00:00Z&order=inicio_programado.asc,match_id.asc`);
const resumen = [];
for (const juego of ['cs2','dota2','lol','valorant']) {
  const todas = filas.filter((p) => p.juego === juego);
  const evaluadas = todas.filter((p) => ['ganaA','ganaB'].includes(p.resultado_real) && p.prob_a != null &&
    Number.isFinite(Number(p.prob_a)) && Number(p.prob_a) >= 0 && Number(p.prob_a) <= 1 &&
    Date.parse(p.creada_en) < Date.parse(p.inicio_programado));
  const m = calcularMetricas(evaluadas.map((p) => ({ ...p, brier: (Number(p.prob_a) - (p.resultado_real === 'ganaA' ? 1 : 0)) ** 2 })));
  resumen.push({ juego, nombre: NOMBRE_JUEGO[juego], total: todas.length, evaluadas: evaluadas.length,
    pendientes: todas.filter((p) => !p.resultado_real).length, excluidas: todas.length - evaluadas.length - todas.filter((p) => !p.resultado_real).length,
    aciertos: m?.aciertos ?? 0, porcentaje: evaluadas.length ? (m.aciertos / evaluadas.length * 100).toFixed(1) : '—', brier: m?.brier ?? null });
}
const n = resumen.reduce((s, r) => s + r.evaluadas, 0), aciertos = resumen.reduce((s, r) => s + r.aciertos, 0);
const fecha = (d) => new Date(d).toLocaleDateString('es-VE', { timeZone:'America/Caracas', day:'numeric', month:'long', year:'numeric' });
const estadisticas = [
  '📊 HISTORIAL · Monitor eSports',
  `${fecha(`${desde}T04:00:00Z`)}–${fecha(`${hasta}T03:59:59Z`)} · hora de Venezuela`, '',
  ...resumen.map((r) => `${r.nombre}: ${r.aciertos}/${r.evaluadas} favoritos acertados (${r.porcentaje}%). ${r.pendientes} ${r.pendientes === 1 ? 'pendiente' : 'pendientes'}.`),
  '', `Total evaluado: ${n} partidos. ${aciertos} aciertos y ${n-aciertos} fallos.`,
  `Pendientes: ${resumen.reduce((s,r)=>s+r.pendientes,0)}. Excluidos: ${resumen.reduce((s,r)=>s+r.excluidas,0)}.`,
  '', 'Método: todas las predicciones guardadas del período, creadas antes del inicio programado y con ganador calificado. Favorito = equipo con mayor probabilidad; 50/50 se asigna a A, como en el monitor. Cada partido cuenta una vez. Los pendientes no cuentan como aciertos ni fallos.',
  'Modelo: Glicko-2, según las predicciones guardadas. No se seleccionaron sólo los partidos ganados ni se recalculó el motor.',
  'El porcentaje de aciertos no mide rentabilidad ni garantiza resultados futuros.',
  ...(resumen.some((r)=>r.juego==='valorant' && r.brier>0.25) ? ['Valorant sigue en evaluación: sus probabilidades no superaron la referencia 50/50 en Brier (error de probabilidad) durante este período.'] : []),
  'Historial y resultados: https://mitzumitzukyh-code.github.io/monitor-esports/',
].join('\n');
const almacen = almacenStars();
const p = await almacen.prediccion(Number(argumento('--ejemplo', '130728')));
if (!p || !p.resultado_real) throw Error('La muestra debe ser un partido terminado');
const [historial, equipos] = await Promise.all([almacen.historial(p), datosDeEquipos([p.equipo_a,p.equipo_b], { juego: p.juego })]);
const nombre = (id) => equipos.get(id)?.nombre ?? `#${id}`;
const resultado = nombre(p.resultado_real === 'ganaA' ? p.equipo_a : p.equipo_b);
const html = informePremium(p, historial, nombre);
const lineas = html.replace(/<[^>]+>/g, '').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').split('\n');
lineas[1] = lineas[1].split(' · ')[0]; // Muestra histórica: evita "hoy" al compartir otro día.
const texto = lineas.join('\n');
const muestra = ['🔬 MUESTRA DE INFORME PRO · partido ya finalizado', '', texto,
  '', `Fecha programada: ${new Date(p.inicio_programado).toLocaleString('es-VE', { timeZone:'America/Caracas' })}.`,
  `Predicción guardada: ${new Date(p.creada_en).toLocaleString('es-VE', { timeZone:'America/Caracas' })}.`,
  `Resultado posterior: ganó ${resultado}.`,
  'Esta muestra enseña los campos del informe. La forma histórica se consultó al preparar la muestra; usa partidos anteriores al inicio, con resultados disponibles ahora.',
  '', 'PRO añade contexto: rating, incertidumbre, forma previa y enfrentamientos. Consulta un ID con /analisis en el bot.',
  'https://t.me/monitor_esports_avisos_bot',
].join('\n');
const bienvenida = [
  '🎮 BIENVENIDO A MONITOR eSPORTS',
  'Análisis, predicciones y estadísticas de CS2, Dota 2, LoL y Valorant.', '',
  '🆓 FREE', 'Avisos, predicciones seleccionadas y resultados en este canal. Historial público para ver aciertos y fallos.', '',
  '⭐ PRO', 'Informes privados de los partidos guardados: probabilidad del modelo, rating, incertidumbre, forma previa y enfrentamientos.',
  `${config.pro} Stars cada 30 días. Renovación automática mientras la suscripción siga activa. Puedes cancelarla con /cancelar y conservar el período pagado.`, '',
  `🔬 UN PARTIDO: ${config.partido} Stars`, 'Pago único para abrir el informe de ese partido. Sin renovación.', '',
  '👉 EMPIEZA AQUÍ', 'https://t.me/monitor_esports_avisos_bot',
  'Pulsa START → /planes. /partidos muestra los ID y /analisis ID abre el informe.', '',
  `Soporte de compras: ${config.soporte}. Envíanos el recibo si tienes un problema de acceso.`,
  'Condiciones: /terms · Mi acceso: /estado · Ayuda: /paysupport.', '',
  'Son estimaciones estadísticas; los resultados pueden diferir. El historial pasado no garantiza resultados futuros.',
].join('\n');
for (const [archivo, contenido] of [['01-Mensaje-fijado.txt',bienvenida],['02-Muestra-PRO.txt',muestra],['03-Historial-real.txt',estadisticas]]) {
  await writeFile(resolve(destino, archivo), contenido + '\n');
}
await writeFile(resolve(destino,'Datos-verificables.json'), JSON.stringify({ preparado_en:new Date().toISOString(), desde, hasta_exclusivo:hasta,
  zona:'America/Caracas', resumen, muestra:{ prediccion:p, historial, nombres:Object.fromEntries([...equipos].map(([id,t])=>[id,t.nombre])) } }, null, 2));
console.log(`Materiales guardados. ${n} partidos evaluados; precios ${config.pro}/${config.partido}. No se publicó en Telegram.`);
