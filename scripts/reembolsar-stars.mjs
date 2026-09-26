import { seleccionar, rpc } from '../datos/supabase.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';
import { prepararReembolso } from '../salida/stars/reembolsar.mjs';

try {
  const cargo = process.argv.find((a) => a.startsWith('--cargo='))?.slice(8);
  if (!cargo || cargo.length > 512) throw Error('Indicar --cargo=ID_TELEGRAM_DEL_RECIBO');
  const pago = (await seleccionar('eslo_stars_pagos',
    `?select=*&telegram_payment_charge_id=eq.${encodeURIComponent(cargo)}&limit=1`))[0];
  const r = await prepararReembolso({ cargo, pago, confirmar: process.argv.includes('--confirmar'),
    api: clienteTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, test: process.env.TELEGRAM_TEST_ENV === 'true' }),
    accion: (a, d) => rpc('eslo_stars', { p_accion: a, p_datos: d }) });
  console.log(r.estado === 'revision'
    ? `REVISIÓN: usuario ${r.usuario}, ${r.stars} Stars. No se realizó ningún reembolso. Revisar el caso antes de --confirmar.`
    : r.estado === 'ya_reembolsado' ? 'El recibo ya está reembolsado. No se hizo otro cargo.' : 'Reembolso y acceso conciliados.');
} catch (e) { console.error(e.message); process.exitCode = 1; }
