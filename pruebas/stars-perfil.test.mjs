import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('perfil comercial comunica propuesta, transparencia y CTA sin sonar genérico', () => {
  assert.match(DESCRIPCION_BOT, /Tu centro de análisis de eSports\./);
  assert.match(DESCRIPCION_BOT, /FREE · Predicción diaria/);
  assert.match(DESCRIPCION_BOT, /PRO · Probabilidades, alertas y análisis completos/);
  assert.match(DESCRIPCION_BOT, /Análisis individual · Elige solo el partido que te interesa/);
  assert.match(DESCRIPCION_BOT, /Resultados reales, aciertos y fallos visibles/);
  assert.match(DESCRIPCION_BOT, /Contexto, no solo predicciones\./);
  assert.match(DESCRIPCION_CORTA_BOT, /Predicciones, probabilidades e historial real/);
});

test('sincronización de copy preserva el botón Mini App y tolera rate limit', () => {
  const copy = readFileSync(new URL('../scripts/actualizar-copy-perfil-telegram.mjs', import.meta.url), 'utf8');
  const perfil = readFileSync(new URL('../scripts/configurar-perfil-telegram.mjs', import.meta.url), 'utf8');
  assert.match(copy, /retry_after/);
  assert.match(copy, /setMyDescription/);
  assert.match(copy, /setMyShortDescription/);
  assert.doesNotMatch(copy, /setChatMenuButton|setMyProfilePhoto|setMyCommands/);
  assert.doesNotMatch(perfil, /setChatMenuButton/);
});
