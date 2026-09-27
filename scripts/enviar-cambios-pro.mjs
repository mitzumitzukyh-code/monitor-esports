// Envía a usuarios PRO cambios materiales de lectura en sus favoritos.
import { rpc } from '../datos/supabase.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { nombresParaPartidos } from '../salida/stars/catalogo.mjs';
import { despacharCambios } from '../salida/stars/credibilidad.mjs';

if (process.env.TELEGRAM_CAMBIOS_PRO !== 'true') {
  console.log('Cambios PRO desactivados (TELEGRAM_CAMBIOS_PRO distinto de true).');
} else {
  try {
    const r = await despacharCambios({
      accion: (p_accion,p_datos) => rpc('eslo_stars_credibilidad',{ p_accion,p_datos }),
      api: clienteTelegram({ token:process.env.TELEGRAM_BOT_TOKEN, test:process.env.TELEGRAM_TEST_ENV === 'true' }),
      nombresPartidos:nombresParaPartidos,
    });
    console.log(`Cambios PRO: ${r.cambios} cambios, ${r.enviados} enviados, ${r.omitidos} omitidos, ${r.fallidos} fallidos.`);
    if (r.fallidos) process.exitCode=1;
  } catch {
    console.error('No se completó el envío de cambios PRO. Revisar migración y configuración.');
    process.exitCode=1;
  }
}
