// Alertas previas de favoritos, sólo PRO vigente. Desactivado por variable.
import { almacenStars } from '../salida/stars/persistencia.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { nombresParaPartidos } from '../salida/stars/catalogo.mjs';
import { despacharAlertas } from '../salida/stars/engagement.mjs';

if (process.env.TELEGRAM_ENGAGEMENT_PRO !== 'true') {
  console.log('Engagement PRO desactivado (TELEGRAM_ENGAGEMENT_PRO distinto de true).');
} else {
  try {
    const almacen = almacenStars();
    const r = await despacharAlertas({
      accion: almacen.engagement,
      cargarPredicciones: almacen.predicciones,
      api: clienteTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, test: process.env.TELEGRAM_TEST_ENV === 'true' }),
      nombresPartidos: nombresParaPartidos,
    });
    console.log(`Alertas PRO: ${r.enviados} enviadas, ${r.omitidos} omitidas, ${r.fallidos} fallidas.`);
    if (r.fallidos) process.exitCode = 1;
  } catch {
    console.error('No se completó el envío de alertas PRO. Revisar migración y configuración.');
    process.exitCode = 1;
  }
}
