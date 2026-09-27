import test from 'node:test';
import assert from 'node:assert/strict';
import { compararMercado, parsearRegistros, textoBenchmark, validarRegistro } from '../juez/benchmark-mercado.mjs';

const base={
  juego:'cs2', capturada_en:'2026-09-27T15:00:00Z', inicio_programado:'2026-09-27T16:00:00Z',
  fuente:'BINANCE_PREDICTION',
};

test('benchmark compara Brier y log-loss sin ejecutar operaciones',()=>{
  const r=compararMercado([
    {...base,match_id:1,prob_modelo:0.70,prob_mercado:0.60,resultado_real:'ganaA'},
    {...base,match_id:2,prob_modelo:0.40,prob_mercado:0.55,resultado_real:'ganaB'},
  ]);
  assert.equal(r.total.n,2);
  assert.ok(r.total.modelo.brier < r.total.mercado.brier);
  assert.ok(r.total.modelo.log_loss < r.total.mercado.log_loss);
  assert.deepEqual(r.fuentes,['BINANCE_PREDICTION']);
  assert.match(textoBenchmark(r),/No ejecuta operaciones/);
});

test('rechaza snapshots posteriores al inicio para evitar mirar el futuro',()=>{
  const malo={...base,match_id:3,prob_modelo:0.6,prob_mercado:0.6,resultado_real:'ganaA',
    capturada_en:'2026-09-27T16:01:00Z'};
  assert.equal(validarRegistro(malo),false);
  const r=compararMercado([malo]);
  assert.equal(r.total.n,0); assert.equal(r.descartados,1);
});

test('parsea JSONL y JSON',()=>{
  const a=parsearRegistros('{"match_id":1}\n{"match_id":2}\n');
  assert.equal(a.length,2);
  const b=parsearRegistros('[{"match_id":3}]');
  assert.equal(b[0].match_id,3);
});
