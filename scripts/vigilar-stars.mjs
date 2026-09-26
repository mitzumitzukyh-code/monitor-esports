import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { comprobarStars, notificarCambio } from '../salida/stars/vigilancia.mjs';
import { rpc } from '../datos/supabase.mjs';

const ruta = process.env.TELEGRAM_STARS_STATE_FILE ?? 'work/stars-estado.json';
const enviar = async (content) => {
  const destino = process.env.DISCORD_WEBHOOK_ERRORES;
  if (!destino) throw Error('Falta canal privado de errores');
  const r = await fetch(destino, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Error('Falló el envío al canal privado de errores');
};
try {
  if (process.argv.includes('--probar-alerta') || process.argv.includes('--fallo-respaldo')) {
    await enviar(process.argv.includes('--fallo-respaldo')
      ? '🔴 Falló el respaldo de pagos Telegram Stars. Revisar la ejecución de Operación Telegram Stars en GitHub Actions.'
      : '🧪 Prueba de vigilancia Telegram Stars: el canal de errores recibe avisos. Esta es una prueba; no se detectó una caída.');
    console.log('Aviso enviado al canal privado de errores.');
  } else {
    const url = process.env.TELEGRAM_WEBHOOK_URL;
    if (!url?.startsWith('https://') || !url.endsWith('/telegram')) throw Error('Falta URL HTTPS del receptor');
    let anterior = {}; try { anterior = JSON.parse(await readFile(ruta, 'utf8')); } catch {}
    const resultado = await comprobarStars({ url, api: clienteTelegram({ token: process.env.TELEGRAM_BOT_TOKEN }),
      diagnostico: () => rpc('eslo_stars_diagnostico', {}) });
    const estado = await notificarCambio(resultado, anterior, enviar);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, JSON.stringify(estado));
    console.log(resultado.fallos.length ? `Revisión fallida: ${resultado.fallos.join(', ')}.` : 'Receptor, autenticación, webhook y base de compras verificados.');
    if (resultado.fallos.length) process.exitCode = 1;
  }
} catch { console.error('No se completó la vigilancia. Revisar configuración y canal privado de errores.'); process.exitCode = 1; }
