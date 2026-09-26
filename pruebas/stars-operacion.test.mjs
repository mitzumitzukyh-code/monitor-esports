import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cifrarRespaldo, descifrarRespaldo, sqlRestauracion, TABLAS_RESPALDO } from '../salida/stars/respaldo.mjs';
import { comprobarStars, notificarCambio } from '../salida/stars/vigilancia.mjs';
import { prepararReembolso } from '../salida/stars/reembolsar.mjs';

const copia = { version: 1, capturado_en: '2026-09-26T18:00:00Z',
  tablas: Object.fromEntries(TABLAS_RESPALDO.map((t) => [t, []])) };
test('respaldo cifrado recupera datos y rechaza clave incorrecta o alteración', () => {
  const clave = randomBytes(32).toString('base64url');
  const c = { ...copia, tablas: { ...copia.tablas, eslo_stars_usuarios: [{ user_id: 987654321 }] } };
  const texto = cifrarRespaldo(c, clave);
  assert.ok(!texto.includes('987654321')); assert.deepEqual(descifrarRespaldo(texto, clave), c);
  assert.throws(() => descifrarRespaldo(texto, randomBytes(32).toString('base64url')));
  const modificado = JSON.parse(texto); modificado.datos = 'AAAA' + modificado.datos.slice(4);
  assert.throws(() => descifrarRespaldo(JSON.stringify(modificado), clave));
});
test('respaldo incompleto no se cifra y recuperación genera SQL sin ejecutar', () => {
  assert.throws(() => cifrarRespaldo({ version: 1 }, randomBytes(32).toString('base64url')));
  assert.equal(sqlRestauracion(copia), 'begin;\ncommit;');
});
test('vigilancia comprueba receptor, bloqueo público, webhook y base sin pagos', async () => {
  const urls = [];
  const r = await comprobarStars({ url: 'https://host/telegram', api: async () => ({ url: 'https://host/telegram', pending_update_count: 0 }),
    diagnostico: async () => ({ ok: true, ultima_incidencia: null }), fetchImpl: async (u, o) => {
      urls.push(u); return o.method ? { status: 403 } : { ok: true, json: async () => ({ ok: true }) };
    } });
  assert.deepEqual(r.fallos, []); assert.equal(urls.length, 2);
});
test('vigilancia detecta caída, webhook ajeno y base caída', async () => {
  const r = await comprobarStars({ url: 'https://host/telegram', api: async () => ({ url: 'https://otra/telegram' }),
    diagnostico: async () => { throw Error(); }, fetchImpl: async () => { throw Error(); } });
  assert.equal(r.fallos.length, 3);
});
test('vigilancia alerta una cola con error antiguo y reconoce recuperación sin pendientes', async () => {
  const base = { url: 'https://host/telegram', diagnostico: async () => ({ ok: true }),
    fetchImpl: async (_u, o) => o.method ? { status: 403 } : { ok: true, json: async () => ({ ok: true }) } };
  const webhook = { url: base.url, pending_update_count: 3, last_error_date: 1 };
  assert.deepEqual((await comprobarStars({ ...base, api: async () => webhook })).fallos, ['Webhook Telegram']);
  assert.deepEqual((await comprobarStars({ ...base, api: async () => ({ ...webhook, pending_update_count: 0 }) })).fallos, []);
});
test('alertas se deduplican y notifican recuperación e incidencia sin datos de compradores', async () => {
  const enviados = []; const enviar = async (t) => enviados.push(t);
  let e = await notificarCambio({ fallos: ['Base'], ultimaIncidencia: null }, {}, enviar);
  e = await notificarCambio({ fallos: ['Base'], ultimaIncidencia: null }, e, enviar);
  assert.equal(enviados.length, 1);
  await notificarCambio({ fallos: [], ultimaIncidencia: '2026-09-26T18:00:00Z' }, e, enviar);
  assert.equal(enviados.length, 2); assert.match(enviados[1], /recuperado/); assert.match(enviados[1], /incidencia/);
});
test('reembolso necesita confirmación, valida recibo y no duplica reembolsos', async () => {
  let llamadas = 0;
  const pago = { telegram_payment_charge_id: 'c', user_id: 10, amount: 50, currency: 'XTR', payload: 'p' };
  const args = { cargo: 'c', pago, api: async () => { llamadas++; return true; }, accion: async () => ({ ok: true }) };
  assert.equal((await prepararReembolso(args)).estado, 'revision'); assert.equal(llamadas, 0);
  await assert.rejects(prepararReembolso({ ...args, cargo: 'otro', confirmar: true }));
  assert.equal((await prepararReembolso({ ...args, confirmar: true })).estado, 'reembolsado'); assert.equal(llamadas, 1);
  await prepararReembolso({ ...args, pago: { ...pago, reembolsado_en: 'ahora' }, confirmar: true }); assert.equal(llamadas, 1);
  await assert.rejects(prepararReembolso({ ...args, api: async()=>false, confirmar:true }));
});
