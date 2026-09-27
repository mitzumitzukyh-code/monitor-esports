// Resumen diario privado del laboratorio eSports por Telegram.
// Separa por completo la observabilidad interna del bot comercial FREE/PRO.

import { fileURLToPath } from 'node:url';
import { seleccionar, upsert } from '../datos/supabase.mjs';
import { reunirFilas } from './resumen-global.mjs';
import { enviar, esc } from './telegram.mjs';

const CLAVE = 'resumen-global-telegram-lab';
const MINIMO = 275;

function diaCaracas(fecha) {
  return new Date(fecha.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function mensajeResumenTelegramLab(filas) {
  const lineas = ['📊 <b>Laboratorio eSports · estado de motores</b>', ''];
  for (const f of filas) {
    if (!f.n) {
      lineas.push(`• <b>${esc(f.nombre)}</b>: ${f.predichas} predichas · 0 calificadas`);
      continue;
    }
    const vs = `${f.vsBase > 0 ? '+' : ''}${(f.vsBase * 100).toFixed(0)}%`;
    const muestra = f.n >= MINIMO ? 'muestra suficiente' : `muestra en progreso (${f.n}/${MINIMO})`;
    lineas.push(
      `• <b>${esc(f.nombre)}</b>: ${f.predichas} predichas · ${f.n} calificadas · ` +
      `${f.aciertos}/${f.n} aciertos · Brier ${f.brier.toFixed(4)} · vs base ${vs} · ${muestra}`,
    );
  }
  lineas.push('', '<i>Interno · no reenviar. Negativo en “vs base” = mejor que la referencia ingenua.</i>');
  return lineas.join('\n');
}

export async function enviarResumenTelegramLab({ fetchImpl, fetchImplSupabase, ahora = new Date() } = {}) {
  if (process.env.TELEGRAM_LAB_PREDICTIONS_ENABLED !== 'true') {
    return { enviado: false, razon: 'laboratorio deshabilitado' };
  }
  const estado = await seleccionar('eslo_estado', `?select=*&juego=eq.${CLAVE}`, { fetchImpl: fetchImplSupabase });
  const hoy = diaCaracas(ahora);
  const ultimo = estado[0]?.ultimo_inicio ? diaCaracas(new Date(estado[0].ultimo_inicio)) : null;
  if (ultimo === hoy) return { enviado: false, razon: 'ya se envió hoy' };

  const filas = await reunirFilas({ fetchImplSupabase });
  const r = await enviar(mensajeResumenTelegramLab(filas), { fetchImpl });
  if (r.enviado) {
    await upsert('eslo_estado', [{ juego: CLAVE, ultimo_inicio: ahora.toISOString(), actualizado_en: ahora.toISOString() }],
      { onConflict: 'juego', fetchImpl: fetchImplSupabase });
  }
  return r;
}

const directo = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (directo) {
  const r = await enviarResumenTelegramLab();
  console.log(r.enviado ? 'resumen lab enviado' : 'no enviado — ' + r.razon);
}
