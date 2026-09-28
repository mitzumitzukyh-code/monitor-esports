# Mini App de Telegram — V1 (UI con datos de demo)

Primera pasada de la Mini App según `design/CLAUDE_MINIAPP_HANDOFF.md`.
**Sólo interfaz.** No hay deploy, no está activada en BotFather, no abre
facturas de Stars y no toca el bot ni el motor.

## Cómo verla

```bash
npm run miniapp:assets     # extrae y verifica los assets (equivale al .ps1)
npm run miniapp:dev        # http://127.0.0.1:4330
npm run miniapp:build      # miniapp/dist/
npm run miniapp:capturas   # design/capturas-miniapp-v1/ (necesita Playwright)
node --test pruebas/miniapp.test.mjs
```

Estados de demo: `?demo=free | pro | individual | vacio | error`, o desde
**Más → Modo demostración**. En Windows sigue sirviendo
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

## Lo que falta antes de conectar datos reales

1. Aprobación de la UI con estas capturas.
2. Endpoint de lectura para la Mini App (Supabase Edge, junto a `esport-stars`)
   que **valide `initData`** con el token del bot antes de responder: sin eso
   cualquiera se hace pasar por un usuario PRO.
3. Que ese endpoint aplique el acceso en el servidor con las mismas reglas del
   bot (PRO vigente, FREE diaria asignada por `engagement('gratis')`, análisis
   comprados) y devuelva exactamente la forma de `src/datos/tipos.mjs`.
4. Nombres de equipo y logos desde `datos/juegos/bo3.mjs` (ya los resuelve el bot).
5. Una `crearFuenteApi()` con la misma interfaz que `crearFuenteDemo()`;
   las vistas no cambian.
6. Hasta revisar el contrato, las compras siguen apagadas
   (`compras_habilitadas: false`). Activarlas es otro paso con su propia
   autorización, igual que el deploy y el botón de BotFather.
