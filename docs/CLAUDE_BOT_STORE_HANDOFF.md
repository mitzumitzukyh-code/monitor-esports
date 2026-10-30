# Claude Chrome handoff — publicación de Monitor eSports como Main Mini App

Fecha de preparación: 2026-09-28

## Objetivo

Configurar **@monitor_esports_avisos_bot** como **Main Mini App** de Telegram, dejar su ficha pública pulida y subir previews reales de la Mini App. No crear otro bot y no tocar el motor de predicción.

Telegram documenta que al configurar una Main Mini App aparece un botón principal para abrirla, se habilitan previews públicos y el bot puede aparecer en la pestaña Apps para usuarios que ya la hayan usado. Ser destacado en la Mini App Store no está garantizado: Telegram lo decide.

## Datos aprobados

- Nombre: **Monitor eSports**
- Bot: **@monitor_esports_avisos_bot**
- Mini App producción: **https://monitor-esports.vercel.app**
- Deep link Main Mini App: **https://t.me/monitor_esports_avisos_bot?startapp**
- Soporte: **@mitzukyhs**
- Juegos: **CS2 · Dota 2 · LoL · Valorant**
- FREE: **1 predicción diaria**
- PRO: **250 Stars / 30 días**, renovación automática
- Análisis individual: **50 Stars**, pago único
- Privacidad: **https://monitor-esports.vercel.app/privacy**
- Términos: **https://monitor-esports.vercel.app/terms**

### Bio corta

Predicciones, probabilidades e historial real de CS2, Dota 2, LoL y Valorant.

### Descripción principal

Tu centro de análisis de eSports.
CS2 · Dota 2 · LoL · Valorant

🎁 FREE · Predicción diaria
👑 PRO · Probabilidades, alertas y análisis completos
🎯 Análisis individual · Elige solo el partido que te interesa

📊 Resultados reales, aciertos y fallos visibles.
Contexto, no solo predicciones.

## Posicionamiento

- Predicciones y estadísticas para entender cada partido.
- Contexto, no solo predicciones.
- Mostrar aciertos **y fallos**.
- No usar frases como “apuesta segura”, “ganancia garantizada”, “100% seguro” o equivalentes.
- El producto vende contexto estadístico, no promesas de beneficio.

## Estado técnico que NO debes reconstruir

Ya está funcionando en producción:

- autenticación firmada de Telegram;
- Mini App real conectada al motor;
- CS2, Dota 2, LoL y Valorant;
- logos de juegos y equipos;
- FREE / PRO / análisis individual;
- pagos con Telegram Stars;
- historial;
- botón de menú **Abrir Monitor**;
- backend comercial y activación por successful_payment.

La Mini App y el bot leen la misma tabla de predicciones del motor. No modifiques el motor, Supabase, precios, entitlement, webhook ni lógica de Stars durante la publicación.

## Ruta de trabajo en Telegram

Usa la sesión de Telegram ya autenticada del dueño.

1. Abre **@BotFather**.
2. Ve a **/mybots**.
3. Selecciona **@monitor_esports_avisos_bot**.
4. Entra a **Bot Settings → Configure Mini App**.
5. Habilita/configura la **Main Mini App** con:
   - URL: https://monitor-esports.vercel.app
   - mantener apertura normal/full-height salvo que la UI de BotFather indique otra opción ya configurada.
6. Si BotFather ofrece **Splash Screen**:
   - fondo principal: #05070A
   - panel/header: #080A0E
   - usa el símbolo oficial de miniapp/public/assets/brand/logo-symbol.webp como referencia visual.
7. Si BotFather expone un campo de **Privacy Policy**, usa:
   - https://monitor-esports.vercel.app/privacy
8. No reemplaces el **Menu Button** existente “Abrir Monitor”.
9. Verifica que el perfil del bot muestre **Launch App / Open App** y que abra la URL de producción.

No inventes campos. Si la interfaz de BotFather cambió, adapta los clics a la UI actual conservando exactamente los valores aprobados.

## Previews a subir

**No uses las capturas demo del repo como material final si muestran DEMO o equipos ficticios.** Son sólo referencia visual.

Captura desde la Mini App real dentro de Telegram, preferiblemente sin datos personales visibles.

Orden recomendado:

1. **Inicio**
   - logo visible;
   - CTA FREE;
   - próximos partidos;
   - sin teclado ni paneles de depuración.
2. **Partidos**
   - varios encuentros reales;
   - logos de juegos/equipos visibles;
   - idealmente mezcla de CS2/Dota 2/LoL/Valorant si la disponibilidad lo permite.
3. **Predicción FREE**
   - un partido real;
   - probabilidad visible;
   - texto de estimación visible si entra en cuadro.
4. **Historial**
   - mostrar aciertos y fallos;
   - debe reforzar transparencia, no ocultar fallos.
5. **PRO**
   - 250 Stars / 30 días;
   - análisis individual 50 Stars;
   - beneficios legibles.

Si Telegram permite video, crea uno corto de **10–20 s**:
**Perfil del bot → Launch App → Partidos → predicción → Historial → PRO**.

No hagas una compra real para grabar el video.

## Reglas de calidad de previews

- formato vertical de teléfono;
- texto legible;
- sin barras de desarrollo;
- sin datos sensibles;
- sin conversaciones privadas;
- sin saldo de Stars;
- sin números de teléfono;
- sin CAPTCHA;
- sin “DEMO” en piezas finales;
- sin promesas de rentabilidad;
- mantener colores oficiales oscuros + rojo, con dorado sólo para PRO.

## Checklist funcional antes de terminar

Verifica manualmente:

- [ ] https://monitor-esports.vercel.app abre desde Telegram.
- [ ] El botón **Abrir Monitor** sigue funcionando.
- [ ] El nuevo botón **Launch/Open App** abre la misma Mini App.
- [ ] Inicio carga datos reales.
- [ ] Partidos muestra encuentros reales.
- [ ] Un FREE visible abre su probabilidad.
- [ ] Historial carga.
- [ ] PRO muestra 250 Stars / 30 días.
- [ ] Análisis individual muestra 50 Stars.
- [ ] No se realizó ninguna compra de prueba.
- [ ] Privacidad abre.
- [ ] Términos abre.
- [ ] Previews quedaron visibles en el perfil.
- [ ] No se cambió username, token, webhook ni precios.

## Qué hacer si aparece un bloqueo

Detente y pide al usuario sólo si aparece:

- login de Telegram;
- código 2FA;
- CAPTCHA;
- confirmación sensible que no pueda revertirse;
- solicitud de pago/Stars;
- cambio de username o ownership;
- permiso inesperado.

No solicites ni muestres el token del bot.

## Salida final para el usuario

Reporta únicamente:

1. Main Mini App: configurada / bloqueada.
2. Launch App: funciona / no funciona.
3. Previews: cuántos se subieron.
4. Privacidad y términos: configurados / no disponibles en esa UI.
5. Cualquier paso que el usuario deba hacer manualmente.
6. Captura final del perfil del bot.

No digas que Monitor eSports fue “destacado” o “aprobado por Telegram” salvo que la interfaz de Telegram lo confirme explícitamente.
