# WORK HANDOFF — Monitor eSports

## Prioridad
No trabajar TikTok. El objetivo es dejar **el bot de Telegram funcionando correctamente**, con el recorrido FREE/PRO/Individual validado y usando las imágenes públicas correctas.

## Fuente visual
Usar únicamente los archivos de `PUBLICO_TELEGRAM/` para mensajes públicos.
Los archivos de `INTERNO_OPERADOR/` son diagramas explicativos para el dueño del proyecto y **NO deben enviarse a clientes ni publicarse en Telegram**.
La imagen `resultados_agregados_validacion_NO_PUBLICAR.png` pertenece a validación/pruebas y no debe usarse como publicidad del servicio.

## Producto real que el bot debe representar
### FREE
- `/start` muestra bienvenida + botones: Ver planes, Ver partidos, Mi estado, Ayuda.
- Ver partidos → elegir CS2 / Dota 2 / LoL / Valorant.
- Elegir período: Hoy / Mañana / Próximos.
- Mostrar partidos con predicción registrada y aún no iniciados, 6 por página.
- Ficha FREE: equipos, juego, hora, fecha y formato de serie si existe.
- NO mostrar probabilidad ni estadísticas premium.
- CTA: Comprar análisis individual (50 Stars) o Ver PRO (250 Stars/30 días).
- Entrar, consultar o aceptar condiciones no cobra Stars.

### PRO
- 250 Stars cada 30 días.
- Renovación automática claramente visible antes del pago.
- Flujo: Ver PRO → condiciones → aceptar términos → continuar compra → invoice Stars → validar `pre_checkout_query` → esperar `successful_payment` → validar comprador/producto/precio/moneda → registrar idempotente → activar 30 días.
- Después del pago: confirmar fecha de vencimiento y ofrecer Ver partidos / Mi estado.
- `/estado`: vigencia + estado de renovación.
- `/cancelar`: detener futuras renovaciones manteniendo el período ya pagado.
- Si vence sin nuevo pago confirmado, vuelve a FREE.

### Individual
- 50 Stars pago único, sin renovación.
- Solo desbloquea el partido comprado.
- Debe ser idempotente.
- Debe seguir disponible mientras el partido/informe exista y no haya reembolso.

## Informe completo REAL
Mostrar exclusivamente:
1. Probabilidad estimada de cada equipo.
2. Forma reciente: victorias sobre hasta 10 series anteriores con resultado.
3. Últimos resultados: hasta 5 series, ganada/perdida.
4. H2H / enfrentamientos previos: series registradas y victorias de cada equipo.
5. Fecha y hora.
6. Formato de serie, cuando esté disponible.
7. Competición solo si existe en datos; si no, omitir o mostrar `Pendiente`.

NO mostrar ni prometer:
- Ranking.
- Mapa/veto.
- Análisis táctico.
- Cuotas.
- ROI.
- Recomendaciones de apuesta.
- Estadísticas avanzadas no disponibles.
- Un bloque editorial independiente de “contexto” si no existe en los datos.

## Cabecera premium del informe
Cuando haya datos reales suficientes, presentar arriba tres datos grandes:
- Probabilidad (ej. 73%).
- Forma reciente (ej. 7/10).
- H2H (ej. 2–1).
Si no hay forma/H2H suficiente, mostrar `Sin datos suficientes` o equivalente; no inventar.

## Horarios
- Usar reloj de 12 horas (AM/PM).
- Mostrar zona neutral `UTC−4` en las vistas relevantes.
- No poner “Venezuela”.
- Evitar hora militar.

## `/muestra`
La imagen pública `11_ejemplo_informe_1080x1350.png` es una **plantilla visual**.
Preferencia: reemplazar `/muestra` por un informe de un partido real ya cerrado, claramente marcado como ejemplo.
Si todavía no se puede, dejar claro que los valores son demostrativos y nunca inventarlos como datos reales del partido.

## Imágenes públicas a cablear
- `06_bienvenida_1600x900.png` → `/start` / bienvenida.
- `08_pro_1080x1080.png` o `09_pro_1080x1920.png` → pantalla/explicación PRO según formato soportado.
- `10_analisis_individual_1080x1080.png` → compra individual.
- `11_ejemplo_informe_1080x1350.png` → `/muestra` solo como plantilla hasta disponer de ejemplo real.

## Material NO público
Todo `INTERNO_OPERADOR/*` es solo para entender y auditar el recorrido. No enviarlo por el bot.

## Validaciones obligatorias antes de abrir monetización
1. FREE navega completo sin cobro.
2. FREE nunca ve campos premium por callbacks alternativos/manipulados.
3. PRO vigente abre directamente informe completo.
4. Individual desbloquea solo el partido comprado.
5. Doble `successful_payment` no duplica acceso ni plazo.
6. Payload/producto/precio/moneda/comprador incorrectos son rechazados.
7. Vencimiento retorna a FREE.
8. `/cancelar` corta renovación futura sin quitar acceso vigente.
9. Reembolso revoca lo que corresponda y queda auditado.
10. Probar UNA compra real controlada con Stars de extremo a extremo antes de vender al público.
11. Probar UN reembolso real controlado.
12. Verificar que backups/persistencia sobreviven reinicio/deploy.

## Pendientes posteriores (no bloquean el recorrido básico salvo que ya estén a medias)
- Actualización automática de historial público.
- Alertas automáticas PRO.
- Ejemplo real de `/muestra`.

## Entrega esperada de Work
- Cambios de bot implementados y pruebas verdes.
- Evidencia del recorrido FREE y PRO desplegado.
- Confirmar qué imágenes quedaron cableadas.
- Separar claramente “probado con tests” vs “probado con pago real”.
- No hacer TikTok.
- No inventar funciones ni datos.
