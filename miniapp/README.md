# Mini App de Telegram — V1 + fuente real segura

Interfaz móvil de Monitor eSports. La UI V1 sigue pudiéndose revisar con datos de demo, y la rama de integración añade una fuente HTTP real con autenticación de Telegram. Las compras de Stars continúan apagadas y el motor no se modifica.

## Cómo verla

```bash
npm run miniapp:assets     # extrae y verifica los assets (equivale al .ps1)
npm run miniapp:dev        # http://127.0.0.1:4330
npm run miniapp:build      # miniapp/dist/
npm run miniapp:capturas   # design/capturas-miniapp-v1/ (necesita Playwright)
node --test pruebas/miniapp.test.mjs
```

Con `<meta name="monitor-api-url" content="">` vacío, la app usa la demo. Estados: `?demo=free | pro | individual | vacio | error`, o desde **Más → Modo demostración**. Cuando esa meta apunte al Edge Function real, `?demo=` y el panel de escenarios dejan de controlar la fuente. En Windows sigue sirviendo
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
  `auth_date` viejo (300 s por defecto) y obtiene el `user.id` únicamente
  de la carga firmada.
- El backend decide PRO, FREE diario, compra individual y auditoría. Un partido
  bloqueado sale con `prob_a: null` y `analisis: null`; no se manda un dato
  premium para esconderlo luego en CSS.
- El endpoint aplica el rate limit existente de Stars antes de consultar datos.
- Los nombres de equipo se resuelven con bo3.gg; si esa fuente falla, la Mini
  App mantiene el partido con un nombre de respaldo.
- `catalogo.compras_habilitadas` permanece en `false`.

### Activación (paso separado)

1. Desplegar `esport-miniapp` en Supabase con verificación JWT del gateway
   desactivada; la autenticación real la hace el HMAC de Telegram dentro de la
   función.
2. Confirmar que el proyecto tiene `TELEGRAM_BOT_TOKEN`,
   `SUPABASE_URL` y una llave server-side de Supabase. Opcional:
   `TELEGRAM_MINIAPP_MAX_AGE_SECONDS=300`.
3. Probar el endpoint dentro del cliente Telegram real.
4. Recién entonces poner la URL del Edge Function en
   `<meta name="monitor-api-url">` y publicar la Mini App.
5. BotFather y compras Stars siguen siendo fases separadas.
