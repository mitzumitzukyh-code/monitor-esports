import test from 'node:test';
import assert from 'node:assert/strict';
import { crearReceptorStars } from '../salida/stars/receptor.mjs';

const secreto = 'a'.repeat(32);
const peticion = (body = '{}', token = secreto, ruta = '/functions/v1/esport-stars/telegram') =>
  new Request(`https://ejemplo.test${ruta}`, { method: 'POST', body,
    headers: { 'x-telegram-bot-api-secret-token': token } });

test('Edge autentica antes de leer/procesar, sin JWT público', async () => {
  let llamadas = 0;
  const receptor = crearReceptorStars({ secreto, bot: { procesar: async () => { llamadas++; } } });
  assert.equal((await receptor(peticion('{}', 'incorrecto'))).status, 403);
  assert.equal(llamadas, 0);
  assert.equal((await receptor(peticion('{"update_id":1}'))).status, 200);
  assert.equal(llamadas, 1);
  assert.equal((await receptor(peticion('{}', secreto, '/otra/telegram'))).status, 404);
});

test('Edge rechaza JSON inválido y cuerpos grandes con o sin content-length', async () => {
  const receptor = crearReceptorStars({ secreto, bot: { procesar: async () => assert.fail('No debe procesar') } });
  for (const body of ['{', 'null', '[]']) assert.equal((await receptor(peticion(body))).status, 400);
  assert.equal((await receptor(peticion('x'.repeat(65537)))).status, 413);
  const req = peticion('{}'); req.headers.set('content-length', '65537');
  assert.equal((await receptor(req)).status, 413);
});

test('Edge devuelve 500 para reintentar y registra un error sin datos sensibles', async () => {
  const errores = [];
  const receptor = crearReceptorStars({ secreto, bot: { procesar: async () => { throw Error('secreto'); } },
    registrarError: (e) => errores.push(e) });
  assert.equal((await receptor(peticion())).status, 500);
  assert.equal(errores.length, 1); assert.ok(!errores[0].includes('secreto'));
});

test('health indica si compras están habilitadas sin mostrar credenciales', async () => {
  const receptor = crearReceptorStars({ secreto, bot: {}, habilitado: false });
  const req = new Request('https://ejemplo.test/esport-stars/health');
  assert.deepEqual(await (await receptor(req)).json(), { ok: true, compras_habilitadas: false });
});
