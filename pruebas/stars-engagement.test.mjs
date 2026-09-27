import test from 'node:test';
import assert from 'node:assert/strict';
import { selloCongelado, nivelConfianza, referenciaHistorica, textoHistorial, textoGratis,
  despacharAlertas, despacharResumen } from '../salida/stars/engagement.mjs';

const p={match_id:20,juego:'cs2',equipo_a:1,equipo_b:2,prob_a:0.67,
  predicha_en:'2026-09-27T12:00:00Z',inicio_programado:'2026-09-27T15:00:00Z'};
const mapa=new Map([['cs2:1',{nombre:'Equipo A'}],['cs2:2',{nombre:'Equipo B'}]]);

test('sello congelado usa la hora guardada y no expone internals del modelo',()=>{
  const t=selloCongelado(p);
  assert.match(t,/Predicción congelada/); assert.match(t,/guardada/);
  assert.doesNotMatch(t,/glicko|modelo|motor|rating|algoritmo/i);
});
test('referencia histórica separa nivel del modelo y tamaño de muestra',()=>{
  assert.equal(nivelConfianza(.67),'Media');
  assert.match(referenciaHistorica({banda:{n:8,porcentaje:62.5,desde:.6,hasta:.7}},.67),/muestra pequeña/);
  assert.match(referenciaHistorica({banda:{n:8,porcentaje:62.5,desde:.6,hasta:.7}},.67),/Confianza del modelo<\\/b> · Media/);
  assert.match(referenciaHistorica({banda:{n:30,porcentaje:70,desde:.6,hasta:.7}},.67),/70% de acierto/);
});
test('historial dinámico muestra rendimiento por juego y también errores',()=>{
  const t=textoHistorial({total:10,aciertos:6,porcentaje:60,por_juego:[
    {juego:'cs2',n:4,aciertos:3,porcentaje:75},{juego:'lol',n:6,aciertos:3,porcentaje:50}]});
  assert.match(t,/6\/10/); assert.match(t,/CS2: 3\/4 · 75%/); assert.match(t,/LoL: 3\/6 · 50%/);
  assert.doesNotMatch(t,/ROI|cuota|ganancia|apuesta/i);
});
test('predicción FREE muestra sólo ficha resumida, probabilidad y auditoría',()=>{
  const t=textoGratis(p,{mapa,metricas:{banda:{n:30,porcentaje:70,desde:.6,hasta:.7}}});
  assert.match(t,/Predicción FREE del día/); assert.match(t,/Equipo A: 67%/); assert.match(t,/Predicción congelada/);
  assert.doesNotMatch(t,/Forma reciente|Enfrentamientos previos|H2H/);
});

test('alerta PRO reserva antes de enviar, protege contenido y confirma',async()=>{
  const acciones=[],llamadas=[];
  const accion=async(a,d)=>{acciones.push({a,d}); if(a==='preparar_alertas')return {items:[{user_id:10,match_id:20}]}; return {ok:true};};
  const r=await despacharAlertas({accion,cargarPredicciones:async()=>[p],nombresPartidos:async()=>mapa,
    api:async(m,d)=>llamadas.push({m,d}),pausa:async()=>{}});
  assert.equal(r.enviados,1); assert.equal(llamadas[0].d.protect_content,true);
  assert.deepEqual(acciones.map(x=>x.a),['preparar_alertas','reservar_alerta','confirmar_alerta']);
});
test('alerta PRO no envía cuando reserva falla',async()=>{
  const llamadas=[];
  const accion=async(a)=>a==='preparar_alertas'?{items:[{user_id:10,match_id:20}]}:{ok:false};
  const r=await despacharAlertas({accion,cargarPredicciones:async()=>[p],api:async(...x)=>llamadas.push(x),pausa:async()=>{}});
  assert.equal(r.enviados,0); assert.equal(r.omitidos,1); assert.equal(llamadas.length,0);
});
test('resumen PRO se reserva, se envía una vez y se confirma',async()=>{
  const acciones=[],llamadas=[];
  const accion=async(a,d)=>{acciones.push({a,d}); if(a==='preparar_resumen')return {
    dia:'2026-09-27',destinatarios:[10],conteos:{cs2:2,dota2:1,lol:0,valorant:1},ayer_total:5,ayer_aciertos:3}; return {ok:true};};
  const r=await despacharResumen({accion,api:async(m,d)=>llamadas.push({m,d}),pausa:async()=>{}});
  assert.equal(r.enviados,1); assert.match(llamadas[0].d.text,/Resumen diario PRO/);
  assert.deepEqual(acciones.map(x=>x.a),['preparar_resumen','reservar_resumen','confirmar_resumen']);
});
