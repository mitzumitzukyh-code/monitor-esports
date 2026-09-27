import test from 'node:test';
import assert from 'node:assert/strict';
import { mensajeCambioModelo, despacharCambiosModelo } from '../salida/stars/cambios.mjs';
import { nivelConfianza, referenciaHistorica } from '../salida/stars/engagement.mjs';

test('niveles de confianza son deterministas y la referencia conserva la muestra real',()=>{
  assert.equal(nivelConfianza(0.82),'Alta');
  assert.equal(nivelConfianza(0.64),'Media');
  assert.equal(nivelConfianza(0.52),'Baja');
  assert.equal(nivelConfianza(null),null);
  const t=referenciaHistorica({banda:{n:30,porcentaje:70,desde:.6,hasta:.7}},0.64);
  assert.match(t,/Confianza del modelo<\/b> · Media/);
  assert.match(t,/70% de acierto en 30 predicciones/);
});

test('cambio material muestra movimiento sin alterar la predicción oficial',()=>{
  const c={cambio_id:1,match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,
    anterior_prob_a:.65,nueva_prob_a:.57,inicio_programado:'2026-09-27T18:00:00Z'};
  const mapa=new Map([['cs2:1',{nombre:'Liquid'}],['cs2:2',{nombre:'M80'}]]);
  const t=mensajeCambioModelo(c,mapa);
  assert.match(t,/<b>Liquid<\/b>: 65% → 57%/);
  assert.match(t,/predicción oficial sigue congelada/);
  assert.doesNotMatch(t,/apuesta|cuota|ganancia/i);
});

test('si cambia el favorito se dice explícitamente',()=>{
  const t=mensajeCambioModelo({match_id:1,juego:'lol',equipo_a:1,equipo_b:2,
    anterior_prob_a:.58,nueva_prob_a:.47,inicio_programado:'2026-09-27T18:00:00Z'},
    new Map([['lol:1',{nombre:'A'}],['lol:2',{nombre:'B'}]]));
  assert.match(t,/favorito del modelo cambió/);
  assert.match(t,/<b>A<\/b> → <b>B<\/b>/);
});

test('dispatcher reserva, protege, confirma y libera fallos temporales',async()=>{
  const cambios=[{cambio_id:7,match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,
    anterior_prob_a:.65,nueva_prob_a:.57,inicio_programado:'2026-09-27T18:00:00Z',destinatarios:[10]}];
  const acciones=[],llamadas=[];
  const accion=async(a,d)=>{acciones.push({a,d});if(a==='preparar')return {ok:true,cambios};if(a==='reservar')return {ok:true};return {ok:true};};
  let r=await despacharCambiosModelo({accion,api:async(m,d)=>llamadas.push({m,d}),pausa:async()=>{},
    nombresPartidos:async()=>new Map([['cs2:1',{nombre:'Liquid'}],['cs2:2',{nombre:'M80'}]])});
  assert.equal(r.enviados,1);assert.equal(llamadas[0].d.protect_content,true);
  assert.deepEqual(acciones.map(x=>x.a),['preparar','reservar','confirmar']);

  acciones.length=0;
  r=await despacharCambiosModelo({accion,api:async()=>{throw Error('Telegram sendMessage: 500');},pausa:async()=>{}});
  assert.equal(r.fallidos,1);assert.ok(acciones.some(x=>x.a==='liberar'));
});
