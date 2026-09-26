import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBotStars } from '../salida/stars/bot.mjs';
import { fechaPartido } from '../salida/stars/partidos.mjs';
import { informePremium } from '../salida/stars/informe.mjs';
import { almacenStars } from '../salida/stars/persistencia.mjs';
import { VERSION_TERMINOS } from '../salida/stars/config.mjs';
import { MUESTRA } from '../salida/stars/muestra.mjs';

const p = { match_id:20, juego:'cs2', equipo_a:1, equipo_b:2, prob_a:0.73, inicio_programado:'2026-09-27T18:00:00Z',formato:'bo3' };
const cb = data => ({update_id:1,callback_query:{id:'cb',from:{id:10},message:{chat:{id:10,type:'private'}},data}});
function fixture(accion = async()=>({premium:false,suscripciones:[],terminos_version:VERSION_TERMINOS})) {
  const llamadas=[],acciones=[],consultas=[];
  const bot=crearBotStars({config:{habilitado:true,pro:250,partido:50,recurrente:true,soporte:'@mitzukyhs'},
    ahora:()=>Date.parse('2026-09-26T20:00:00Z'),
    almacen:{accion:async(a,d)=>{acciones.push({a,d});return accion(a,d);},partidos:async q=>{consultas.push(q);return [p];},
      ficha:async()=>p,prediccion:async()=>{throw Error('FREE no debe leer premium');}},
    api:async(m,d)=>{llamadas.push({m,d});return true;}});
  return {bot,llamadas,acciones,consultas,ultimo:()=>llamadas.filter(c=>c.m==='sendMessage').at(-1).d};
}
test('FREE elige juego, después período, ficha y vuelve al mismo filtro sin órdenes',async()=>{
  const f=fixture(); await f.bot.procesar(cb('partidos'));
  await f.bot.procesar(cb('filtro:cs2'));
  assert.equal(f.consultas.length,0);
  assert.deepEqual(f.ultimo().reply_markup.inline_keyboard[0].map(b=>b.text),['Hoy','Mañana','Próximos']);
  await f.bot.procesar(cb('juego:cs2:0:manana'));
  await f.bot.procesar(cb('partido:20:cs2:0:manana'));
  const volver=f.ultimo().reply_markup.inline_keyboard.flat().find(b=>b.text==='Volver a partidos');
  assert.equal(volver.callback_data,'juego:cs2:0:manana');
  assert.doesNotMatch(f.ultimo().text,/73%|Forma:|G · P/);
  await f.bot.procesar(cb(volver.callback_data));
  assert.equal(f.consultas.length,2); assert.equal(f.consultas[1].hasta,'2026-09-28T04:00:00.000Z');
  assert.ok(!f.acciones.some(c=>['crear','terminos','pago'].includes(c.a)));
});
test('PRO siempre explica precio e incluye condiciones antes de factura, aun con consentimiento anterior',async()=>{
  const f=fixture(); await f.bot.procesar(cb('pro'));
  assert.match(f.ultimo().text,/250 Stars cada 30 días/); assert.match(f.ultimo().text,/Renovación automática/);
  assert.ok(!f.acciones.some(c=>c.a==='crear')); assert.ok(!f.llamadas.some(c=>c.m==='createInvoiceLink'));
  await f.bot.procesar(cb('condiciones:p')); assert.match(f.ultimo().text,/Acepto|Compras acceso/);
});
test('aceptar términos no crea orden ni activa acceso; callback individual conserva producto',async()=>{
  const f=fixture(); await f.bot.procesar(cb(`aceptar:${VERSION_TERMINOS}:m20`));
  assert.equal(f.acciones.filter(c=>c.a==='terminos').length,1);
  assert.ok(!f.acciones.some(c=>['crear','pago','acceso'].includes(c.a)));
  assert.equal(f.ultimo().reply_markup.inline_keyboard[0][0].callback_data,'pagar_individual:20');
  for(const s of ['m0','m20:extra','x20']) await f.bot.procesar(cb(`aceptar:${VERSION_TERMINOS}:${s}`));
  assert.equal(f.acciones.filter(c=>c.a==='terminos').length,1);
});
test('horarios AM/PM con desplazamiento fijo incluso en invierno y con fecha pendiente',()=>{
  assert.equal(fechaPartido('2026-01-02T00:00:00Z',{timeStyle:'short'}),'8:00 PM');
  assert.equal(fechaPartido('2026-09-27T18:00:00Z',{timeStyle:'short'}),'2:00 PM');
  assert.equal(fechaPartido('no-es-fecha'),'Pendiente');
});
test('informe ordena, acota 10/5, excluye futuro y no inventa probabilidades ausentes',()=>{
  const historia=Array.from({length:12},(_,i)=>({match_id:i+1,equipo_a:1,equipo_b:2,resultado_real:i%2?'ganaB':'ganaA',
    inicio_programado:new Date(Date.parse(p.inicio_programado)-(12-i)*86400000).toISOString()}));
  historia.push({...historia[0],match_id:1000,inicio_programado:'2027-01-01T00:00:00Z'});
  const texto=informePremium(p,historia,id=>`Equipo ${id}`);
  assert.match(texto,/5 de 10 series ganadas/); assert.match(texto,/Equipo 1: P · G · P · G · P/);
  assert.match(texto,/12 series registradas/); assert.match(texto,/2:00 PM/);
  for(const prob_a of [null,undefined,NaN,-1,2]) {
    const pendiente=informePremium({...p,prob_a},[]);
    assert.doesNotMatch(pendiente,/NaN|\d+%|Mayor probabilidad/); assert.match(pendiente,/Pendiente/);
  }
});
test('historial busca diez por equipo y H2H separado con paginación, sin límite combinado',async()=>{
  const urls=[]; const anterior=process.env.SUPABASE_URL; process.env.SUPABASE_URL='https://prueba.supabase.co';
  try {
    const almacen=almacenStars({fetchImpl:async url=>{urls.push(new URL(url));return {ok:true,json:async()=>[{match_id:1}]};}});
    const historia=await almacen.historial(p); assert.equal(historia.length,1); assert.equal(urls.length,3);
    assert.deepEqual(urls.map(u=>u.searchParams.get('limit')),['10','10',null]);
    assert.ok(urls.every(u=>u.searchParams.get('resultado_real')==='in.(ganaA,ganaB)'));
    assert.match(urls[2].searchParams.get('or'),/and\(equipo_a.eq.1,equipo_b.eq.2\)/);
    await assert.rejects(almacen.historial({...p,equipo_a:'1&select=*'}));
  } finally {if(anterior===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=anterior;}
});
test('muestra usa un partido real cerrado, el mismo informe y antecedentes anteriores',()=>{
  assert.ok(['ganaA','ganaB'].includes(MUESTRA.partido.resultado_real));
  assert.ok(MUESTRA.historial.every(h=>Date.parse(h.inicio_programado)<Date.parse(MUESTRA.partido.inicio_programado)));
  const texto=informePremium(MUESTRA.partido,MUESTRA.historial,id=>MUESTRA.nombres[id]);
  assert.doesNotMatch(texto,/ranking|veto|mapa|contexto|cuotas|ROI|Venezuela/i);
  assert.match(texto,/Últimos resultados/);assert.match(texto,/AM|PM/);
});
test('el equipo con mayor probabilidad sigue el dato guardado aunque redondee a 50%',()=>{
  const texto=informePremium({...p,prob_a:0.4999},[],id=>`Equipo ${id}`);
  assert.match(texto,/Mayor probabilidad: Equipo 2/);assert.match(texto,/Forma: Equipo 2/);
  assert.doesNotMatch(texto,/Probabilidades equilibradas/);
});
test('cancelar llama a Telegram y luego persiste, no confirma fallo ni promete cancelación inexistente',async()=>{
  const f=fixture(async a=>a==='estado'?{premium:true,suscripciones:[{cargo:'cargo',payload:'orden',cancelada:false}]}:{ok:true});
  await f.bot.procesar(cb('cancelar'));
  assert.deepEqual(f.llamadas.find(c=>c.m==='editUserStarSubscription').d,{user_id:10,telegram_payment_charge_id:'cargo',is_canceled:true});
  assert.match(f.ultimo().text,/Conservas PRO/);
  const sin=fixture();await sin.bot.procesar(cb('cancelar'));assert.match(sin.ultimo().text,/No tienes/);
});
