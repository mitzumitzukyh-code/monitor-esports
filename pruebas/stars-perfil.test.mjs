import test from 'node:test';
import assert from 'node:assert/strict';
import { NOMBRE_BOT, DESCRIPCION_BOT, DESCRIPCION_CORTA_BOT, validarPerfilTelegram } from '../salida/stars/perfil.mjs';
import { COMANDOS } from '../salida/stars/comandos.mjs';

test('perfil comercial cabe en límites de Telegram y enumera los cuatro eSports', () => {
  assert.equal(validarPerfilTelegram(), true);
  assert.equal(NOMBRE_BOT, 'Monitor eSports');
  assert.ok(DESCRIPCION_CORTA_BOT.length <= 120);
  assert.ok(DESCRIPCION_BOT.length <= 512);
  for (const juego of ['CS2', 'Dota 2', 'LoL', 'Valorant']) assert.match(DESCRIPCION_BOT, new RegExp(juego.replace(' ', '\\s')));
});

test('comandos comerciales mantienen FREE, PRO, partidos, resultados y soporte', () => {
  const nombres = new Set(COMANDOS.map(x => x.command));
  for (const c of ['start','gratis','pro','partidos','resultados','paysupport']) assert.ok(nombres.has(c));
});
