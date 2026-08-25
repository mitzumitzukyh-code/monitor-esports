import test from 'node:test';
import assert from 'node:assert/strict';
import { enviar, enviarFotos, esc, recortar } from '../salida/telegram.mjs';

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

test('enviarFotos: manda el álbum a sendMediaGroup con parse_mode HTML por item', async () => {
  let captura = {};
  const r = await enviarFotos(
    [
      { url: 'https://cdn.ejemplo/juego.png', caption: '🔮 <b>CS2</b>' },
      { url: 'https://cdn.ejemplo/equipo.webp', caption: '3 pm → <b>Falcons</b> 70% vs GG' },
    ],
    {
      fetchImpl: async (url, opts) => {
        captura = { url, body: JSON.parse(opts.body) };
        return { ok: true };
      },
      token: '123:ABC',
      chatId: '@x',
    },
  );
  assert.equal(r.enviado, true);
  assert.match(captura.url, /sendMediaGroup/);
  assert.equal(captura.body.chat_id, '@x');
  assert.equal(captura.body.media.length, 2);
  assert.equal(captura.body.media[0].type, 'photo');
  assert.equal(captura.body.media[0].parse_mode, 'HTML');
  assert.equal(captura.body.media[1].caption, '3 pm → <b>Falcons</b> 70% vs GG');
});

test('enviarFotos: sin items no es un fallo y no toca la red; sin token avisa', async () => {
  let llamado = 0;
  const ok = await enviarFotos([], { fetchImpl: async () => { llamado++; return { ok: true }; }, token: '123:ABC', chatId: '@x' });
  assert.equal(ok.enviado, true);
  assert.equal(llamado, 0);

  const sinToken = await enviarFotos([{ url: 'x' }], { fetchImpl: async () => { llamado++; return { ok: true }; }, token: '', chatId: '@x' });
  assert.equal(sinToken.enviado, false);
  assert.match(sinToken.razon, /TELEGRAM_BOT_TOKEN/);
  assert.equal(llamado, 0);
});
