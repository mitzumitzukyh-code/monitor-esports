import test from 'node:test';
import assert from 'node:assert/strict';
import { nivelConfianza, textoCalibracion, textoHistorial, mensajeCambio, despacharCambios } from '../salida/stars/credibilidad.mjs';

test('confianza usa bandas estables y no inventa valores', () => {
  assert.equal(nivelConfianza(0.82),'Alta');
  assert.equal(nivelConfianza(0.31),'Media');
  assert.equal(nivelConfianza(0.52),'Baja');
  assert.equal(nivelConfianza(null),null);
  assert.equal(nivelConfianza(2),null);
});

test('calibración distingue muestra pequeña de una banda ya medible', () => {
  assert.match(textoCalibracion({ok:true,banda:'alta',n:12,aciertos:9}),/muestra pequeña \(n=12\)/);
  assert.match(textoCalibracion({ok:true,banda:'alta',n:40,aciertos:30}),/75,0% de acierto \(n=40\)/);
  assert.equal(textoCalibracion(null),'');
});

test('historial agrega por juego e incluye los fallos', () => {
  const t=textoHistorial({ok:true,hasta:'2026-09-26T22:00:00Z',filas:[
    {juego:'cs2',banda:'alta',n:10,aciertos:7},
    {juego:'cs2',banda:'media',n:5,aciertos:2},
    {juego:'lol',banda:'alta',n:4,aciertos:4},
  ]});
  assert.match(t,/Total: 13\/19 · 68,4%/);
  assert.match(t,/CS2: 9\/15 · 60,0%/);
  assert.match(t,/LoL: 4\/4 · 100,0%/);
  assert.match(t,/los fallos también se incluyen/);
});

test('mensaje de cambio deja claro que la predicción oficial sigue congelada', () => {
  const c={cambio_id:1,match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,
    anterior_prob_a:0.65,nueva_prob_a:0.57,inicio_programado:'2026-09-27T18:00:00Z'};
  const mapa=new Map([['cs2:1',{nombre:'Liquid'}],['cs2:2',{nombre:'M80'}]]);
  const t=mensajeCambio(c,mapa);
  assert.match(t,/<b>Liquid<\/b>: 65% → 57%/);
  assert.match(t,/predicción oficial sigue congelada/);
  assert.doesNotMatch(t,/apuesta|cuota|ganancia/i);
});

test('mensaje avisa explícitamente si cambia el favorito', () => {
  const t=mensajeCambio({match_id:1,juego:'lol',equipo_a:1,equipo_b:2,
    anterior_prob_a:0.58,nueva_prob_a:0.47,inicio_programado:'2026-09-27T18:00:00Z'},
    new Map([['lol:1',{nombre:'A'}],['lol:2',{nombre:'B'}]]));
  assert.match(t,/favorito del modelo cambió/);
  assert.match(t,/<b>A<\/b> → <b>B<\/b>/);
});

test('despacho reserva antes de enviar, confirma éxito y libera fallos temporales', async () => {
  const acciones=[], llamadas=[];
  const cambios=[{cambio_id:7,match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,
    anterior_prob_a:0.65,nueva_prob_a:0.57,inicio_programado:'2026-09-27T18:00:00Z',destinatarios:[10]}];
  const accion=async(a,d)=>{acciones.push({a,d});
    if(a==='cambios_preparar') return {ok:true,cambios};
    if(a==='cambio_reservar') return {ok:true};
    return {ok:true};
  };
  const r=await despacharCambios({accion,api:async(m,d)=>{llamadas.push({m,d});return true;},pausa:async()=>{},
    nombresPartidos:async()=>new Map([['cs2:1',{nombre:'Liquid'}],['cs2:2',{nombre:'M80'}]])});
  assert.equal(r.enviados,1);
  assert.equal(llamadas[0].d.protect_content,true);
  assert.deepEqual(acciones.map(x=>x.a),['cambios_preparar','cambio_reservar','cambio_confirmar']);

  acciones.length=0;
  const f=await despacharCambios({accion,api:async()=>{throw Error('Telegram sendMessage: 500');},pausa:async()=>{}});
  assert.equal(f.fallidos,1);
  assert.ok(acciones.some(x=>x.a==='cambio_liberar'));
});
