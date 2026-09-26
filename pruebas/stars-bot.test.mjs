import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { configuracionStars, VERSION_TERMINOS } from '../salida/stars/config.mjs';
import { crearServidorStars } from '../salida/stars/webhook.mjs';
import { clienteTelegram } from '../salida/stars/api.mjs';

const config = { habilitado: true, pro: 250, partido: 50, recurrente: true, soporte: '@soporte' };
const mensaje = (text, extra = {}) => ({ update_id: 123, message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, text, date: 1790440000, ...extra } });
function fixture(accion = async () => ({ ok: true, terminos_version: VERSION_TERMINOS })) {
  const llamadas = []; let lecturas = 0;
  const almacen = { accion, partidos: async () => [], prediccion: async () => { lecturas++; return { match_id: 20, juego: 'cs2', equipo_a: 1, equipo_b: 2, prob_a: 0.6, inicio_programado: '2026-09-27T15:00:00Z', motor: 'glicko2' }; }, historial: async () => [] };
  const api = async (metodo, datos) => { llamadas.push({ metodo, datos }); return 'https://t.me/$test'; };
  return { llamadas, almacen, api, lecturas: () => lecturas, bot: crearBotStars({ config, almacen, api }) };
}
test('PRO recurrente usa createInvoiceLink XTR, un precio y 30 días', async () => {
  const f = fixture(); await f.bot.procesar(mensaje('/pro'));
  const invoice = f.llamadas.find((c) => c.metodo === 'createInvoiceLink').datos;
  assert.equal(invoice.currency, 'XTR'); assert.equal(invoice.provider_token, '');
  assert.deepEqual(invoice.prices, [{ label: 'PRO 30 días', amount: 250 }]);
  assert.equal(invoice.subscription_period, 2592000); assert.ok(invoice.payload.length <= 128);
});
test('compra individual usa sendInvoice y factura vinculada al usuario', async () => {
  const acciones = []; const f = fixture(async (a, d) => { acciones.push({ a,d }); return { ok:true, terminos_version:VERSION_TERMINOS }; });
  await f.bot.procesar(mensaje('/comprar 20'));
  const invoice = f.llamadas.find((c) => c.metodo === 'sendInvoice').datos;
  assert.equal(invoice.currency, 'XTR'); assert.equal(invoice.chat_id, 10);
  assert.equal(invoice.prices[0].amount, 50); assert.equal(invoice.subscription_period, undefined);
  assert.equal(acciones.find((c) => c.a==='crear').d.user_id, 10);
});
test('PRO no recurrente factura pago único', async () => {
  const f=fixture(); const bot=crearBotStars({config:{...config,recurrente:false},almacen:f.almacen,api:f.api});
  await bot.procesar(mensaje('/pro')); assert.equal(f.llamadas[0].metodo,'sendInvoice');
});
test('sin consentimiento no hay factura', async () => {
  const f=fixture(async () => ({ok:true})); await f.bot.procesar(mensaje('/pro'));
  assert.ok(f.llamadas.every((c) => c.metodo === 'sendMessage'));
  assert.match(f.llamadas[0].datos.text,/Compras acceso/);
});
test('FREE nunca lee ni recibe contenido premium, también por callback', async () => {
  const f=fixture(async () => ({ok:false}));
  await f.bot.procesar(mensaje('/analisis 20'));
  await f.bot.procesar({update_id:124,callback_query:{id:'cb',from:{id:10},message:{chat:{id:10,type:'private'}},data:'analisis:20'}});
  assert.equal(f.lecturas(),0); assert.ok(f.llamadas.filter((c)=>c.metodo==='sendMessage').every((c)=>/requiere PRO/.test(c.datos.text)));
});
test('premium autorizado recibe informe protegido', async () => {
  const f=fixture(); await f.bot.procesar(mensaje('/analisis 20'));
  assert.equal(f.lecturas(),1); assert.equal(f.llamadas[0].datos.protect_content,true);
  assert.match(f.llamadas[0].datos.text,/Análisis completo/);
});
test('checkout fallido o base caída rechaza sin activar', async () => {
  for(const accion of [async()=>({error:'importe'}),async()=>{throw Error('caída');}]) {
    const f=fixture(accion); await f.bot.procesar({update_id:1,pre_checkout_query:{id:'q',from:{id:10},currency:'XTR',total_amount:250,invoice_payload:'x'}});
    assert.equal(f.llamadas[0].metodo,'answerPreCheckoutQuery'); assert.equal(f.llamadas[0].datos.ok,false);
  }
});
test('checkout válido responde y no otorga contenido', async () => {
  const f=fixture(); await f.bot.procesar({update_id:1,pre_checkout_query:{id:'q',from:{id:10},currency:'XTR',total_amount:250,invoice_payload:'x'}});
  assert.equal(f.llamadas.length,1); assert.equal(f.llamadas[0].datos.ok,true); assert.equal(f.lecturas(),0);
});
test('pago duplicado no genera segunda confirmación', async () => {
  const f=fixture(async()=>({ok:true,duplicado:true}));
  await f.bot.procesar(mensaje('',{successful_payment:{currency:'XTR',total_amount:250,invoice_payload:'x',telegram_payment_charge_id:'charge'}}));
  assert.equal(f.llamadas.length,0);
});
test('refund de servicio usa comprador del chat privado aunque lo emita el bot', async () => {
  let comprador; const f=fixture(async(a,d)=>{if(a==='reembolso')comprador=d.user_id;return {ok:true};});
  await f.bot.procesar(mensaje('',{from:{id:999,is_bot:true},refunded_payment:{currency:'XTR',total_amount:250,invoice_payload:'x',telegram_payment_charge_id:'charge'}}));
  assert.equal(comprador,10); assert.match(f.llamadas[0].datos.text,/Reembolso registrado/);
});
test('renovación que llega antes del primer recibo se reintenta', async () => {
  const f=fixture(async()=>({error:'falta_pago_inicial',reintentar:true}));
  await assert.rejects(f.bot.procesar(mensaje('',{successful_payment:{currency:'XTR',total_amount:250,invoice_payload:'x',telegram_payment_charge_id:'charge'}})));
});
test('no compras ni informes en grupos o chats ajenos', async () => {
  const f=fixture(); await f.bot.procesar(mensaje('/pro',{chat:{id:-1,type:'group'}}));
  await f.bot.procesar(mensaje('/analisis 20',{chat:{id:11,type:'private'}}));
  assert.equal(f.llamadas.length,0); assert.equal(f.lecturas(),0);
});
test('update subscription se persiste y no produce factura ni activación', async () => {
  const acciones=[]; const f=fixture(async(a,d)=>{acciones.push({a,d});return {ok:true};});
  await f.bot.procesar({update_id:1,subscription:{user:{id:10},invoice_payload:'x',state:'canceled'}});
  assert.equal(acciones[0].a,'suscripcion'); assert.equal(acciones[0].d.state,'canceled'); assert.equal(f.llamadas.length,0);
});
test('IDs manipulados no consultan ni crean órdenes', async () => {
  const f=fixture(); await f.bot.procesar(mensaje('/analisis 20&select=*'));
  assert.equal(f.lecturas(),0); assert.match(f.llamadas[0].datos.text,/Usa \/analisis ID/);
});
test('configuración deshabilitada por defecto y precios válidos obligatorios al activar', () => {
  assert.equal(configuracionStars({}).habilitado,false);
  assert.throws(()=>configuracionStars({TELEGRAM_STARS_ENABLED:'true'}));
  assert.throws(()=>configuracionStars({TELEGRAM_STARS_ENABLED:'true',TELEGRAM_PAY_SUPPORT:'@s',TELEGRAM_PRO_STARS:'10001'}));
});
test('API TEST usa entorno separado y no registra token en errores', async () => {
  let url; const api=clienteTelegram({token:'secreto',test:true},async(u)=>{url=u;return {ok:false,status:500,json:async()=>({ok:false})};});
  await assert.rejects(api('getMe',{}),/Telegram getMe: 500/); assert.match(url,/\/test\/getMe$/);
});
test('webhook autentica antes de procesar y reintenta fallos', async(t) => {
  let llamadas=0; const secreto='a'.repeat(32);
  const servidor=crearServidorStars({secreto,bot:{procesar:async()=>{llamadas++; throw Error('caída');}}});
  await new Promise((r)=>servidor.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise((r)=>servidor.close(r)));
  const url=`http://127.0.0.1:${servidor.address().port}/telegram`;
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403); assert.equal(llamadas,0);
  assert.equal((await fetch(url,{method:'POST',body:'{',headers:{'X-Telegram-Bot-Api-Secret-Token':secreto}})).status,400);
  assert.equal((await fetch(url,{method:'POST',body:'{"update_id":1}',headers:{'X-Telegram-Bot-Api-Secret-Token':secreto}})).status,500); assert.equal(llamadas,1);
});
