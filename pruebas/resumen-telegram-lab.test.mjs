import test from 'node:test';
import assert from 'node:assert/strict';
import { mensajeResumenTelegramLab } from '../salida/resumen-telegram-lab.mjs';

test('resumen lab muestra los cuatro motores sin ranking ni enlaces públicos', () => {
  const filas = [
    { nombre:'CS2',predichas:100,n:50,brier:0.22,base:0.25,vsBase:-0.12,aciertos:31 },
    { nombre:'LoL',predichas:80,n:30,brier:0.26,base:0.25,vsBase:0.04,aciertos:14 },
    { nombre:'Valorant',predichas:20,n:0 },
    { nombre:'Dota 2',predichas:300,n:280,brier:0.44,base:0.50,vsBase:-0.12,aciertos:170 },
  ];
  const m=mensajeResumenTelegramLab(filas);
  for(const nombre of ['CS2','LoL','Valorant','Dota 2']) assert.match(m,new RegExp(nombre));
  assert.match(m,/31\/50 aciertos/);
  assert.match(m,/muestra suficiente/);
  assert.doesNotMatch(m,/http|github\.io|ver el panel/i);
});
