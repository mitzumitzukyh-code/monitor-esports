import { rpc } from '../datos/supabase.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { nombresParaPartidos } from '../salida/stars/catalogo.mjs';
import { despacharCambiosModelo } from '../salida/stars/cambios.mjs';

if (process.env.TELEGRAM_CAMBIOS_PRO !== 'true') {
  console.log('Cambios PRO desactivados.');
} else {
  try {
    const r=await despacharCambiosModelo({
      accion:(p_accion,p_datos)=>rpc('eslo_stars_cambios',{p_accion,p_datos}),
      api:clienteTelegram({token:process.env.TELEGRAM_BOT_TOKEN,test:process.env.TELEGRAM_TEST_ENV==='true'}),
      nombresPartidos:nombresParaPartidos,
    });
    console.log(`Cambios PRO: ${r.cambios} cambios, ${r.enviados} enviados, ${r.omitidos} omitidos, ${r.fallidos} fallidos.`);
    if(r.fallidos) process.exitCode=1;
  } catch {
    console.error('No se completó el envío de cambios PRO.');
    process.exitCode=1;
  }
}
