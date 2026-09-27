import { esc } from '../telegram.mjs';
import { JUEGOS, fechaPartido, nombreEncuentro, zonaPublica } from './partidos.mjs';

const porcentaje = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('es', { maximumFractionDigits: 1 }) : null;
const acierto = (r) => (Number(r.prob_a) >= 0.5) === (r.resultado_real === 'ganaA');

export function selloCongelado(p) {
  const guardada = Date.parse(p?.predicha_en);
  const inicio = Date.parse(p?.inicio_programado);
  if (Number.isFinite(guardada) && Number.isFinite(inicio) && guardada < inicio) {
    return `🔒 <b>Predicción congelada</b> · guardada ${esc(fechaPartido(p.predicha_en))} · ${zonaPublica(p.predicha_en)}`;
  }
  return '🔒 <b>Predicción congelada</b> · una vez registrada, esta predicción no se modifica.';
}

export function referenciaHistorica(metricas) {
  const b = metricas?.banda;
  const n = Number(b?.n ?? 0);
  const pct = porcentaje(b?.porcentaje);
  if (!n || pct == null) return '';
  const desde = Math.round(Number(b.desde ?? 0) * 100);
  const hasta = Math.round(Number(b.hasta ?? 0) * 100);
  return n >= 20
    ? `🎯 <b>Referencia histórica</b> · ${pct}% de acierto en ${n} predicciones con confianza ${desde}–${hasta}%.`
    : `🎯 <b>Referencia histórica</b> · banda ${desde}–${hasta}% con muestra pequeña (${n}); aún no se etiqueta como alta/media/baja.`;
}

export function textoHistorial(metricas) {
  const total = Number(metricas?.total ?? 0);
  const aciertos = Number(metricas?.aciertos ?? 0);
  const general = porcentaje(metricas?.porcentaje);
  const porJuego = new Map((metricas?.por_juego ?? []).map(x => [x.juego, x]));
  const lineas = [
    '📊 <b>Historial actualizado</b>',
    total ? `${aciertos}/${total} predicciones principales correctas · ${general}%` : 'Todavía no hay resultados evaluados.',
    '',
  ];
  for (const juego of ['cs2','dota2','lol','valorant']) {
    const x = porJuego.get(juego);
    const n = Number(x?.n ?? 0);
    lineas.push(`${JUEGOS[juego]}: ${n ? `${x.aciertos}/${n} · ${porcentaje(x.porcentaje)}%` : 'sin muestra'}`);
  }
  lineas.push('', 'Se cuentan sólo partidos con resultado registrado y probabilidad válida.');
  lineas.push('🔒 Las predicciones no se modifican después de guardarse.');
  lineas.push('El historial describe resultados observados; no garantiza resultados futuros.');
  return lineas.join('\n');
}

export function textoGratis(p, { mapa = new Map(), metricas = null } = {}) {
  const pa = Number(p?.prob_a);
  const valida = Number.isFinite(pa) && pa >= 0 && pa <= 1;
  const nombreA = mapa.get(`${p.juego}:${p.equipo_a}`)?.nombre ?? `#${p.equipo_a}`;
  const nombreB = mapa.get(`${p.juego}:${p.equipo_b}`)?.nombre ?? `#${p.equipo_b}`;
  const lineas = [
    '🎁 <b>Predicción FREE del día</b>',
    `<b>${esc(JUEGOS[p.juego] ?? p.juego)} · ${esc(nombreA)} vs. ${esc(nombreB)}</b>`,
    `${esc(fechaPartido(p.inicio_programado))} · ${zonaPublica(p.inicio_programado)}`,
    '',
    valida ? `${esc(nombreA)}: ${Math.round(pa * 100)}%\n${esc(nombreB)}: ${100 - Math.round(pa * 100)}%` : 'Probabilidad pendiente.',
    '',
    selloCongelado(p),
    referenciaHistorica(metricas),
    '',
    'Una predicción FREE por usuario y día. El informe completo permanece en PRO o compra individual.',
  ].filter(Boolean);
  return lineas.join('\n');
}

export function textoAlerta(p, mapa = new Map()) {
  return [
    '⏰ <b>Alerta previa PRO</b>',
    `<b>${esc(JUEGOS[p.juego] ?? p.juego)} · ${esc(nombreEncuentro(p, mapa))}</b>`,
    `${esc(fechaPartido(p.inicio_programado))} · ${zonaPublica(p.inicio_programado)}`,
    '',
    'Lo guardaste en Mis partidos. La predicción sigue congelada; esta alerta no la recalcula.',
  ].join('\n');
}

export function textoResumen(r) {
  const c = r?.conteos ?? {};
  const total = ['cs2','dota2','lol','valorant'].reduce((n,j) => n + Number(c[j] ?? 0), 0);
  const ayerN = Number(r?.ayer_total ?? 0), ayerA = Number(r?.ayer_aciertos ?? 0);
  const ayerPct = ayerN ? porcentaje(ayerA * 100 / ayerN) : null;
  return [
    '🗓️ <b>Resumen diario PRO</b>',
    `Hoy quedan ${total} partidos con predicción registrada.`,
    `CS2: ${Number(c.cs2 ?? 0)} · Dota 2: ${Number(c.dota2 ?? 0)} · LoL: ${Number(c.lol ?? 0)} · Valorant: ${Number(c.valorant ?? 0)}`,
    ayerN ? `Ayer: ${ayerA}/${ayerN} predicciones principales correctas · ${ayerPct}%` : 'Ayer: sin resultados evaluados.',
    '',
    'Usa /mios para tus favoritos y /partidos para ver los encuentros.',
  ].join('\n');
}

const falloPermanente = (e) => /: (400|403)$/.test(String(e?.message));

export async function despacharAlertas({ accion, cargarPredicciones, api, nombresPartidos = async () => new Map(),
  pausa = () => new Promise(r => setTimeout(r, 50)) }) {
  const { items = [] } = await accion('preparar_alertas', {});
  const ids = [...new Set(items.map(x => Number(x.match_id)).filter(Number.isSafeInteger))];
  const filas = ids.length ? await cargarPredicciones(ids) : [];
  const porId = new Map(filas.map(p => [Number(p.match_id), p]));
  const mapa = filas.length ? await nombresPartidos(filas).catch(() => new Map()) : new Map();
  const out = { enviados: 0, omitidos: 0, fallidos: 0 };
  for (const item of items) {
    const user_id = Number(item.user_id), match_id = Number(item.match_id), p = porId.get(match_id);
    if (!Number.isSafeInteger(user_id) || user_id <= 0 || !p) { out.omitidos++; continue; }
    const datos = { user_id, match_id };
    const reserva = await accion('reservar_alerta', datos);
    if (!reserva?.ok) { out.omitidos++; continue; }
    try {
      await api('sendMessage', { chat_id: user_id, text: textoAlerta(p, mapa), parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }, protect_content: true,
        reply_markup: { inline_keyboard: [[{ text: 'Abrir análisis', callback_data: `analisis:${match_id}` }],
          [{ text: '⭐ Mis partidos', callback_data: 'mios' }]] } });
      await accion('confirmar_alerta', datos); out.enviados++;
    } catch (e) {
      await accion(falloPermanente(e) ? 'descartar_alerta' : 'liberar_alerta', datos); out.fallidos++;
    }
    await pausa();
  }
  return out;
}

export async function despacharResumen({ accion, api, pausa = () => new Promise(r => setTimeout(r, 50)) }) {
  const preparado = await accion('preparar_resumen', {});
  const destinatarios = (preparado?.destinatarios ?? []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
  const out = { enviados: 0, omitidos: 0, fallidos: 0 };
  const texto = textoResumen(preparado);
  for (const user_id of destinatarios) {
    const datos = { user_id, dia: preparado.dia };
    const reserva = await accion('reservar_resumen', datos);
    if (!reserva?.ok) { out.omitidos++; continue; }
    try {
      await api('sendMessage', { chat_id: user_id, text: texto, parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }, protect_content: true,
        reply_markup: { inline_keyboard: [[{ text: '⭐ Mis partidos', callback_data: 'mios' },
          { text: 'Ver partidos', callback_data: 'partidos' }]] } });
      await accion('confirmar_resumen', datos); out.enviados++;
    } catch (e) {
      await accion(falloPermanente(e) ? 'descartar_resumen' : 'liberar_resumen', datos); out.fallidos++;
    }
    await pausa();
  }
  return out;
}

export { acierto };
