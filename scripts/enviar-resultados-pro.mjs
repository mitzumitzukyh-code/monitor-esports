// Envía a PRO vigente los resultados agrupados en ventanas de 30 minutos.
// Apagado salvo TELEGRAM_RESULTADOS_PRO=true; requiere la migración 20260926230000.
import { rpc } from '../datos/supabase.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { nombresParaPartidos } from '../salida/stars/catalogo.mjs';
import { despacharResultados } from '../salida/stars/resultados.mjs';

if (process.env.TELEGRAM_RESULTADOS_PRO !== 'true') {
  console.log('Resultados PRO desactivados (TELEGRAM_RESULTADOS_PRO distinto de true).');
} else {
  try {
    const r = await despacharResultados({
      accion: (p_accion, p_datos) => rpc('eslo_stars_resultados', { p_accion, p_datos }),
      api: clienteTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, test: process.env.TELEGRAM_TEST_ENV === 'true' }),
      nombresPartidos: nombresParaPartidos,
    });
    console.log(`Resultados PRO: ${r.bloques} bloques, ${r.enviados} enviados, ${r.omitidos} omitidos, ${r.fallidos} fallidos.`);
    if (r.fallidos) process.exitCode = 1;
  } catch {
    console.error('No se completó el envío de resultados PRO. Revisar migración y configuración.');
    process.exitCode = 1;
  }
}
