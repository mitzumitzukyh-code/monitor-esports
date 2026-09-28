# Mini App de Telegram — V1 + fuente real segura

Interfaz móvil de Monitor eSports. La UI V1 sigue pudiéndose revisar con datos de demo y producción usa una fuente HTTP real con autenticación de Telegram. Las compras con Stars están activas en producción y el motor de predicción permanece separado.

## Cómo verla

```bash
npm run miniapp:assets     # extrae y verifica los assets (equivale al .ps1)
npm run miniapp:dev        # http://127.0.0.1:4330
npm run miniapp:build      # miniapp/dist/
npm run miniapp:capturas   # design/capturas-miniapp-v1/ (necesita Playwright)
node --test pruebas/miniapp.test.mjs
```

El archivo fuente conserva `<meta name="monitor-api-url" content="">`: local y previews siguen en demo. El build de producción de Vercel (`VERCEL_ENV=production`) inyecta automáticamente `esport-miniapp`; así `?demo=` y el panel de escenarios no controlan producción. Estados de demo: `?demo=free | pro | individual | vacio | error`, o desde **Más → Modo demostración**. En Windows sigue sirviendo
`design/unpack-miniapp-assets.ps1`; el script de Node da los mismos bytes.

Detrás del proxy de este entorno, las capturas bajan las fuentes con
`NODE_USE_ENV_PROXY=1 npm run miniapp:capturas`.

## Stack y por qué

JavaScript con módulos ES, **cero dependencias y sin bundler**, igual que el
resto del repo (`CLAUDE.md`: nada de TypeScript). Los "datos tipados" del
handoff van en JSDoc (`src/datos/tipos.mjs`) con validadores en runtime que
también usan las pruebas. El "build" copia y revisa: imports rotos, assets
inexistentes o cualquier llamada que abra facturas lo detienen.

```
miniapp/
  index.html
  public/assets/        paquete v1 (SHA-256 verificado)
  src/
    main.mjs            arranque: conecta rutas, fuente y vistas al DOM
    rutas.mjs           rutas por hash y barra inferior
    telegram.mjs        adaptador de Telegram.WebApp (único punto de contacto)
    formato.mjs         esc(), porcentajes, horario UTC−4 (igual que el bot)
    estilos.css         tokens del diseño vigente, móvil primero
    datos/tipos.mjs     contrato de datos + validadores
    datos/demo.mjs      fuente de demostración (equipos ficticios)
    datos/api.mjs       fuente HTTP real; envía initData crudo al backend
    vistas/             componentes, marco y las seis pantallas (funciones puras)
  scripts/              desempacar-assets, construir, servir, capturas
```

## Pantallas

| Ruta | Pantalla |
|---|---|
| `#/inicio` | Inicio: lema, plan, predicción FREE del día, próximos, resultados recientes |
| `#/partidos` | Partidos: Hoy / Mañana / Próximos + filtro por juego |
| `#/partido/:id` | Detalle: ficha, probabilidad, forma, H2H o panel de desbloqueo |
| `#/historial` | Historial: aciertos y fallos con el mismo peso, filtro por juego |
| `#/pro` | PRO: 250 Stars / 30 días, análisis individual 50 Stars, FREE |
| `#/mas` | Más: soporte, bot, cómo calculamos, modo demo |

## Decisiones que conviene revisar

- **Cifras de demo con equipos inventados.** Si una captura circula, no puede
  pasar por una predicción real (regla 1). La cabecera muestra `DEMO` y el
  detalle dice "Cifra de demostración: no sale del modelo".
- **La marca es oscura siempre.** Del tema de Telegram se adapta el marco
  (cabecera, fondo y barra inferior del cliente con el color de la app).
- **Predicciones cerradas visibles para todos**, igual que la web
  (`publicarSinPremium`): el historial se tiene que poder auditar.
- **Fallo en ámbar, no en rojo.** El rojo es la marca.
- **Lo bloqueado nunca llega al cliente.** La fuente entrega `prob_a: null`
  y `analisis: null`; la vista no esconde nada que ya tenga.
- **Logos de equipo:** monograma por ahora; los logos reales vienen de datos.

## Fuente real y seguridad

El endpoint vive en `supabase/functions/esport-miniapp/` y es separado de
`esport-stars`, que sigue siendo el receptor comercial.

- El cliente manda **la cadena cruda `Telegram.WebApp.initData`** en
  `X-Telegram-Init-Data`. `initDataUnsafe` nunca autoriza acceso.
- El Edge Function verifica HMAC con `TELEGRAM_BOT_TOKEN`, rechaza
  `auth_date` viejo (1 hora por defecto) y obtiene el `user.id` únicamente
  de la carga firmada.
- El backend decide PRO, FREE diario, compra individual y auditoría. Un partido
  bloqueado sale con `prob_a: null` y `analisis: null`; no se manda un dato
  premium para esconderlo luego en CSS.
- El endpoint aplica el rate limit existente de Stars antes de consultar datos.
- Los nombres de equipo se resuelven con bo3.gg; si esa fuente falla, la Mini
  App mantiene el partido con un nombre de respaldo.
- En producción, `catalogo.compras_habilitadas` refleja la configuración real de Stars; el cliente nunca decide precios ni activa acceso por sí solo.

### Estado de producción

1. `esport-miniapp` está desplegado en Supabase con autenticación HMAC de Telegram.
2. El build de producción inyecta el endpoint real; local y previews pueden conservar demo.
3. La compra PRO y el análisis individual se inician desde la Mini App mediante facturas de Telegram Stars creadas en servidor.
4. La activación de acceso sigue dependiendo de la confirmación `successful_payment` del backend comercial.
5. Para la publicación como Main Mini App, seguir `docs/CLAUDE_BOT_STORE_HANDOFF.md`.
