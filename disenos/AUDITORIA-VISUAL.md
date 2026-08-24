# Auditoría visual · sala de control v2

**Fecha:** 2026-08-24
**Qué se auditó:** `salida/web/index.html` generado con datos reales (51 filas en
ventana, 90 en total), servido en `http://localhost:4322`.
**Cómo:** medido en el navegador, no a ojo — `getBoundingClientRect`,
`getComputedStyle`, contraste WCAG calculado, y capturas a 1440×900, 1920×1080
y 375×812.

> ## Estado: **fases A, B y C aplicadas** (2026-08-24)
>
> Todo lo que sigue describe la pantalla **antes** de la Fase A. Lo que ya
> cambió, con el número nuevo medido:
>
> | Punto | Antes | Ahora |
> |---|---|---|
> | 1.1 Alturas de fila | 8 distintas (86.5–121.6 px) | **una: 88 px** |
> | 1.2 Columna HORA / SERIE | 206 / 172 px | **136 / el resto** (`table-layout:fixed`) |
> | 1.3 Pestaña activa | 150×55, 2 líneas | **209×36, 1 línea** |
> | 1.4 Reloj | `2:55 PMHORA DE VENEZUELA` | hora arriba, rótulo debajo |
> | 1.5 Pesos | 0 nodos en 400/500 | body 500 · mono 400 · cifras 700 |
> | 1.6 “MUY PAREJO” | partido en dos líneas | una línea |
> | 4.1 Cabecera del panel en móvil | 249 px de alto, pestañas cortadas | **101 px**, tira de pestañas con scroll propio |
> | 4.2 Botón EN VIVO en móvil | 93×57, dos líneas | **99×38, una línea** |
>
> Dos ajustes que no estaban en el plan y salieron de medir el resultado:
> la columna SERIE envuelve hasta 3 líneas dentro de la fila de 88 px (recortar
> con puntos dejaba 33 de 90 nombres a medias), y el estado vencido dice
> `SIN CALIFICAR` en vez de `TERMINÓ · SIN CALIFICAR` (182 px de texto no
> cabían en la columna). La frase completa quedó en el `title`.
>
> **Fase B:**
>
> | Punto | Antes | Ahora |
> |---|---|---|
> | 3.1 Sombras en la página | 1 | escala de 2 + el `thead` pegajoso se despega |
> | 3.2 Logo | una “M” escrita a mano | el rayo de la marca, en línea, en el rojo del sitio |
> | 3.2 Tarjeta social | `icon-512.png` cuadrado | `og-image.png` 1200×630 con `alt` y `summary_large_image` |
> | 3.2 Manifest | no enlazado | enlazado, con rutas relativas y el negro del sitio |
> | 3.2 Copiados por el generador | 6 archivos | 9 (entran `og-image`, manifest y el icono maskable) |
> | 2.2 Ancho del contenido | 1905 px a 1920, sin tope | **tope de 1600 px**, con las barras a sangre |
> | 3.3 Radios | 6px ×303 · 10px ×4 | anidados: panel 14 → tarjeta 10 → chip 6 |
>
> **Ojo con la marca:** el kit de `assets/` es de una versión anterior del
> sitio, con paleta **azul/violeta** (`#2563eb → #7c3aed`) y tipografía Inter,
> como dice su propio README. El sitio de hoy es rojo (`#FF2638`) con Manrope.
> Por eso el logo de la cabecera usa la **forma** de la marca (el rayo de
> `logo-mark-mono.svg`, que viene en `currentColor` justo para esto) pero en el
> rojo del sitio. Los PNG (favicon, iconos PWA, `og-image`) **siguen siendo
> azules**: no se pueden retintar sin regenerarlos. Queda esa decisión
> pendiente — o se regenera el kit en rojo, o el sitio adopta el azul.
>
> **Fase C:**
>
> | Punto | Antes | Ahora |
> |---|---|---|
> | 2.1 Barras antes del primer dato | 4 barras · 235 px | **2 barras · 185 px** |
> | 2.4 Alto de la tabla | `calc(100vh - 336px)` a mano | **medido**: el borde de abajo queda a 24 px del pie de la pantalla |
> | 2.5 Primera fila del panel | `TERMINÓ · SIN CALIFICAR` | **las que están en curso**; después próximas, vencidas y juzgadas |
> | 3.4 Significados del ámbar | 5 | **1**: “salió peor de lo esperado” (Brier bajo la moneda y vencida sin calificar) |
> | 3.5 Mayúsculas espaciadas | en casi todo rótulo | sólo en los rótulos de sección |
> | 4.x Banda en el teléfono | 396 px | **217 px** (la primera serie sube de y=792 a y=542) |
>
> Dos cosas que no estaban en el plan:
>
> - **La tabla se reordena sola.** El generador deja el orden bueno, pero el
>   panel se queda abierto y el reloj sigue: una serie que estaba en curso al
>   generar se vence sola diez minutos después y quedaría arriba sin serlo.
>   Ahora el script la manda a su sitio cada 20 s, con la misma regla que
>   `ordenarParaLaTabla()`.
> - **La medición del alto va sin `requestAnimationFrame` la primera vez.** En
>   una pestaña en segundo plano el rAF no corre, y la tabla se quedaba con el
>   respaldo del CSS hasta que alguien mirara la pestaña.
>
> Y una expectativa que hay que corregir: acá arriba se dijo que se pasaría de
> **6 a 9 filas** visibles. Son **6.7** a 1440×900. La cuenta original no
> contaba los 87 px de la cabecera del panel, y las filas pasaron de ~94 px de
> promedio a 88 fijos, que es menos de lo que parecía. En 1080p son ~7.5.
>
> Contraste al cerrar las tres fases: **2291 elementos revisados, 0 reprueban
> AA** (midiendo cada texto contra el fondo que de verdad tiene detrás).

---

## Resumen en una línea

La pantalla está **bien construida** (contraste AA en todo, rejilla de 4pt, foco
visible, tabla semántica, responsive de verdad) pero se **ve hecha a mano** por
cuatro razones concretas: la tabla no tiene proporciones fijas, la tipografía no
tiene voz baja, no hay ni un gramo de profundidad, y la marca que el repo ya
tiene guardada no se usa.

Nada de lo que sigue toca los números ni el motor. Es todo presentación.

---

## Lo que NO hay que tocar (ya está bien)

Esto se midió y pasó. Si alguien "mejora" la pantalla, que no rompa esto:

| Chequeo | Resultado |
|---|---|
| Contraste texto principal / fondo | 18.3:1 |
| Contraste del texto más apagado (`--apag`) sobre tarjeta | 5.54:1 — pasa AA |
| Chip morado de Dota (el que reprobaba en la v1) | 6.42:1 — pasa |
| Rojo de fallo sobre tarjeta | 5.07:1 — pasa |
| Tamaños de letra distintos en toda la página | 6 (12/13/14/16/20/24) |
| Familias | 2 (Manrope + JetBrains Mono) |
| Foco visible, `prefers-reduced-motion`, saltar al contenido | presentes |
| Tabla con `<th scope>`, `caption`, `role=tablist` | presente |

**Ni un solo par de colores reprueba AA.** El problema de esta pantalla no es el
color.

---

## 1 · Defectos medibles — arreglo mecánico (P0)

Esto es lo que más se nota y lo más barato de arreglar. Es donde está el 80%
del salto de "script que escupe HTML" a "pantalla diseñada".

### 1.1 Las filas tienen 8 alturas distintas

**Medido:** 51 filas visibles, alturas entre **86.5 px y 121.6 px**, con 8
valores distintos.

**Por qué pasa:** la celda MOTOR apila tres bloques (número + equipo + barra) y
ninguno tiene altura reservada; si el nombre del equipo es largo, la línea del
favorito se parte y la fila crece. Igual la celda SERIE.

**Se ve así:** el ojo no encuentra ritmo. Una tabla diseñada tiene UNA altura de
fila (o dos: compacta y expandida), nunca ocho.

**Arreglo:**

```css
tbody tr { height: 88px; }                 /* una sola altura, no min-height */
.equipos, .favorito { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.celda-motor { min-width: 220px; }         /* que quepa "MUY PAREJO" en su línea */
```

Con `title` en el nombre para que el recortado se pueda leer con el mouse.

### 1.2 Las columnas no tienen proporción: cambian de tamaño según el monitor

**Medido:**

| Columna | a 1440 px | a 1920 px |
|---|---|---|
| HORA | 206 px | 210 px |
| JUEGO | 113 px | 115 px |
| **SERIE** | **172 px** | **489 px** |
| FMT | 52 px | 53 px |
| **MOTOR** | **170 px** | **324 px** |
| MERCADO | 92 px | 94 px |

Dos cosas mal:

1. A 1440, **HORA (206 px) es la columna más ancha de la tabla** — más que SERIE
   (quién juega) y más que MOTOR (la predicción). La jerarquía está invertida:
   lo menos importante ocupa lo más.
2. SERIE pasa de 172 a 489 px según la pantalla (×2.8). Eso es `table-layout:
   auto` repartiendo por contenido. Un diseño tiene proporciones **decididas**,
   no negociadas con el navegador.

**Arreglo:**

```html
<table>
  <colgroup>
    <col style="width:132px">   <!-- HORA -->
    <col style="width:96px">    <!-- JUEGO -->
    <col>                       <!-- SERIE: se queda con lo que sobra -->
    <col style="width:56px">    <!-- FMT -->
    <col style="width:224px">   <!-- MOTOR -->
    <col style="width:88px">    <!-- MERCADO -->
  </colgroup>
```

```css
table { table-layout: fixed; }
```

### 1.3 La pestaña activa se parte en dos líneas

**Medido:** `EN VIVO Y PRÓXIMAS 51` mide 150×55 px, con 37.5 px de texto — o
sea, **dos líneas**. Las otras dos pestañas también. Y el subrayado rojo del
estado activo (`box-shadow` inset) queda 9.5 px por debajo del texto, flotando.

**Arreglo:**

```css
.pestana { white-space: nowrap; align-self: center; }
.pestana em { display:inline-block; min-width:22px; padding:1px 6px; margin-left:6px;
  border-radius:var(--rp); background:var(--interior); color:var(--tintaM); }
```

Y el contador como pastilla, no como número suelto: es la convención que usa
todo panel serio (GitHub, Linear, Vercel).

### 1.4 El reloj de la cabecera está pegado a su rótulo

**Se ve:** `2:55 PMHORA DE VENEZUELA` — sin espacio, en escritorio y en teléfono.

**Por qué pasa:** `.reloj .hora` y `.reloj .sub` son `<span>` inline. El
`margin-top: var(--e1)` del `.sub` **no hace nada** sobre un elemento inline. El
diseño quería la hora arriba y el rótulo debajo; nunca pasó.

**Arreglo:**

```css
.reloj .hora, .reloj .sub { display: block; }
.reloj { text-align: right; }
```

### 1.5 Se piden pesos de letra que nunca se descargaron

**Medido:** de Google Fonts se piden `Manrope 600;800` y `JetBrains Mono 500;700`.
El `body` está en `font-weight:600`, así que **todo elemento `.mono` hereda 600**
— un peso que no existe en la fuente cargada. El navegador lo resuelve con la
cara de **700**.

Resultado: `.mercado`, `.hora-txt`, y todo número secundario salen en negrita
sin que nadie lo haya pedido. La página **no tiene voz baja**: 1268 nodos en
peso 600, 410 en 800, 174 en 700, y ni uno en 400/500.

Y hay un peso fantasma más: 8 `<b>` sin regla propia computan en **900**, porque
el `bolder` que trae el navegador por defecto se suma al 800 del padre. Manrope
900 tampoco se descargó. Se arregla dándole peso explícito a todo `<b>`:

```css
b { font-weight: 800; }   /* nunca "bolder" heredando encima de otro 800 */
```

**Arreglo:**

```html
<!-- pedir los pesos que de verdad se usan -->
family=Manrope:wght@400;500;600;800&family=JetBrains+Mono:wght@400;500;700
```

```css
body { font-weight: 500; }                 /* el texto normal deja de gritar */
.mono { font-weight: 400; }                /* los números de fondo, livianos */
.prob, .cq .big, .reloj .hora { font-weight: 700; }   /* sólo las cifras protagonistas */
```

Esto solo — sin mover un pixel de layout — es el cambio que más "producto" hace
ver la pantalla.

### 1.6 "MUY PAREJO" se parte en dos líneas

Dentro de la celda MOTOR de 170 px, el badge ámbar queda `MUY` / `PAREJO`. Se
arregla con el `min-width` de 1.1 y `white-space:nowrap` en `.parejo`.

---

## 2 · Composición y jerarquía (P1)

### 2.1 Hay 234 px de barras apiladas antes del primer dato

**Medido a 1440×900:**

| Barra | Alto |
|---|---|
| Franja ámbar "DATOS REALES · CICLO CADA 10 MINUTOS" | 35 px |
| Cabecera (logo + marca + EN VIVO + reloj) | 81 px |
| Cinta de veredictos | 75 px |
| Estado del sistema | 44 px |
| **Total antes de `main`** | **235 px = 26 % de la pantalla** |

Cuatro barras horizontales completas, una debajo de otra, todas con su borde de
1 px. Es el patrón visual de un panel de administración de 2012.

**Propuesta:** la franja ámbar dice mantenimiento ("ciclo cada 10 minutos") en
los píxeles más valiosos de la página, y en el color más brillante del sistema.
Fundirla dentro de la cabecera como texto apagado, y meter ESTADO DEL SISTEMA
en la misma fila de la cinta. De 4 barras a 2: se recuperan ~100 px, que son
más de una fila de tabla.

### 2.2 No hay ancho máximo

**Medido:** a 1920 px, `main` mide 1905 px y el panel de la tabla 1301 px. En un
monitor de 2560 se estira igual, sin tope. Ningún producto diseñado hace eso:
se fija un contenedor (1440–1600 px) y se centra.

```css
main { max-width: 1600px; margin-inline: auto; }
/* y lo mismo para .franja, header, .cinta, .sistema y footer,
   con un contenedor interno para que las líneas sí crucen toda la pantalla */
```

### 2.3 Las tres columnas terminan a alturas distintas

**Medido a 1920:** rail termina en y=916, tabla en y=1066, columna derecha en
y=1177. Borde inferior en escalera de 261 px.

Se resuelve haciendo que la tabla llene el alto disponible (ver 2.4) o que la
columna derecha sea `position:sticky` como el rail.

### 2.4 La tabla muestra 6 filas de 51, y su alto es un número mágico

**Medido:** `.envoltura { max-height: calc(100vh - 336px) }` → 564 px a 900 de
alto. Con filas de ~94 px, se ven **6 de 51**. Y la página además tiene su
propio scroll (1261 px de alto total): **dos scrolls anidados**, que es el
clásico "no sé cuál rueda voy a mover".

`336px` es un número escrito a mano que no coincide con nada (las barras suman
235 + 87 de la cabecera del panel = 322). Cuando cambie cualquier barra, se
descuadra solo.

**Arreglo:** medir el hueco de verdad, no adivinarlo.

```css
.envoltura { max-height: calc(100dvh - var(--alto-chrome, 340px)); }
```

...con `--alto-chrome` escrito por el generador (que sabe cuántas barras puso),
o directamente un layout de `grid` a pantalla completa donde la tabla es la
única fila que crece. Con filas de 88 px (1.1) y una barra menos (2.1) pasan de
6 a 9 filas visibles: +50 % de información en el mismo monitor.

### 2.5 La vista por defecto arranca con filas muertas

`generar.mjs` ordena la ventana por hora de inicio **ascendente**, así que la
pestaña "EN VIVO Y PRÓXIMAS" empieza por lo más viejo: las primeras filas de la
captura dicen `TERMINÓ · SIN CALIFICAR` en ámbar. Lo primero que ve el dueño al
abrir el panel es lo que ya pasó y nadie calificó.

**Propuesta de orden dentro de la pestaña abierta:** primero `EN CURSO`, después
las próximas por cercanía, y al final las vencidas sin calificar (o sacarlas a
su propio grupo, que es información de salud del sistema, no del día).

---

## 3 · Sistema visual — lo que hace que "parezca Figma" (P1/P2)

### 3.1 Cero profundidad: hay UNA sombra en toda la página

**Medido:** un único `box-shadow` en el documento entero, y es el subrayado de
la pestaña activa. Todo lo demás son bordes de 1 px sobre fondos planos.

Eso es exactamente lo que separa una pantalla "de terminal" de una diseñada. No
hace falta llenar de sombras: hace falta una **escala de superficies** de tres
pasos y una sombra suave para lo que flota.

```css
:root {
  --s0:#05070A;   /* fondo de la página */
  --s1:#0D1015;   /* panel */
  --s2:#11141A;   /* tarjeta dentro del panel */
  --sombra-1: 0 1px 2px rgba(0,0,0,.4);
  --sombra-2: 0 8px 24px -8px rgba(0,0,0,.6);
}
.panel { box-shadow: var(--sombra-1); }
thead th { box-shadow: 0 1px 0 var(--lineaM); }   /* la fila pegajosa se despega */
.juego[aria-pressed="true"] { box-shadow: var(--sombra-2); }
```

Y un detalle que se nota mucho: `thead` es `position:sticky` sobre fondo opaco,
pero **sin sombra al hacer scroll** — las filas parecen pasar por encima.

### 3.2 La marca ya existe en el repo y la página no la usa

Esto es lo más fácil de arreglar y lo que más "hecho por alguien" se ve. En
`assets/` hay, sin usar:

| Archivo | Qué es | Qué usa la página hoy |
|---|---|---|
| `logo-mark.svg`, `logo-mark-simple.svg`, `logo-horizontal.svg` | la marca de verdad | una `<div>` con la letra **M** y un degradado CSS |
| `og-image.png` (1200×630, 88 KB) | tarjeta social lista | apunta a `icon-512.png`, cuadrado, con `twitter:card=summary` |
| `site.webmanifest` | app instalable | no está enlazado |
| `head-snippet.html` | el bloque de `<head>` que dejó el kit de marca | se escribió otro a mano |

**Arreglo (30 minutos):**

1. Cambiar el `.logo` por `<img src="assets/logo-mark.svg" width="48" height="48" alt="">`.
2. `og:image` → `assets/og-image.png` + `og:image:width/height` + volver a
   `twitter:card=summary_large_image`. Agregar `og:image:alt`.
3. Enlazar el manifest — **ojo:** el manifest trae rutas absolutas (`/assets/…`,
   `start_url:"/index.html"`) y el sitio vive en `…github.io/monitor-esports/`,
   así que hay que pasarlas a relativas o se rompe.
4. Agregar `og-image.png` y `site.webmanifest` a la lista `ICONOS` de
   `generar.mjs` (hoy copia 6 archivos y ninguno de esos dos).
5. Unificar el fondo de marca: el kit dice `#05080c`, la página usa `#05070A`.
   Son dos negros distintos para la misma marca; que gane uno.

### 3.3 La escala de radios está declarada pero no se usa

**Medido:** `6px` aparece 303 veces, `999px` 187, y `10px` **4 veces**. O sea:
hay un token `--r2` que casi no existe y todo es del mismo radio.

Un sistema de verdad **anida** los radios: contenedor 12 → tarjeta interna 8 →
pastilla 999. Que el panel y el chip que vive dentro tengan el mismo redondeo es
lo que aplana la jerarquía.

### 3.4 El ámbar hace cinco trabajos distintos

`--aviso` (#FFB000) se usa para: la franja de mantenimiento, el badge MUY
PAREJO, el Brier peor que la moneda, el estado SIN CALIFICAR, y "sin favorito".
Cinco significados con el mismo color = ninguno.

**Propuesta:** ámbar sólo para *"esto salió peor de lo esperado"* (Brier malo y
sin calificar). Lo "parejo" y lo "sin favorito" son estados **neutrales**, no
advertencias: van en gris con borde, y así el ámbar vuelve a significar algo.

### 3.5 Un solo tono de voz

Casi todo rótulo está en MAYÚSCULAS con `letter-spacing` y peso 800: la franja,
la cabecera, la cinta, ESTADO DEL SISTEMA, JUEGOS, las pestañas, los `thead`,
los chips, REGLA DE LA CASA, el footer. Cuando todo está en mayúsculas, nada
resalta.

**Propuesta:** dejar las mayúsculas espaciadas SOLO para los rótulos de sección
(nivel `h2`) y bajar el resto a minúsculas con peso 500/600 (ver 1.5).

---

## 4 · Teléfono (P1)

Medido a 375×812.

### 4.1 La cabecera del panel de series se rompe

**Medido:** `.panel > header` se queda en `display:flex` sin `wrap`. El subtítulo
("ventana rodante de 24 h · hora de Venezuela · bajo cada porcentaje…") queda en
una columna de **65 px de ancho y 198 px de alto: 11 líneas**. La cabecera del
panel entera mide **249 px** en un teléfono de 812. Y las pestañas se salen: el
borde derecho de "TODAS 90" cae en x=387 con la pantalla en 375 — **cortada**.

Consecuencia: el panel de series arranca en **y = 792**. Hay que bajar una
pantalla completa antes de ver la primera serie.

```css
@media (max-width:860px) {
  .panel > header { flex-wrap: wrap; }
  .panel h2 small { display: none; }   /* el subtítulo largo no cabe: que no pelee */
  .pestanas { width: 100%; overflow-x: auto; }
}
```

### 4.2 El botón EN VIVO se parte en dos líneas

`EN` / `VIVO` dentro de la pastilla. `white-space:nowrap` en `.vivo`.

### 4.3 Las tarjetas repiten rótulos que no aportan

Cada tarjeta muestra `JUEGO`, `SERIE`, `FORMATO`, `MOTOR`, `MERCADO` como
rótulos. En una tarjeta, el chip de juego ya dice que es el juego y los nombres
ya dicen que es la serie.

Y **70 de las 90 filas tienen la cuota en `—`** (78 %): en el teléfono eso son 70
líneas que sólo dicen `MERCADO —`.

**Propuesta:** en móvil mostrar rótulo sólo en MOTOR y MERCADO, y esconder la
línea de MERCADO cuando el valor sea `—` (en escritorio la columna ya se
esconde sola si TODAS están vacías; falta el caso por fila).

---

## 5 · Plan sugerido

**Fase A — una sesión, puro CSS, sin tocar el generador** (es el 80 % del salto):
1.1 altura de fila · 1.2 `colgroup` + `table-layout:fixed` · 1.3 pestañas ·
1.4 reloj · 1.5 pesos de letra · 1.6 badge · 4.1 y 4.2 (móvil).

**Fase B — marca y profundidad:**
3.2 (logo, og-image, manifest — toca 4 líneas de `generar.mjs`) · 3.1 superficies
y sombras · 2.2 ancho máximo · 3.3 radios anidados.

**Fase C — jerarquía, ya con criterio:**
2.1 fundir las 4 barras en 2 · 2.4 alto real de la tabla · 2.5 orden de las
filas (esto sí toca `generar.mjs`) · 3.4 ámbar con un solo significado · 3.5 voz.

---

## Cómo verificar cualquier cambio

```bash
node --env-file=.env salida/web/generar.mjs
```

```bash
node --test "pruebas/*.test.mjs"
```

El panel queda en `http://localhost:4322` con `node salida/web/servir.mjs`
(o con el preview `panel-dota`). Todo lo de arriba se vuelve a medir desde la
consola del navegador; las mediciones de este documento salieron de ahí, no de
mirar la pantalla.
