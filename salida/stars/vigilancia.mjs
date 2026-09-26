export async function comprobarStars({ url, api, diagnostico, fetchImpl = fetch }) {
  const fallos = [];
  const comprobar = async (nombre, fn) => { try { await fn(); } catch { fallos.push(nombre); } };
  await Promise.all([
    comprobar('Receptor HTTPS', async () => {
      const r = await fetchImpl(url.replace(/\/telegram$/, '/health'), { signal: AbortSignal.timeout(8000) });
      if (!r.ok || (await r.json()).ok !== true) throw Error();
      const cerrado = await fetchImpl(url, { method: 'POST', body: '{}', signal: AbortSignal.timeout(8000) });
      if (cerrado.status !== 403) throw Error();
    }),
    comprobar('Webhook Telegram', async () => {
      const w = await api('getWebhookInfo', {});
      // Sin cola, un error antiguo ya recuperado no dispara alerta. Una cola
      // con error sigue siendo un fallo aunque el último error tenga horas.
      if (w.url !== url || !Number.isInteger(w.pending_update_count) || w.pending_update_count < 0 ||
        (w.pending_update_count > 0 && w.last_error_date)) throw Error();
    }),
  ]);
  let datos;
  await comprobar('Base de compras', async () => { datos = await diagnostico(); if (datos.ok !== true) throw Error(); });
  return { fallos, ultimaIncidencia: datos?.ultima_incidencia ?? null };
}

export async function notificarCambio(resultado, anterior = {}, enviar) {
  const firma = resultado.fallos.slice().sort().join('|');
  const nueva = resultado.ultimaIncidencia && resultado.ultimaIncidencia !== anterior.ultimaIncidencia;
  const texto = firma && firma !== anterior.firma ? `🔴 Telegram Stars: revisar ${resultado.fallos.join(', ')}.`
    : !firma && anterior.firma ? '🟢 Telegram Stars: servicio recuperado.' : null;
  if (texto || nueva) {
    await enviar([texto, nueva ? '⚠️ Hay una nueva incidencia de pago. Revisar la tabla privada eslo_stars_incidencias.' : null].filter(Boolean).join('\n'));
  }
  return { firma, ultimaIncidencia: resultado.ultimaIncidencia ?? anterior.ultimaIncidencia ?? null };
}
