import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configuracionStars } from './config.mjs';
import { clienteTelegram } from './api.mjs';
import { almacenStars } from './persistencia.mjs';
import { crearBotStars } from './bot.mjs';
import { MARCA } from './marca.mjs';
import { nombresParaPartidos } from './catalogo.mjs';
import { datosDeEquipos } from '../../datos/juegos/bo3.mjs';

export function crearServidorStars({ secreto, bot, registrarError = () => {} }) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secreto)) throw new Error('TELEGRAM_WEBHOOK_SECRET debe tener 32-256 caracteres seguros');
  return createServer(async (req, res) => {
    const responder = (status) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: status === 200 })); };
    if (req.url === '/health' && req.method === 'GET') return responder(200);
    if (req.url !== '/telegram' || req.method !== 'POST') return responder(404);
    const recibido = Buffer.from(req.headers['x-telegram-bot-api-secret-token'] ?? '');
    const esperado = Buffer.from(secreto);
    if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) return responder(403);
    const partes = []; let bytes = 0;
    try {
      for await (const parte of req) {
        bytes += parte.length;
        if (bytes > 65536) return responder(413);
        partes.push(parte);
      }
      let update;
      try { update = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return responder(400); }
      if (!update || typeof update !== 'object' || Array.isArray(update)) return responder(400);
      await bot.procesar(update);
      responder(200);
    } catch {
      // No registrar cuerpos, secretos ni URLs que contienen el token del bot.
      registrarError('Falló un update de Telegram; devolver 500 permite reintento.');
      if (!res.headersSent) responder(500);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configuracionStars();
  if (!config.token || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan credenciales Telegram/Supabase');
  const bot = crearBotStars({ config, almacen: almacenStars(), api: clienteTelegram(config), marca: MARCA, nombresPartidos: nombresParaPartidos,
    nombres: (p) => datosDeEquipos([p.equipo_a,p.equipo_b], { juego: p.juego }) });
  const servidor = crearServidorStars({ secreto: config.secreto, bot, registrarError: console.error });
  servidor.requestTimeout = 15000;
  servidor.headersTimeout = 10000;
  servidor.listen(config.puerto, config.host, () => console.log('Receptor Telegram listo.'));
}
