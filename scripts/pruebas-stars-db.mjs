// Prueba la migración y RPC reales con Postgres local (WASM), sin credenciales.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { VERSION_TERMINOS } from '../salida/stars/config.mjs';
import { sqlRestauracion } from '../salida/stars/respaldo.mjs';
import { despacharResultados } from '../salida/stars/resultados.mjs';

let db; let secuencia=1000;
const ahora=()=>Math.floor(Date.now()/1000);
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.eslo_predicciones(match_id bigint primary key, juego text, equipo_a bigint, equipo_b bigint,
      prob_a numeric, resultado_real text, inicio_programado timestamptz, calificada_en timestamptz);
    insert into public.eslo_predicciones(match_id) values (20),(21);
    grant usage on schema public to anon,authenticated,service_role;
    grant select on public.eslo_predicciones to service_role;`);
  for (const m of ['20260926174331_telegram_stars','20260926181029_telegram_stars_operacion','20260926230000_telegram_stars_resultados'])
    await db.exec(await readFile(new URL(`../supabase/migrations/${m}.sql`,import.meta.url),'utf8'));
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

test('respaldo consistente conserva pagos y referencias y se restaura en base vacía',async()=>{
  const o=await orden({producto:'partido',match_id:20});
  o.compra.telegram_payment_charge_id="cargo-con-'comilla";
  await o.aprobar(); await accion('pago',o.compra);
  const copia=(await db.query('select public.eslo_stars_respaldo() as r')).rows[0].r;
  assert.ok(copia.tablas.eslo_stars_pagos.some(p=>p.telegram_payment_charge_id===o.compra.telegram_payment_charge_id));
  const destino=new PGlite();
  try {
    await destino.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.eslo_predicciones(match_id bigint primary key);');
    await destino.exec(await readFile(new URL('../supabase/migrations/20260926174331_telegram_stars.sql',import.meta.url),'utf8'));
    await destino.exec(sqlRestauracion(copia));
    const r=(await destino.query("select public.eslo_stars('acceso',$1::jsonb) as r",[JSON.stringify({user_id:o.datos.user_id,match_id:20})])).rows[0].r;
    assert.equal(r.ok,true);
    assert.equal((await destino.query('select count(*)::int as n from eslo_stars_pagos')).rows[0].n,copia.tablas.eslo_stars_pagos.length);
  } finally { await destino.close(); }
});

test('RPC de respaldo y diagnóstico no están disponibles a usuarios públicos',async()=>{
  for(const rol of ['anon','authenticated']) {
    await db.exec(`set role ${rol}`);
    try {
      await assert.rejects(db.query('select public.eslo_stars_respaldo()'),/permission denied/);
      await assert.rejects(db.query('select public.eslo_stars_diagnostico()'),/permission denied/);
    } finally { await db.exec('reset role'); }
  }
});
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
  await accion('terminos',{user_id,version:VERSION_TERMINOS}); await bot.procesar(m('/pagar_pro')); assert.ok(payload);
  await bot.procesar({update_id:++secuencia,pre_checkout_query:{id:'q-e2e',from:{id:user_id},currency:'XTR',total_amount:250,invoice_payload:payload}});
  const p={currency:'XTR',total_amount:250,invoice_payload:payload,telegram_payment_charge_id:`e2e-${user_id}`,provider_payment_charge_id:''};
  const recibo=m('',{successful_payment:p}); await bot.procesar(recibo); await bot.procesar(recibo);
  assert.equal(mensajes.filter((d)=>/PRO activado/.test(d.text)).length,1);
  await bot.procesar(m('/analisis 20')); assert.equal(mensajes.at(-1).protect_content,true);
  await bot.procesar(m('',{refunded_payment:p})); await bot.procesar(m('/analisis 20'));
  assert.match(mensajes.at(-1).text,/requiere PRO/);
});

for (const producto of ['pro','partido']) test(`v3 ${producto}: condiciones, checkout, recibo, reinicio, duplicado y reembolso con SQL real`,async()=>{
  const user_id=++secuencia, llamadas=[];let factura;
  const config={habilitado:true,pro:250,partido:50,recurrente:true,soporte:'@mitzukyhs'};
  const almacen={accion,partidos:async()=>[{match_id:20,juego:'cs2'}],
    ficha:async()=>({match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,inicio_programado:'2026-09-27T18:00:00Z'}),
    prediccion:async()=>({match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,prob_a:0.73,inicio_programado:'2026-09-27T18:00:00Z'}),historial:async()=>[]};
  const api=async(m,d)=>{llamadas.push({m,d});if(['sendInvoice','createInvoiceLink'].includes(m))factura=d;
    return m==='createInvoiceLink'?'https://t.me/$simulado':true;};
  let bot=crearBotStars({config,almacen,api});
  const mensaje=(text,extra={})=>({update_id:++secuencia,message:{date:ahora(),from:{id:user_id},chat:{id:user_id,type:'private'},text,...extra}});
  const callback=data=>({update_id:++secuencia,callback_query:{id:`cb-${secuencia}`,from:{id:user_id},message:{chat:{id:user_id,type:'private'}},data}});
  const ultimo=()=>llamadas.filter(c=>c.m==='sendMessage').at(-1).d;
  if(producto==='pro') {await bot.procesar(callback('pro'));assert.match(ultimo().text,/250 Stars/);
    assert.equal(factura,undefined);await bot.procesar(callback('condiciones:p'));}
  else await bot.procesar(mensaje('/comprar 20'));
  await bot.procesar(callback(`aceptar:${VERSION_TERMINOS}:${producto==='pro'?'p':'m20'}`));
  assert.equal(factura,undefined);assert.equal((await accion('estado',{user_id})).premium,false);
  assert.equal((await accion('acceso',{user_id,match_id:20})).ok,false);
  await bot.procesar(callback(producto==='pro'?'pagar_pro':'pagar_individual:20'));
  assert.ok(factura);assert.equal(factura.currency,'XTR');assert.equal(factura.prices[0].amount,producto==='pro'?250:50);
  assert.equal(factura.subscription_period,producto==='pro'?2592000:undefined);
  await bot.procesar({update_id:++secuencia,pre_checkout_query:{id:`q-${user_id}`,from:{id:user_id},currency:'XTR',
    total_amount:factura.prices[0].amount,invoice_payload:factura.payload}});
  assert.equal(llamadas.find(c=>c.m==='answerPreCheckoutQuery').d.ok,true);
  assert.equal((await accion('acceso',{user_id,match_id:20})).ok,false);
  const p={currency:'XTR',total_amount:factura.prices[0].amount,invoice_payload:factura.payload,
    telegram_payment_charge_id:`v3-${user_id}`,provider_payment_charge_id:'',
    ...(producto==='pro'?{is_recurring:true,is_first_recurring:true,subscription_expiration_date:ahora()+2592000}:{})};
  const recibo=mensaje('',{successful_payment:p}); await bot.procesar(recibo);
  const expira=(await accion('estado',{user_id})).expira_en;
  bot=crearBotStars({config,almacen,api}); // Otro proceso conserva el ledger.
  const antes=llamadas.length;await bot.procesar(recibo);assert.equal(llamadas.length,antes);
  assert.equal((await accion('estado',{user_id})).expira_en,expira);
  assert.equal((await accion('estado',{user_id})).premium,producto==='pro');
  for(let i=0;i<2;i++){await bot.procesar(mensaje('/analisis 20'));assert.equal(ultimo().protect_content,true);}
  assert.equal((await accion('acceso',{user_id,match_id:21})).ok,producto==='pro');
  if(producto==='pro') {
    await bot.procesar(mensaje('/cancelar'));assert.ok(llamadas.some(c=>c.m==='editUserStarSubscription'&&c.d.is_canceled));
    const s=await accion('estado',{user_id});assert.equal(s.premium,true);assert.equal(s.suscripciones[0].cancelada,true);
    await bot.procesar(mensaje('/estado'));assert.match(ultimo().text,/desactivada/);
  } else assert.ok(!llamadas.some(c=>c.m==='editUserStarSubscription'));
  const refund={...p};delete refund.is_recurring;delete refund.is_first_recurring;delete refund.subscription_expiration_date;
  await bot.procesar(mensaje('',{from:{id:999,is_bot:true},refunded_payment:refund}));
  assert.equal((await accion('acceso',{user_id,match_id:20})).ok,false);
  await bot.procesar(mensaje('/analisis 20'));assert.match(ultimo().text,/requiere PRO/);
  assert.equal((await db.query('select count(*)::int as n from eslo_stars_pagos where user_id=$1',[user_id])).rows[0].n,1);
});

// Resultados automáticos PRO: ventana de 30 minutos con SQL real.
const resultadosSQL=async(a,d)=>(await db.query('select public.eslo_stars_resultados($1,$2::jsonb) as r',[a,JSON.stringify(d)])).rows[0].r;
let partidoSeq=50000;
async function resultado({juego='cs2',inicio='2026-09-26T18:00:00Z',hace=40,prob_a=0.7,resultado_real='ganaA'}={}) {
  const id=++partidoSeq;
  await db.query(`insert into eslo_predicciones(match_id,juego,equipo_a,equipo_b,prob_a,resultado_real,inicio_programado,calificada_en)
    values($1,$2,$3,$4,$5,$6,$7::timestamptz,now()-($8::int*interval '1 minute'))`,[id,juego,id*10,id*10+1,prob_a,resultado_real,inicio,hace]);
  return id;
}
// Simula el paso de la ventana: el último bloque queda con más de 30 minutos.
const avanzar=()=>db.exec(`update eslo_stars_resultados_bloques set creado_en=creado_en-interval '31 minutes'`);
const totalBloques=async()=>(await db.query('select count(*)::int as n from eslo_stars_resultados_bloques')).rows[0].n;
const linea=id=>`Encuentro #${id} `;
async function pro(opciones={}) {const o=await orden({recurrente:true,...opciones});await o.aprobar();await accion('pago',o.compra);return o;}
async function despachar(accionSQL=resultadosSQL) {
  const mensajes=[];
  const resumen=await despacharResultados({accion:accionSQL,api:async(m,d)=>{mensajes.push({m,...d});return true;},pausa:async()=>{}});
  return {resumen,para:id=>mensajes.filter(x=>x.chat_id===id)};
}

test('resultados PRO: FREE nunca recibe resultados automáticos ni puede reservar un bloque',async()=>{
  await avanzar(); const libre=++secuencia; await accion('usuario',{user_id:libre});
  const testigo=(await pro()).datos.user_id; const id=await resultado();
  const d=await despachar();
  assert.equal(d.para(libre).length,0); assert.equal(d.para(testigo).length,1);
  assert.ok(d.para(testigo)[0].text.includes(linea(id)));
  const bloque=(await db.query('select bloque_id from eslo_stars_resultados_items where match_id=$1',[id])).rows[0].bloque_id;
  assert.equal((await resultadosSQL('reservar',{bloque_id:bloque,user_id:libre})).ok,false);
});
test('resultados PRO: PRO recibe un único mensaje agrupado y protegido con toda la ventana',async()=>{
  await avanzar(); const u=(await pro()).datos.user_id;
  const ids=[await resultado({hace:45}),await resultado({hace:38}),await resultado({juego:'lol',hace:31})];
  const d=await despachar(); const recibidos=d.para(u);
  assert.equal(recibidos.length,1); assert.equal(recibidos[0].m,'sendMessage'); assert.equal(recibidos[0].protect_content,true);
  for(const id of ids) assert.ok(recibidos[0].text.includes(linea(id)));
  assert.match(recibidos[0].text,/^🏁 <b>Resultados recientes<\/b>/);
  assert.match(recibidos[0].text,/Actualizado hasta \d{1,2}:\d{2} (AM|PM) · UTC−4/);
  assert.doesNotMatch(recibidos[0].text,/ROI|cuota|ganancia|apuesta|Venezuela/i);
});
test('resultados PRO: dos resultados en 20 minutos salen juntos y no hay otro mensaje antes de 30 minutos',async()=>{
  await avanzar(); const u=(await pro()).datos.user_id;
  const primero=await resultado({hace:20});
  assert.equal((await despachar()).para(u).length,0);
  await db.query(`update eslo_predicciones set calificada_en=calificada_en-interval '15 minutes' where match_id=$1`,[primero]);
  const segundo=await resultado({hace:15});
  let d=await despachar(); assert.equal(d.para(u).length,1);
  assert.ok(d.para(u)[0].text.includes(linea(primero))&&d.para(u)[0].text.includes(linea(segundo)));
  const tercero=await resultado({hace:35});
  assert.equal((await despachar()).para(u).length,0);
  await avanzar(); d=await despachar();
  assert.equal(d.para(u).length,1); assert.ok(d.para(u)[0].text.includes(linea(tercero)));
});
test('resultados PRO: resultado atrasado entra en el siguiente bloque ordenado por hora del partido',async()=>{
  await avanzar(); const u=(await pro()).datos.user_id;
  const primero=await resultado({inicio:'2026-09-26T18:00:00Z'});
  assert.equal((await despachar()).para(u).length,1);
  await avanzar();
  const tarde=await resultado({inicio:'2026-09-26T19:30:00Z',hace:35});
  const atrasado=await resultado({inicio:'2026-09-26T17:00:00Z',hace:31});
  const t=(await despachar()).para(u)[0].text;
  assert.ok(t.indexOf(linea(atrasado))>0&&t.indexOf(linea(atrasado))<t.indexOf(linea(tarde)));
  assert.ok(t.includes(`1:00 PM — ${linea(atrasado)}`)); assert.ok(!t.includes(linea(primero)));
});
test('resultados PRO: reintentos y ejecuciones simultáneas no duplican envíos',async()=>{
  await avanzar(); const u=(await pro()).datos.user_id; const id=await resultado();
  const [a,b]=await Promise.all([despachar(),despachar()]);
  await avanzar(); const c=await despachar();
  assert.equal(a.para(u).length+b.para(u).length+c.para(u).length,1);
  assert.equal((await db.query('select count(*)::int as n from eslo_stars_resultados_items where match_id=$1',[id])).rows[0].n,1);
  assert.deepEqual((await db.query('select estado from eslo_stars_resultados_envios where user_id=$1',[u])).rows.map(r=>r.estado),['enviado']);
});
test('resultados PRO: PRO vencido no recibe, tampoco si vence justo antes del envío',async()=>{
  await avanzar(); const o=await orden(); await o.aprobar(); await accion('pago',{...o.compra,date:ahora()-2678400});
  const vencido=o.datos.user_id; const testigo=(await pro()).datos.user_id; await resultado();
  let d=await despachar(); assert.equal(d.para(vencido).length,0); assert.equal(d.para(testigo).length,1);
  await avanzar(); const casi=(await pro()).datos.user_id; await resultado();
  d=await despachar(async(a,datos)=>{
    if(a==='reservar'&&datos.user_id===casi) await db.query("update eslo_stars_usuarios set premium_expira_en=now()-interval '1 second' where user_id=$1",[casi]);
    return resultadosSQL(a,datos);
  });
  assert.equal(d.para(casi).length,0);
});
test('resultados PRO: cancelar renovación mantiene los envíos hasta el vencimiento',async()=>{
  await avanzar(); const o=await pro(); const u=o.datos.user_id;
  await accion('cancelar',o.compra); const s=await accion('estado',o.datos);
  assert.equal(s.premium,true); assert.equal(s.suscripciones[0].cancelada,true);
  await resultado(); assert.equal((await despachar()).para(u).length,1);
  await db.query("update eslo_stars_pagos set expira_en=now()-interval '1 second', activado_en=now()-interval '31 days' where user_id=$1",[u]);
  await db.query("update eslo_stars_usuarios set premium_expira_en=now()-interval '1 second' where user_id=$1",[u]);
  await avanzar(); await resultado(); assert.equal((await despachar()).para(u).length,0);
});
test('resultados PRO: compra individual no habilita resultados automáticos',async()=>{
  await avanzar(); const o=await orden({producto:'partido',match_id:20,amount:50}); await o.aprobar(); await accion('pago',o.compra);
  assert.equal((await accion('acceso',{...o.datos,match_id:20})).ok,true);
  const testigo=(await pro()).datos.user_id; await resultado(); const d=await despachar();
  assert.equal(d.para(o.datos.user_id).length,0); assert.equal(d.para(testigo).length,1);
});
test('resultados PRO: ventana sin resultados nuevos no crea bloque ni mensaje',async()=>{
  await avanzar(); const u=(await pro()).datos.user_id; const antes=await totalBloques();
  const d=await despachar(); assert.equal(await totalBloques(),antes); assert.equal(d.para(u).length,0);
  assert.equal(d.resumen.enviados,0);
});
test('resultados PRO: agrupa por juego en orden fijo, cronológico dentro de cada juego y con ✅/❌',async()=>{
  await avanzar(); const u=(await pro()).datos.user_id;
  const lol=await resultado({juego:'lol',inicio:'2026-09-26T18:10:00Z'});
  const cs2b=await resultado({juego:'cs2',inicio:'2026-09-26T18:15:00Z',prob_a:0.3});
  const cs2a=await resultado({juego:'cs2',inicio:'2026-09-26T18:00:00Z'});
  const val=await resultado({juego:'valorant',inicio:'2026-09-26T17:00:00Z'});
  const dota=await resultado({juego:'dota2',inicio:'2026-09-26T19:00:00Z',resultado_real:'ganaB'});
  const t=(await despachar()).para(u)[0].text; const pos=s=>t.indexOf(s);
  const juegos=['<b>CS2</b>','<b>Dota 2</b>','<b>LoL</b>','<b>Valorant</b>'].map(pos);
  assert.ok(juegos.every((x,i)=>x>0&&(i===0||x>juegos[i-1])));
  assert.ok(pos(linea(cs2a))>juegos[0]&&pos(linea(cs2a))<pos(linea(cs2b))&&pos(linea(cs2b))<juegos[1]);
  assert.ok(pos(linea(dota))>juegos[1]&&pos(linea(dota))<juegos[2]);
  assert.ok(pos(linea(lol))>juegos[2]&&pos(linea(lol))<juegos[3]&&pos(linea(val))>juegos[3]);
  assert.ok(t.includes(`2:00 PM — ${linea(cs2a)}✅`)); assert.ok(t.includes(`2:15 PM — ${linea(cs2b)}❌`));
  assert.ok(t.includes(`2:10 PM — ${linea(lol)}✅`)); assert.ok(t.includes(`3:00 PM — ${linea(dota)}❌`));
});
test('resultados PRO: la RPC de envíos no está disponible a usuarios públicos',async()=>{
  for(const rol of ['anon','authenticated']) {
    await db.exec(`set role ${rol}`);
    try {
      await assert.rejects(resultadosSQL('preparar',{}),/permission denied/);
      await assert.rejects(db.query('select * from public.eslo_stars_resultados_envios'),/permission denied/);
    } finally { await db.exec('reset role'); }
  }
});
