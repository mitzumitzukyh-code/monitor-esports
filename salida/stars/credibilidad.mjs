import { esc } from '../telegram.mjs';
import { JUEGOS, fechaPartido, nombreEncuentro, zonaPublica } from './partidos.mjs';

const ORDEN_JUEGOS = ['cs2','dota2','lol','valorant'];

export function nivelConfianza(probA) {
  if (probA == null || probA === '') return null;
  const p = Number(probA);
  if (!Number.isFinite(p) || p < 0 || p > 1) return null;
  const favorito = Math.max(p, 1 - p);
  return favorito >= 0.70 ? 'Alta' : favorito >= 0.56 ? 'Media' : 'Baja';
}

const porcentaje = (aciertos, n) => n > 0
  ? (100 * Number(aciertos) / Number(n)).toFixed(1).replace('.', ',')
  : '—';

export function textoCalibracion(cal) {
  if (!cal?.ok || !Number.isInteger(Number(cal.n))) return '';
  const n = Number(cal.n), aciertos = Number(cal.aciertos ?? 0);
  const banda = String(cal.banda ?? '').toLowerCase();
  if (!n) return 'Calibración histórica de esta banda: todavía sin resultados.';
  if (n < 30) return `Calibración histórica de esta banda: muestra pequeña (n=${n}).`;
  return `Histórico de confianza ${banda}: ${porcentaje(aciertos,n)}% de acierto (n=${n}).`;
}

export function textoHistorial(datos) {
  const filas = Array.isArray(datos?.filas) ? datos.filas : [];
  const lineas = ['📊 <b>Historial verificable</b>'];
  let totalN = 0, totalA = 0;
  for (const juego of ORDEN_JUEGOS) {
    const grupo = filas.filter((f) => f.juego === juego);
    const n = grupo.reduce((s,f) => s + Number(f.n ?? 0), 0);
    const aciertos = grupo.reduce((s,f) => s + Number(f.aciertos ?? 0), 0);
    if (!n) continue;
    totalN += n; totalA += aciertos;
    lineas.push(`${JUEGOS[juego]}: ${aciertos}/${n} · ${porcentaje(aciertos,n)}%`);
  }
  if (!totalN) lineas.push('Aún no hay predicciones congeladas con resultado registrado.');
  else lineas.splice(1,0,`Total: ${totalA}/${totalN} · ${porcentaje(totalA,totalN)}%`,'');
  lineas.push('','🔒 Sólo cuenta la predicción congelada antes del partido; los fallos también se incluyen.');
  if (datos?.hasta) lineas.push(`Actualizado: ${fechaPartido(datos.hasta)} · ${zonaPublica(datos.hasta)}`);
  return lineas.join('\n');
}

export function mensajeCambio(cambio, mapa = new Map()) {
  const anterior = Number(cambio?.anterior_prob_a);
  const nueva = Number(cambio?.nueva_prob_a);
  if (![anterior,nueva].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return null;
  const nombreA = mapa.get(`${cambio.juego}:${cambio.equipo_a}`)?.nombre ?? `#${cambio.equipo_a}`;
  const nombreB = mapa.get(`${cambio.juego}:${cambio.equipo_b}`)?.nombre ?? `#${cambio.equipo_b}`;
  const favAntes = anterior >= 0.5 ? nombreA : nombreB;
  const favAhora = nueva >= 0.5 ? nombreA : nombreB;
  const probAntes = Math.round(Math.max(anterior,1-anterior)*100);
  const probAhora = Math.round(Math.max(nueva,1-nueva)*100);
  const giro = favAntes !== favAhora
    ? `El favorito del modelo cambió: <b>${esc(favAntes)}</b> → <b>${esc(favAhora)}</b>.`
    : `<b>${esc(favAhora)}</b>: ${probAntes}% → ${probAhora}%.`;
  return [
    '🔔 <b>Cambio en un favorito</b>',
    `${esc(JUEGOS[cambio.juego] ?? cambio.juego)} · ${esc(nombreEncuentro(cambio,mapa))}`,
    giro,
    `Partido: ${fechaPartido(cambio.inicio_programado)} · ${zonaPublica(cambio.inicio_programado)}`,
    '',
    '🔒 La predicción oficial sigue congelada; este aviso muestra una lectura posterior del modelo.',
  ].join('\n');
}

export async function despacharCambios({ accion, api, nombresPartidos = async () => new Map(),
  pausa = () => new Promise((r) => setTimeout(r, 50)) }) {
  const { cambios = [] } = await accion('cambios_preparar', {});
  const resumen = { cambios: 0, enviados: 0, omitidos: 0, fallidos: 0 };
  for (const c of cambios) {
    const destinatarios = (c.destinatarios ?? []).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!destinatarios.length) continue;
    const mapa = await nombresPartidos([c]).catch(() => new Map());
    const texto = mensajeCambio(c,mapa);
    if (!texto) continue;
    resumen.cambios++;
    for (const user_id of destinatarios) {
      const datos = { cambio_id: c.cambio_id, user_id };
      const reserva = await accion('cambio_reservar',datos);
      if (!reserva.ok) { resumen.omitidos++; continue; }
      try {
        await api('sendMessage',{
          chat_id:user_id,text:texto,parse_mode:'HTML',
          link_preview_options:{is_disabled:true},protect_content:true,
        });
        await accion('cambio_confirmar',datos);
        resumen.enviados++;
      } catch (e) {
        await accion(/: (400|403)$/.test(String(e?.message)) ? 'cambio_descartar' : 'cambio_liberar',datos);
        resumen.fallidos++;
      }
      await pausa();
    }
  }
  return resumen;
}
