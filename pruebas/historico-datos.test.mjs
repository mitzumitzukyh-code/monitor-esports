import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const RUTA_DATOS = new URL('../datos/historico.json', import.meta.url);

if (!existsSync(RUTA_DATOS)) {
  throw new Error('No existe datos/historico.json. Corre primero: node datos/historico.mjs');
}

const partidas = JSON.parse(await readFile(RUTA_DATOS, 'utf8'));

// El TI2026 arrancó el 13 de agosto de 2026 -- confirma que el histórico
// realmente cubre el torneo que nos interesa, no solo meses viejos.
const LEAGUEID_TI2026 = 19719;

// Límite fijo de cordura, no una ventana móvil. El histórico puede y debe
// conservar partidas antiguas: no queremos que CI empiece a fallar sólo
// porque pasó el calendario. Fechas anteriores a 2010 sí serían claramente
// sospechosas para este dataset de Dota 2.
const TIMESTAMP_MINIMO_RAZONABLE = Date.UTC(2010, 0, 1) / 1000;
const TOLERANCIA_FUTURO_SEGUNDOS = 60 * 60;

test('hay partidas cargadas', () => {
  assert.ok(partidas.length > 0);
});

test('no hay match_id duplicado', () => {
  const vistos = new Set();
  for (const p of partidas) {
    assert.equal(vistos.has(p.match_id), false, `match_id duplicado: ${p.match_id}`);
    vistos.add(p.match_id);
  }
});

test('todas las partidas tienen radiant_win booleano', () => {
  for (const p of partidas) {
    assert.equal(typeof p.radiant_win, 'boolean', `match_id ${p.match_id}: radiant_win no es booleano`);
  }
});

test('todos los start_time son timestamps válidos y no están en el futuro', () => {
  const ahora = Date.now() / 1000;
  for (const p of partidas) {
    assert.equal(
      Number.isFinite(p.start_time),
      true,
      `match_id ${p.match_id}: start_time no es un número finito`,
    );
    assert.ok(
      p.start_time >= TIMESTAMP_MINIMO_RAZONABLE,
      `match_id ${p.match_id}: start_time absurdamente antiguo`,
    );
    assert.ok(
      p.start_time <= ahora + TOLERANCIA_FUTURO_SEGUNDOS,
      `match_id ${p.match_id}: start_time en el futuro`,
    );
  }
});

test('la mayoría de las partidas trae team_id en ambos lados (huecos aceptables en torneos amateur)', () => {
  const sinEquipo = partidas.filter((p) => !p.radiant_team_id || !p.dire_team_id).length;
  const proporcion = sinEquipo / partidas.length;
  assert.ok(proporcion < 0.1, `${(proporcion * 100).toFixed(1)}% de las partidas no tiene team_id en algún lado (esperado < 10%)`);
});

test('The International 2026 está en el histórico', () => {
  const partidasTI = partidas.filter((p) => p.leagueid === LEAGUEID_TI2026);
  assert.ok(partidasTI.length > 0, 'no hay ninguna partida con leagueid de The International 2026');
});

test('hay suficiente variedad de equipos para que el Elo tenga sentido', () => {
  const equipos = new Set();
  for (const p of partidas) {
    if (p.radiant_team_id) equipos.add(p.radiant_team_id);
    if (p.dire_team_id) equipos.add(p.dire_team_id);
  }
  assert.ok(equipos.size > 100, `solo ${equipos.size} equipos distintos con team_id`);
});
