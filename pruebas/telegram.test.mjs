import test from 'node:test';
import assert from 'node:assert/strict';
import { enviar, esc, recortar } from '../salida/telegram.mjs';

test('esc: neutraliza lo que rompería el HTML de Telegram', () => {
  assert.equal(esc('Team <Rojo> & Cía.'), 'Team &lt;Rojo&gt; &amp; Cía.');
});

test('recortar: Telegram permite 4.096, el recorte respeta eso y avisa', () => {
  const largo = 'x'.repeat(4200);
  const cortado = recortar(largo);
  assert.ok(cortado.length <= 4000);
  assert.ok(cortado.endsWith('(recortado, ver el panel)'));
  const corto = recortar('corto');
  assert.equal(corto, 'corto');
});

test('enviar: sin token o sin chat no revienta — avisa y no manda', async () => {
  let llamado = 0;
  const r = await enviar('hola', { fetchImpl: async () => { llamado++; return { ok: true }; }, token: '', chatId: '@x' });
  assert.equal(r.enviado, false);
  assert.match(r.razon, /TELEGRAM_BOT_TOKEN/);
  assert.equal(llamado, 0);
});

test('enviar: manda al endpoint correcto con chat_id, HTML y sin preview', async () => {
  let captura = {};
  const r = await enviar('<b>Falcons</b> 61.2% vs GG', {
    fetchImpl: async (url, opts) => {
      captura = { url, body: JSON.parse(opts.body) };
      return { ok: true };
    },
    token: '123:ABC',
    chatId: '@monitor_esports',
  });
  assert.equal(r.enviado, true);
  assert.equal(captura.url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  assert.equal(captura.body.chat_id, '@monitor_esports');
  assert.equal(captura.body.parse_mode, 'HTML');
  assert.equal(captura.body.link_preview_options.is_disabled, true);
  assert.match(captura.body.text, /Falcons/);
});

test('enviar: un 429 de Telegram se reporta y no se traga', async () => {
  const r = await enviar('hola', {
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'too many requests' }),
    token: '123:ABC',
    chatId: '@x',
  });
  assert.equal(r.enviado, false);
  assert.match(r.razon, /429/);
});

// --- la previa chiquita -----------------------------------------------------
// Acá vivían las pruebas de enviarFoto(). La función se botó porque era el
// problema: sendPhoto pinta la imagen a todo el ancho del mensaje.

test('enviar: con previa manda el logo como miniatura, no como foto', async () => {
  const vistas = [];
  const r = await enviar('hola', {
    previa: { url: 'https://ejemplo/logo-cs2.jpg' },
    fetchImpl: async (url, o) => { vistas.push({ url: String(url), body: JSON.parse(o.body) }); return { ok: true }; },
    token: '123:ABC', chatId: '@x',
  });
  assert.equal(r.enviado, true);
  assert.match(vistas[0].url, /\/sendMessage$/, 'sigue siendo un mensaje de texto, no una foto');
  assert.deepEqual(vistas[0].body.link_preview_options, {
    url: 'https://ejemplo/logo-cs2.jpg',
    prefer_small_media: true,
    show_above_text: false,
  });
});

test('enviar: sin previa la vista se apaga — un enlace de tercero no se despliega solo', async () => {
  const vistas = [];
  await enviar('mira https://loquesea', {
    fetchImpl: async (url, o) => { vistas.push(JSON.parse(o.body)); return { ok: true }; },
    token: '123:ABC', chatId: '@x',
  });
  assert.deepEqual(vistas[0].link_preview_options, { is_disabled: true });
});

test('enviar: una previa sin url no enciende nada', async () => {
  const vistas = [];
  await enviar('hola', {
    previa: {},
    fetchImpl: async (url, o) => { vistas.push(JSON.parse(o.body)); return { ok: true }; },
    token: '123:ABC', chatId: '@x',
  });
  assert.deepEqual(vistas[0].link_preview_options, { is_disabled: true });
});
