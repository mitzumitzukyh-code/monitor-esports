// Avisos por Telegram. Espejo de salida/discord.mjs: armar el mensaje es de
// quien llama; acá solo va el transporte.
//
//   POST https://api.telegram.org/bot<TOKEN>/sendMessage
//   { chat_id, text, parse_mode: "HTML" }
//
// Por qué HTML y no MarkdownV2: HTML solo obliga a escapar < > & -- lo que ya
// hace esc() del panel -- mientras MarkdownV2 exigiría escapar una docena de
// caracteres más, incluidos los puntos y los guiones que los nombres de
// equipo traen siempre. Límite de Telegram: 4.096 caracteres por mensaje
// (Discord corta en 2.000), así que acá el recorte es menos agresivo.
//
// Secretos: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID, en .env y en los Secrets
// de GitHub. Nunca en el código. Si falta alguno, enviar() no revienta:
// devuelve enviado:false con la razón, igual que discord.mjs.

const LIMITE = 4000; // Telegram corta en 4.096; margen por si acaso

export function esc(s) {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

export function recortar(texto, limite = LIMITE) {
  if (texto.length <= limite) return texto;
  return texto.slice(0, limite - 40).trimEnd() + '\n… (recortado, ver el panel)';
}

export async function enviar(texto, {
  previa = null,
  fetchImpl = fetch,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
} = {}) {
  if (!token || !chatId) {
    return { enviado: false, razon: 'faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID' };
  }
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: recortar(texto),
      parse_mode: 'HTML',
      // La previa es la ÚNICA forma de que Telegram muestre una imagen
      // pequeña: sendPhoto la pinta siempre a todo el ancho del mensaje,
      // que con un logo de 200px se ve enorme y feo. Con prefer_small_media
      // queda una miniatura al lado del texto, que es lo que hace el
      // thumbnail de Discord. Sin previa, apagada: los nombres vienen de
      // terceros y no queremos que un enlace suyo se despliegue solo.
      link_preview_options: previa?.url
        ? { url: previa.url, prefer_small_media: true, show_above_text: false }
        : { is_disabled: true },
    }),
  });
  if (!res.ok) {
    return { enviado: false, razon: `Telegram respondió ${res.status}: ${await res.text()}` };
  }
  return { enviado: true };
}

// Acá VIVÍA enviarFoto(), que mandaba una sendPhoto por partida. Se botó:
// era exactamente el problema. Telegram no tiene miniatura ni imagen
// dentro del texto -- una foto ocupa el ancho completo del mensaje -- así
// que un escudo de equipo por partida convertía el canal en una pared de
// logos gigantes. Lo que queda es un mensaje por tanda con el logo del
// juego de previa chiquita.
