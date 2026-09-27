// Resumen diario, sólo PRO vigente. Desactivado por variable.
import { almacenStars } from '../salida/stars/persistencia.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { despacharResumen } from '../salida/stars/engagement.mjs';

if (process.env.TELEGRAM_ENGAGEMENT_PRO !== 'true') {
  console.log('Engagement PRO desactivado (TELEGRAM_ENGAGEMENT_PRO distinto de true).');
} else {
  try {
    const almacen = almacenStars();
    const r = await despacharResumen({
      accion: almacen.engagement,
      api: clienteTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, test: process.env.TELEGRAM_TEST_ENV === 'true' }),
    });
    console.log(`Resumen PRO: ${r.enviados} enviados, ${r.omitidos} omitidos, ${r.fallidos} fallidos.`);
    if (r.fallidos) process.exitCode = 1;
  } catch {
    console.error('No se completó el resumen diario PRO. Revisar migración y configuración.');
    process.exitCode = 1;
  }
}
