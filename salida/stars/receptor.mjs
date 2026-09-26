import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Adaptador Fetch para Supabase Edge. Reutiliza el mismo bot y persistencia.
export function crearReceptorStars({ secreto, bot, habilitado = false, registrarError = () => {} }) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secreto)) throw new Error('TELEGRAM_WEBHOOK_SECRET debe tener 32-256 caracteres seguros');
  const esperado = Buffer.from(secreto);
  const responder = (status, extra = {}) => Response.json({ ok: status === 200, ...extra }, { status });
  return async (req) => {
    const ruta = new URL(req.url).pathname;
    // La pasarela puede conservar o retirar /functions/v1.
    const prefijos = ['', '/esport-stars', '/functions/v1/esport-stars'];
    if (req.method === 'GET' && prefijos.some((p) => ruta === `${p}/health`)) {
      return responder(200, { compras_habilitadas: habilitado });
    }
    if (req.method !== 'POST' || !prefijos.some((p) => ruta === `${p}/telegram`)) return responder(404);
    const recibido = Buffer.from(req.headers.get('x-telegram-bot-api-secret-token') ?? '');
    if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) return responder(403);
    if (Number(req.headers.get('content-length')) > 65536) return responder(413);
    try {
      const lector = req.body?.getReader();
      if (!lector) return responder(400);
      const partes = []; let bytes = 0;
      while (true) {
        const { value, done } = await lector.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) { await lector.cancel(); return responder(413); }
        partes.push(Buffer.from(value));
      }
      let update;
      try { update = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return responder(400); }
      if (!update || typeof update !== 'object' || Array.isArray(update)) return responder(400);
      await bot.procesar(update);
      return responder(200);
    } catch {
      registrarError('Falló un update de Telegram; devolver 500 permite reintento.');
      return responder(500);
    }
  };
}
