// Prueba la migración y RPC reales con Postgres local (WASM), sin credenciales.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { VERSION_TERMINOS } from '../salida/stars/config.mjs';

let db; let secuencia=1000;
const ahora=()=>Math.floor(Date.now()/1000);
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.eslo_predicciones(match_id bigint primary key);
    insert into public.eslo_predicciones values (20),(21);
    grant usage on schema public to anon,authenticated,service_role;
    grant select on public.eslo_predicciones to service_role;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260926172512_telegram_stars.sql',import.meta.url),'utf8'));
});
after(async()=>db?.close());
const accion=async(a,d)=>(await db.query('select public.eslo_stars($1,$2::jsonb) as r',[a,JSON.stringify(d)])).rows[0].r;
async function orden({recurrente=false,producto='pro',user_id=++secuencia,amount=250,match_id=null}={}) {
  const payload=`orden-${++secuencia}`;
  await accion('terminos',{user_id,version:VERSION_TERMINOS});
  const datos={user_id,payload,producto,amount,recurrente,match_id,terminos_version:VERSION_TERMINOS};
  assert.equal((await accion('crear',datos)).ok,true);
  const compra={user_id,payload,currency:'XTR',total_amount:amount,telegram_payment_charge_id:`cargo-${++secuencia}`,
    provider_payment_charge_id:'',update_id:++secuencia,date:ahora(),is_recurring:recurrente,is_first_recurring:recurrente,
    ...(recurrente?{subscription_expiration_date:ahora()+2592000}:{})};
  return {datos,compra,aprobar:()=>accion('aprobar',{...compra,precheckout_id:`q-${payload}`})};
}
test('pago único: primero FREE, checkout no activa, compra activa y persiste recibo',async()=>{
  const o=await orden();
  assert.equal((await accion('estado',o.datos)).premium,false);
  assert.equal((await o.aprobar()).ok,true);
  assert.equal((await accion('estado',o.datos)).premium,false);
  const r=await accion('pago',o.compra); assert.equal(r.ok,true);
  assert.equal((await accion('estado',o.datos)).premium,true);
  const p=(await db.query('select * from eslo_stars_pagos where telegram_payment_charge_id=$1',[o.compra.telegram_payment_charge_id])).rows[0];
  assert.equal(p.currency,'XTR'); assert.equal(p.amount,250); assert.ok(p.activado_en); assert.ok(p.expira_en); assert.equal(p.provider_payment_charge_id,'');
});
test('reintentos simultáneos y distintos update_id conservan una sola activación',async()=>{
  const o=await orden(); await o.aprobar();
  const r=await Promise.all([accion('pago',o.compra),accion('pago',o.compra),accion('pago',{...o.compra,update_id:++secuencia})]);
  assert.equal(r.filter((x)=>x.duplicado).length,2);
  const estado=await accion('estado',o.datos);
  assert.equal(Date.parse(estado.expira_en)/1000,o.compra.date+2592000);
  assert.equal((await db.query('select count(*)::int as n from eslo_stars_pagos where user_id=$1',[o.datos.user_id])).rows[0].n,1);
});
test('rechaza importe, moneda, usuario y payload manipulados en checkout y pago',async()=>{
  const o=await orden(); await o.aprobar();
  for(const cambio of [{total_amount:1},{currency:'USD'},{user_id:++secuencia},{payload:'inventado'}]) {
    assert.ok((await accion('aprobar',{...o.compra,...cambio,precheckout_id:'malo'})).error);
    assert.ok((await accion('pago',{...o.compra,...cambio})).error);
  }
  assert.equal((await accion('estado',o.datos)).premium,false);
});
test('sin checkout aprobado ningún recibo activa PRO',async()=>{
  const o=await orden(); assert.equal((await accion('pago',o.compra)).error,'sin_checkout');
});
test('cambio de precio no modifica el importe de órdenes ya emitidas',async()=>{
  const o=await orden({amount:125}); await o.aprobar();
  assert.equal((await accion('pago',{...o.compra,total_amount:250})).error,'importe');
  assert.equal((await accion('pago',o.compra)).ok,true);
});
test('dos checkout distintos o un segundo cargo de pago único no activan dos veces',async()=>{
  const o=await orden(); await o.aprobar();
  assert.equal((await accion('aprobar',{...o.compra,precheckout_id:'otro'})).error,'checkout_duplicado');
  await accion('pago',o.compra);
  assert.equal((await accion('pago',{...o.compra,telegram_payment_charge_id:'otro-cargo',update_id:++secuencia})).error,'orden_pagada');
});
test('factura expirada rechaza checkout; fallo de envío invalida factura',async()=>{
  const o=await orden(); await db.query("update eslo_stars_ordenes set vence_en=now()-interval '1 second' where payload=$1",[o.datos.payload]);
  assert.equal((await o.aprobar()).error,'vencida');
  const f=await orden(); await accion('fallo_factura',f.datos); assert.equal((await f.aprobar()).error,'vencida');
});
test('expiración cierra acceso y permite otra compra',async()=>{
  const o=await orden(); await o.aprobar(); await accion('pago',{...o.compra,date:ahora()-2678400});
  assert.equal((await accion('estado',o.datos)).premium,false);
  assert.equal((await accion('acceso',{...o.datos,match_id:20})).ok,false);
  const nueva=await orden({user_id:o.datos.user_id}); await nueva.aprobar(); await accion('pago',nueva.compra);
  assert.equal((await accion('estado',o.datos)).premium,true);
});
test('renovación usa expiración Telegram y actualizaciones fuera de orden nunca la acortan',async()=>{
  const o=await orden({recurrente:true}); await o.aprobar(); await accion('pago',o.compra);
  const renovar={...o.compra,update_id:++secuencia,telegram_payment_charge_id:`renovar-${secuencia}`,is_first_recurring:false,
    date:o.compra.date+2592000,subscription_expiration_date:o.compra.date+5184000};
  await accion('pago',renovar);
  const posterior={...renovar,date:renovar.date+2592000,subscription_expiration_date:renovar.subscription_expiration_date+2592000,
    update_id:++secuencia,telegram_payment_charge_id:`posterior-${secuencia}`};
  await accion('pago',posterior);
  await accion('pago',{...renovar,update_id:++secuencia,telegram_payment_charge_id:`atrasado-${secuencia}`});
  assert.equal(Date.parse((await accion('estado',o.datos)).expira_en)/1000,posterior.subscription_expiration_date);
});
test('renovación anterior al recibo inicial pide reintento y no crea acceso',async()=>{
  const o=await orden({recurrente:true}); await o.aprobar();
  assert.equal((await accion('pago',{...o.compra,is_first_recurring:false})).reintentar,true);
  assert.equal((await accion('estado',o.datos)).premium,false);
});
test('recurrencia y fecha inválidas se rechazan',async()=>{
  const o=await orden({recurrente:true}); await o.aprobar();
  assert.equal((await accion('pago',{...o.compra,is_recurring:false})).error,'recurrencia');
  assert.equal((await accion('pago',{...o.compra,subscription_expiration_date:null})).error,'expiracion');
});
test('cancelar renovación conserva acceso pagado y cargo inicial',async()=>{
  const o=await orden({recurrente:true}); await o.aprobar(); await accion('pago',o.compra);
  await accion('cancelar',o.compra); const s=await accion('estado',o.datos);
  assert.equal(s.premium,true); assert.equal(s.suscripciones[0].cancelada,true); assert.equal(s.suscripciones[0].cargo,o.compra.telegram_payment_charge_id);
});
test('compra individual sólo abre el partido comprado y no concede PRO',async()=>{
  const o=await orden({producto:'partido',match_id:20}); await o.aprobar(); await accion('pago',o.compra);
  assert.equal((await accion('estado',o.datos)).premium,false);
  assert.equal((await accion('acceso',{...o.datos,match_id:20})).ok,true);
  assert.equal((await accion('acceso',{...o.datos,match_id:21})).ok,false);
  assert.equal((await accion('acceso',{user_id:++secuencia,match_id:20})).ok,false);
});
test('eventos actuales de suscripción no activan sin pago ni revocan el período pagado',async()=>{
  const o=await orden({recurrente:true});
  await accion('suscripcion',{...o.datos,state:'active',update_id:20000});
  assert.equal((await accion('estado',o.datos)).premium,false);
  await o.aprobar(); await accion('pago',o.compra);
  for(const [state,update_id] of [['canceled',20001],['active',20002],['failed',20003]]) {
    await accion('suscripcion',{...o.datos,state,update_id});
    const s=await accion('estado',o.datos); assert.equal(s.premium,true); assert.equal(s.suscripciones[0].state,state);
    assert.equal(s.suscripciones[0].cancelada,state==='canceled');
  }
  assert.equal((await accion('suscripcion',{...o.datos,state:'active',update_id:20002})).duplicado,true);
  assert.equal((await accion('estado',o.datos)).suscripciones[0].state,'failed');
  assert.equal((await accion('suscripcion',{...o.datos,user_id:++secuencia,state:'active',update_id:20004})).error,'orden');
  await accion('pago',{...o.compra,is_first_recurring:false,date:o.compra.date+2592000,
    subscription_expiration_date:o.compra.date+5184000,update_id:++secuencia,telegram_payment_charge_id:`recuperado-${secuencia}`});
  assert.equal((await accion('estado',o.datos)).suscripciones[0].state,'active');
});
test('reembolso repetido retira acceso PRO e individual',async()=>{
  for(const opciones of [{},{producto:'partido',match_id:20}]) {
    const o=await orden(opciones); await o.aprobar(); await accion('pago',o.compra);
    await accion('reembolso',o.compra); await accion('reembolso',o.compra);
    assert.equal((await accion('acceso',{...o.datos,match_id:20})).ok,false);
  }
});
test('reembolso que llega primero impide activación del recibo atrasado',async()=>{
  const o=await orden(); await o.aprobar(); await accion('reembolso',o.compra);
  const r=await accion('pago',o.compra); assert.equal(r.reembolsado,true);
  assert.equal((await accion('estado',o.datos)).premium,false);
});
test('un charge_id o update_id no puede reutilizarse para otro usuario/recibo',async()=>{
  const a=await orden(); await a.aprobar(); await accion('pago',a.compra);
  const b=await orden(); await b.aprobar();
  assert.equal((await accion('pago',{...b.compra,telegram_payment_charge_id:a.compra.telegram_payment_charge_id})).error,'cargo');
  assert.equal((await accion('pago',{...b.compra,update_id:a.compra.update_id})).error,'update_duplicado');
});
test('anon y authenticated no pueden consultar pagos ni ejecutar RPC; service_role sí',async()=>{
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(db.query('select * from public.eslo_stars_pagos'),/permission denied/);
      await assert.rejects(accion('estado',{user_id:1000}),/permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.equal((await accion('estado',{user_id:1000})).premium,false); } finally { await db.exec('reset role'); }
});
test('flujo bot completo con persistencia real: factura, checkout, pago duplicado, acceso y refund',async()=>{
  const user_id=++secuencia; let payload; const mensajes=[];
  const bot=crearBotStars({config:{habilitado:true,pro:250,partido:50,recurrente:false,soporte:'@s'},
    almacen:{accion,prediccion:async()=>({match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,prob_a:0.6,motor:'glicko2',inicio_programado:'2026-09-27T15:00:00Z'}),historial:async()=>[]},
    api:async(m,d)=>{if(m==='sendInvoice')payload=d.payload;if(m==='sendMessage')mensajes.push(d);return true;}});
  const m=(text,extra={})=>({update_id:++secuencia,message:{date:ahora(),from:{id:user_id},chat:{id:user_id,type:'private'},text,...extra}});
  await accion('terminos',{user_id,version:VERSION_TERMINOS}); await bot.procesar(m('/pro')); assert.ok(payload);
  await bot.procesar({update_id:++secuencia,pre_checkout_query:{id:'q-e2e',from:{id:user_id},currency:'XTR',total_amount:250,invoice_payload:payload}});
  const p={currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:`e2e-${user_id}`,provider_payment_charge_id:''};
  const recibo=m('',{successful_payment:p}); await bot.procesar(recibo); await bot.procesar(recibo);
  assert.equal(mensajes.filter((d)=>/PRO activado/.test(d.text)).length,1);
  await bot.procesar(m('/analisis 20')); assert.equal(mensajes.at(-1).protect_content,true);
  await bot.procesar(m('',{refunded_payment:p})); await bot.procesar(m('/analisis 20'));
  assert.match(mensajes.at(-1).text,/requiere PRO/);
});
