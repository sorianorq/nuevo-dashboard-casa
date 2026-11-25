# Estado del proyecto · traspaso entre sesiones

Última actualización: 18/11/2026 (fases 1–5 terminadas; publicación en Vercel).

Este documento resume lo hecho, lo pendiente y las decisiones tomadas, para que
cualquier sesión nueva pueda continuar sin el historial del chat. Léelo después
de `CLAUDE.md` y `docs/ESPECIFICACION.md`. Actualízalo al terminar cada paso.

## 1. Situación en una frase

Las **fases 1 a 5 de la especificación están hechas y probadas con datos reales**
(Resumen, Movimientos, Balances, Supermercado, Amex, Pagos de la persona, Presupuesto y
alta rápida), con los permisos por Balance aplicados (scripts 04–10 ejecutados por Ricardo).
Lo que queda es publicar la app y los puntos abiertos de datos que se listan a continuación.

**Puntos abiertos (18/11/2026):**

1. ~~Publicar en Vercel~~ (hecho el 18/11/2026): proyecto nuevo `nuevo-dashboard-casa`
   (cuenta `sorianorq-7130`), **https://nuevo-dashboard-casa.vercel.app**, subido con
   `vercel deploy --prod` desde este equipo. Proyecto conectado al repositorio de GitHub:
   **cada push a `main` publica en producción** (comprobado el 18/11/2026). Variables
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en los 3 entornos.
   Comprobado con la sesión de `ricardo` a 390 px: login y las 7 pantallas principales,
   sin errores. `dashboard-rqs.vercel.app` sigue igual; sustituirla lo decide Ricardo.
   Para publicar: `git push` (o, a mano, `npx vercel deploy --prod`).
2. **Febrero de 2026, Casa:** ingresos y gastos inflados; parece un traspaso propio marcado
   como `normal`. Lo revisa Ricardo.
3. **Casa › «Compra»** no existe aún: el gasto Amex de las compras del Súper se guarda sin
   concepto (no cambia cifras). Ricardo lo crea en Balances (enlazado, origen Supermercado).
4. **702 gastos antiguos de Amex sin concepto:** Ricardo los asigna a mano.
5. **Fallo de producción** con CSV dd/mm/aaaa (día ≤ 12 se intercambia con el mes): puede
   haber movimientos antiguos con la fecha cambiada; pendiente de revisar.

## 2. Hecho

| Paso | Commit | Contenido |
|---|---|---|
| 0 | `9cb6312` | Next.js 16.4 (App Router, TS, Tailwind 4, ESLint), shadcn/ui (base-nova, Base UI), Recharts, `@supabase/ssr`. `.env.local` solo con URL y clave anon. |
| 1 | `35ce583` | Tokens del estilo A, Manrope, formato es-ES (`lib/format.ts`), login, `proxy.ts`, rol desde `user_roles`, pestañas de Balance y selector de admin, menú lateral y barra inferior con ➕ («Próximamente»), rutas de todas las secciones. |
| 2 | `d2fb7d1` | Resumen: reglas del apartado 6 en `lib/calc/summary.ts` (funciones puras), consultas en `lib/data/summary.ts`, gráfico de 12 meses con vista de tabla, gasto por concepto, Supermercado y Amex. |
| 3 | `609153c` | Movimientos (filtros, lista o tabla, concepto con buscador, «+ Nuevo concepto», aplicar a parecidos, tipo de flujo), revisión uno a uno de movimientos sin concepto, Cargar extracto en 3 pasos. |
| 2a | `d9af426` | Balances, solo lectura: hoja anual Real / Presupuesto / Desvío (ordenador), mes a mes (móvil), subtotales plegables, clic en un importe automático → sus movimientos. Reglas en `lib/calc/balance.ts`, datos en `lib/data/balance.ts`. Comprobado con la sesión de `ricardo` (Casa y Ricardo 2026): totales por bloque iguales a una suma directa en la base de datos; 390 y 1440 px sin errores ni desbordamiento. |
| — | `5819a74` | `await connection()` en `lib/supabase/server.ts`; script 04 de permisos (sin ejecutar). |

**Verificado con la sesión real del usuario `ricardo`** (17–18/11/2026): login, lectura del
rol y las 10 pantallas a 390 y 1440 px, sin errores ni desbordamiento horizontal. Los
totales del Resumen de marzo de 2026 (Casa) coinciden al céntimo con una consulta directa
hecha con la misma sesión, es decir, con lo que RLS deja ver a ese usuario.

**Verificado tras el script 04** (18/11/2026, usuario `ricardo`): `fc_allowed_owners()`
devuelve `casa` y `ricardo`; se ven los conceptos de Casa y no queda ningún «Concepto
desconocido»; no se ven filas de `andrea`; Supermercado, Amex y plantillas visibles;
`monthly_budgets` vacía (como dice la especificación). Resumen, Movimientos, Revisar y
Cargar en Casa y personal, a 390 y 1440 px: sin errores ni desbordamiento. Todos los
movimientos de Casa visibles los creó el propio `ricardo`, así que los totales de Casa no
cambian respecto a la verificación anterior.

**Sin verificar todavía:** guardar de verdad concepto, flujo, nueva cuenta o nuevo concepto,
y el rol admin. La importación sí está probada contra la base de datos real (apartado 3).

## 3. Pendiente (en este orden)

1. ~~Ricardo ejecuta el script 04~~ (hecho el 18/11/2026).
2. ~~Volver a probar con sesión real~~ (hecho; ver apartado 2).
3. ~~Comparar con `supabase/sql/comprobaciones/resumen_marzo_2026_casa.sql`~~ (hecho el
   18/11/2026: la consulta 1, sin RLS, coincide al céntimo con la app; lo excluido en marzo
   son una liquidación de tarjeta en Casa y traspasos internos en Ricardo, sin filas sin Balance).
4. ~~Probar una importación real~~ (hecho) con un extracto (Ricardo decide si se guarda).
   - 18/11/2026, **solo vista previa** (sin guardar) con un .xls de Sabadell en la cuenta de
     Casa correcta: la plantilla guardada encaja; los meses ya guardados salen enteros como
     duplicados (mismo recuento por mes que en la base de datos) y los meses posteriores, como
     nuevos. Las demás cuentas dan casi todo nuevo o ninguna fila válida, como se esperaba.
   - Filas idénticas en un mismo archivo (misma fecha, importe y descripción; p. ej. dos
     transferencias iguales el mismo día): **Ricardo decidió importarlas todas**. Se numeran
     por orden de aparición; la 1.ª usa el hash de siempre y las siguientes añaden `|2`, `|3`…
     La aparición k es duplicada si su hash existe o si la cuenta ya tiene ≥ k movimientos con
     esa clave. Verificado en vista previa con el extracto real.
   - **Importación real hecha** el 18/11/2026 (Claude, con permiso de Ricardo, desde la app a
     390 px): Casa · Sabadell Gasto, julio–noviembre de 2026. Comprobado en la base de datos:
     todo `owner = casa`, `flow = normal`, hash sha256 único por fila, tipo coherente con el
     signo, las filas idénticas guardadas con hashes distintos. Volver a cargar el archivo da
     0 nuevos y todo duplicado.
5. **Fase 2 · Balances: terminada** (lectura, edición y comparación con producción). Notas:
   - **Criterio de la fase 2 cumplido** (18/11/2026): con la cuenta admin de
     `.env.test.local` (rol `admin` dado con `supabase/sql/06_rol_admin.sql`), el Balance de
     Andrea en la app coincide al céntimo con el cálculo de producción (`andrea.js`) en los
     12 meses de 2025 y 2026, en ingresos, gastos y ahorro. `andrea_balance`: 359 filas
     (2025 y 2026), todas con `concept_id`, ninguna sin concepto en el catálogo. Selector
     «Admin · ver datos de» probado: Andrea → pestañas «Casa | Andrea»;
   - entrega 2 **hecha y probada** el 18/11/2026 (script 05 ejecutado por Ricardo), con la
     sesión de `ricardo` y comprobando la base de datos en cada paso: importe a mano y
     comentario (guardar y quitar), ocultar/mostrar, subir/bajar, periodicidad, renombrar
     (ida y vuelta), alta de concepto manual con «rellenar año» y archivar. Todo se dejó como
     estaba, salvo la fila `balance_hidden` de Ricardo en `user_preferences` (lista vacía).
     El concepto archivado «Prueba Claude (borrar)» se borró el 18/11/2026;
   - fase 1, Movimientos: guardado **probado** el 18/11/2026 con la sesión de Ricardo
     (movimiento de septiembre de 2026 sin concepto): poner y quitar concepto en la tabla
     (1440 px), traspaso propio y vuelta a normal en la hoja de edición (390 px), «Nuevo
     concepto» desde el desplegable (se crea enlazado a movimientos) y quitarlo, «Nueva
     cuenta» en Cargar extracto (queda elegida). El movimiento quedó como estaba; la cuenta y
     el concepto de prueba se borraron (las reglas antiguas dejan borrar lo propio). Arreglado
     al probar: en el buscador de conceptos, «Sin concepto» no aparecía al escribir «sin», y
     «Nuevo concepto» desaparecía al escribir un nombre que no existe (ahora siempre se ve y
     propone ese nombre).
6. **Fase 3 · Supermercado.** Entrega 1 (solo lectura) hecha el 18/11/2026: datos clave del
   mes (gasto, nº de compras, ticket medio, % vs mes anterior con la regla del apartado 6),
   gasto por categoría (`catId`) frente a la media de 12 meses, por tienda, evolución de 12
   meses e historial con el detalle de cada compra. Comprobado: octubre de 2026 = suma
   directa en la base de datos (total, nº de compras, categorías); 390 y 1440 px sin errores.
   24/11/2026: el mes se elige en un **desplegable** (`MonthSelect`, de la primera compra al
   mes actual, agrupado por año) en lugar de las flechas ‹ ›.
   Entrega 2 **hecha y probada** el 18/11/2026 (script 07 ejecutado por Ricardo):
   «+ Nueva compra» (fecha, tienda con las habituales primero + «Otra», forma de pago,
   «Pagado por» si es Amex, cuadrícula de 14 categorías, líneas que se suman por categoría,
   total), «Editar» y «Borrar» desde el detalle. Con Amex se crea/actualiza/borra su gasto
   en `amex_expenses` (`purchase_id`, `wallet = 'amex'`, concepto «Supermercado · tienda»,
   `pending = true`, `paid_by` elegido, por defecto `otros`). Probado con la sesión de
   Ricardo (390 px crear, 1440 px editar): crear con Amex → compra + gasto Amex; añadir línea
   y cambiar «Pagado por» → se actualizan total y gasto; pasar a Tarjeta → el gasto Amex se
   borra; volver a Amex → se crea otra vez; borrar → no queda nada (comprobado en la base de
   datos). El historial se actualiza al cerrar el formulario.
   - **Ojo:** el Balance de Casa aún no tiene conceptos (ni «Compra»), así que el gasto Amex
     de una compra se guarda con `concept_id` vacío. No cambia ninguna cifra (en el Balance
     esos gastos no cuentan; la compra cuenta por Supermercado). Cuando exista Casa › Compra
     (enlazado, origen Supermercado), las nuevas lo llevarán.
7. **Fase 4 · Pagos.** Entrega 1 (American Express) **hecha y probada** el 18/11/2026
   (scripts 08 y 09 ejecutados por Ricardo): datos clave del mes (gastado, pendiente de
   traspaso de todas las fechas, por persona), pendientes con casillas y «Marcar como
   traspasados», filtros (buscar, pagado por, concepto, solo pendientes), lista por día
   (móvil) y tabla (ordenador), formulario de alta siempre visible a la izquierda en
   ordenador y en ventana en móvil; tocar un gasto lo edita (o, si sale de una compra, lleva
   a Supermercado). Comprobado con la sesión de Ricardo: octubre y noviembre de 2026 = suma
   directa en la base de datos (total, por persona, pendiente); filtros. Guardado probado
   (390 px crear, 1440 px el resto): alta pagada por Ricardo en Casa → se creó Casa › «Otros
   gastos» (se queda: es el concepto por defecto de Casa); editar a pagado por Andrea, Balance
   de Andrea › Ocio, pendiente y comentario (Ricardo escribe en el Balance de Andrea sin
   verlo); sugerencia «Ocio» al escribir la misma descripción; marcar como traspasado; borrar
   → no queda el gasto. Sin errores.
   - Script 09: la base de datos tenía aún la regla única antigua (user_id, concept); ahora
     es (owner, concept), como en la especificación.
   Entrega 2 (Pagos de la persona) **hecha y probada** el 18/11/2026: título con su nombre
   (admin: la elegida en el selector), gastado en el mes frente a presupuesto (barra; hoy
   `monthly_budgets` está vacía → «sin presupuesto»), barras por concepto, filtros (buscar,
   medio de pago, concepto), lista por día / tabla, y alta con la casilla **«Pagado con
   AMEX»** (va a la lista de la Amex, con «Pendiente de traspaso») o un medio de pago suyo
   («+ Nuevo» crea uno en `payment_methods`). Balance: Casa o el suyo; concepto sugerido o
   «Otros gastos». La lista son sus pagos (`wallet` = la persona) más lo que pagó con la Amex,
   sin las compras del Súper (cuentan en Supermercado). Comprobado: noviembre de 2026,
   Ricardo 5 gastos / 392,45 € y Andrea (admin) 16 / 719,08 € = base de datos. Guardado
   probado con la sesión de Ricardo (390 px alta con medio de pago nuevo, 1440 px pasar a
   AMEX con pendiente → aparece en la Amex, borrar); el gasto y el medio de pago de prueba
   se borraron. Sin errores ni scroll horizontal.
   - «+ Nuevo concepto» no está en el formulario: por la decisión de Ricardo se sugiere uno
     parecido o va a «Otros gastos»; los conceptos se crean en Balances.
8b. **Flujo de dinero (25/11/2026, script 14 ejecutado por Ricardo).** Contabilidad › Flujo de
   dinero: diagrama compartido estilo draw.io (React Flow `@xyflow/react` 12.12.1) guardado en
   `money_flow` (una fila `casa`, JSON validado con Zod en `lib/flow/model.ts`). Cuentas (Casa,
   Ricardo, Andrea, Tarjeta, Externo) que se arrastran; flechas con importe (o variable), día del
   mes, nota y «por confirmar» (discontinua); tocar para editar, invertir o borrar.
   «Transferencias del mes» (25/11/2026, petición de Ricardo): una línea por transferencia (Desde,
   Hacia, importe, día, para qué) con «+ Transferencia», ordenadas por día, total al mes y lo que
   sale de cada cuenta. Varias transferencias entre las mismas dos cuentas = una flecha con todas
   sus líneas en la etiqueta (cada una se abre al tocarla).
   Flechas movibles (25/11/2026): asa ⠿ en la etiqueta para desplazar la flecha (`bend`, ruta
   ortogonal propia en `bentPath`; doble clic = ruta automática) y extremos arrastrables a otro
   punto u otra cuenta (`onReconnect`, mueve todas las líneas de esa flecha). Probado sobre el
   diagrama real de Ricardo con copia previa; restaurado idéntico. Botón «Guardar» (25/11/2026)
   para guardar al momento (aviso «Diagrama guardado.»), además del guardado automático (1,2 s) con control de versión
   (`updated_at`): si otro lo cambió, no se pisa y avisa. Diagrama de partida con lo visto en los
   extractos y el modelo de la Amex. Probado con la sesión de Ricardo (alta de cuenta, flecha
   arrastrando, recargar, borrar; 390 y 1440 px, sin errores); filas de prueba borradas.
8. **Presupuesto rehecho (24/11/2026, script 13 ejecutado por Ricardo).** Decisión de Ricardo:
   un **importe fijo al mes por concepto**, igual todos los meses (`andrea_concepts.monthly_budget`;
   `monthly_budgets` queda sin uso). Pantalla: mes en desplegable (solo elige qué gasto se compara),
   resumen «Gastado X de Y» con barra, «Quedan / Te pasas» y gastado sin presupuesto; una tabla por
   bloque (Gastos, Inversión): Concepto · Presup./mes · Gastado · Queda, con Total; «Editar» pone
   todos los importes en casillas y «Rellenar vacíos con la media» (6 meses cerrados, sin atípicos).
   Ingresos no se presupuestan aquí. Balances usa ese importe en todos los meses (Presupuesto y
   Desvío); en el modo manual, cambiarlo en un mes lo cambia en todos. Probado con la sesión de
   Ricardo (guardar, quitar, rellenar; 390 y 1440 px, sin errores); el importe de prueba se quitó.
   **Poner y quitar conceptos (25/11/2026, petición de Ricardo):** las tablas solo muestran los
   conceptos que están en el presupuesto (con importe, aunque sea 0). «+ Añadir concepto» abre un
   diálogo (concepto no archivado y sin presupuesto, importe propuesto = media); «Editar o quitar»
   cambia importes y la × de cada fila lo saca (vacío = fuera; nada se guarda hasta «Guardar»).
   Debajo, plegado, «Fuera del presupuesto» con lo gastado en otros conceptos y «Añadir» en cada uno.
   Se quitó «Rellenar vacíos con la media». Probado (añadir y quitar, 390 y 1440 px, sin errores);
   importes restaurados idénticos.
   **Inversión y % sobre la nómina (25/11/2026, petición de Ricardo):** dos resúmenes del mes,
   Gastos («Quedan / Te pasas») e Inversión («Faltan X por invertir / ✓ hecha»); las dos tablas
   siempre visibles, cada una con su «+ Añadir» (diálogo filtrado al bloque). Columna «% nómina»
   (en móvil, debajo del importe) y total; en los resúmenes, % del presupuesto y de lo real en total.
   Base elegida por Ricardo: **nómina real de cada mes** (concepto «Nómina» de Ingresos; en Casa,
   la de Ricardo si quien mira puede ver su Balance; si el Balance no tiene nómina, total de
   ingresos). Sin cobro ese mes no hay %. Ojo: la nómina de Ricardo solo está importada hasta
   marzo 2026. Probado solo lectura (Casa y Ricardo, 390 y 1440 px, sin errores).
   **Conceptos y apartados nuevos desde Presupuesto (25/11/2026, petición de Ricardo):** el «+ Añadir»
   de cada tabla ofrece «Uno que ya existe» o «Uno nuevo»: nombre, apartado (grupo existente del
   bloque, ninguno o «+ Apartado nuevo…» que se crea como subtotal), «Sale del banco» (enlazado a
   movimientos) o «Lo escribo a mano» (manual) e importe al mes (`createBudgetConcept`). Son
   conceptos reales: salen en Balances. En Balances, «+ Concepto» tiene ahora el tipo «Grupo»
   (`createBalanceConcept` admite `kind: "subtotal"`, sin padre). Probado (crear concepto con
   apartado nuevo, en apartado existente, nombre repetido rechazado, grupo desde Balances; sin
   errores); las 4 filas de prueba «ZZ …» se borraron.
10. **Supermercado: foto del ticket (25/11/2026, petición de Ricardo; script 15 PENDIENTE de ejecutar).**
   «Foto del ticket» en Nueva/Editar compra: la foto se reduce en el móvil (lado largo 2400 px,
   JPEG), va a `POST /api/supermercado/ticket` (ruta, no acción: puede pasar de 1 MB), se guarda en el
   almacén privado `tickets` como `pending/<uuid>.jpg` y se lee con Claude (`lib/supermarket/ticket.ts`,
   claude-opus-5-5, salida estructurada zod: tienda, fecha, total, pago, líneas con texto, importe y
   categoría; descuentos aplicados a su producto). Se revisa antes de guardar: categoría e importe
   de cada línea, quitar líneas, «Cuadra con el total del ticket» o aviso si no. Al guardar, la foto
   pasa a `compras/<id>.jpg` (`ticket_path`) y las líneas a `ticket_lines`; las líneas por categoría
   (`items`) salen de ellas. Borrar la compra borra la foto; las pendientes de más de 1 día se
   limpian solas. Icono de ticket en el historial. Script 15: columnas `ticket_path`,
   `ticket_lines`, almacén privado y permisos (como Supermercado). Probado: lectura de un ticket de
   prueba tipo Mercadona (14 líneas, descuento, peso; 7 s, todo correcto) y pantalla en móvil sin
   el script (aviso claro). **Script 15 ejecutado por Ricardo (25/11/2026).** Prueba completa en móvil:
   leer, cambiar una categoría, guardar (foto en `compras/<id>.jpg`, 14 líneas), resumen de la compra
   con la foto y las líneas leídas (plegadas), editar con el ticket, borrar (la foto se borra); la
   compra de prueba ya no existe. Sin errores.
   **Botón flotante «Ticket» (25/11/2026, petición de Ricardo):** en el móvil, en Resumen y en
   Súper, una píldora «Ticket» abajo a la derecha (encima de la barra, aparece con un pequeño salto;
   sin animación si el móvil pide menos movimiento). Abre directamente la cámara (`capture=
   "environment"`) y, con la foto, la compra nueva ya leyendo el ticket (`openWithPhoto`). En el
   ordenador no se muestra. Probado en 390 y 1440 px, sin errores; la foto pendiente de la prueba se
   borró.
   **Píldora «Gasto» (25/11/2026, petición de Ricardo):** encima de «Ticket», en marrón, abre el alta
   rápida «Nuevo gasto» (lo mismo que el ➕ de la barra). Las dos van en `MobileQuickActions`
   (Resumen y Súper). Probado en móvil, sin errores; no se guardó nada.
9. **Balances: colocar conceptos arrastrando la fila (25/11/2026, petición de Ricardo).** Asa ⋮⋮ al
   principio de cada fila (ordenador y móvil): se suelta entre dos filas del mismo bloque, sobre un
   subtotal para meterlo en ese grupo (resaltado) o al final del bloque; un subtotal se mueve con su
   grupo, solo en primer nivel. Línea marrón donde caerá, la fila se ve movida al instante (subtotales
   recalculados, `applyRowMove`) y se guarda con `reorderBalanceConcept` (renumera de 10 en 10 los
   hermanos, archivados incluidos; cambia `parent_id` si cambia de grupo). Esc cancela; con teclado,
   flechas sobre el asa (Subir/Bajar del menú siguen). Probado (subir, sacar de un grupo, meter en
   otro, móvil; sin errores) con copia previa del orden; restaurado idéntico.
   _Versión anterior (por meses), sustituida:_ **Fase 5 · Presupuesto y alta rápida.** Presupuesto **hecho y probado** (18/11/2026,
   script 10 ejecutado por Ricardo): pestañas Casa | persona (selector admin), mes ‹ › hasta 12
   meses por delante, gastado / presupuestado de Gastos con % y previsión a fin de mes,
   partidas por bloque (Gastos, Ahorro, Ingresos) con barra, «quedan X €» y naranja desde el
   85 %, «Gastado en conceptos sin partida»; tocar una partida → cambiar o quitar el importe
   y enlace a su origen (movimientos filtrados, Supermercado, Amex o Balances). Botones
   «+ Partida», «Copiar mes anterior» (solo las que faltan) y «Proponer con histórico».
   Comprobado sin guardar (Ricardo y admin/Andrea, 390 y 1440 px, sin errores).
   Guardado probado con la sesión de Ricardo (Balance personal): «+ Partida» Ocio 12,34 €
   (390 px), cambiar a 20 € (1440 px), «Copiar mes anterior» a diciembre, quitar las dos →
   `monthly_budgets` vuelve a quedar vacía. Sin errores.
   - Gastado de una partida = «Real» de Balances en ese mes (mismo cálculo).
   - Previsión: solo en el mes en curso; lo automático se proyecta al ritmo de los días,
     lo escrito a mano (fijos) no.
   - Propuesta: media de los 6 meses cerrados anteriores (contando los meses sin gasto),
     sin los meses que pasan del doble de la mediana, redondeada al euro. Salen marcadas
     por defecto solo las que no tienen partida y tuvieron gasto en 3 o más meses.
   - `monthly_budgets` no tiene `user_id`; en `category_group` se guarda el nombre del
     concepto (columna antigua).
   Alta rápida **hecha y probada** (18/11/2026): el ➕ (móvil) y «+ Añadir gasto»
   (ordenador) abren una hoja con el formulario de Pagos de la persona (casilla «Pagado con
   AMEX», medio de pago, Balance Casa o el suyo, concepto sugerido u «Otros gastos»).
   Probado con la sesión de Ricardo: desde Supermercado en 390 px con AMEX (pendiente) y
   desde Resumen en 1440 px con Bankinter; los dos de prueba se borraron. Sin errores.

## 4. Hallazgos en los datos y en la app en producción

- **RLS:** antes del script 04 cada usuario solo veía filas con `user_id = auth.uid()`
  (el catálogo de Casa es del admin). Con las políticas `fc_*` cada rol ve su Balance.
- En la URL la pestaña personal es `?balance=personal` (no el nombre de la persona).
- **App en producción** (PWA estática en `dashboard-rqs.vercel.app`, repositorio privado
  `sorianorq/finanzas`, usa xlsx 0.18.5):
  - `import_hash` = `'h'` + hash 31 en base 36 (no sha256);
  - plantillas de `import_templates` con columnas en **letras** (A, B…);
  - **fallo:** en CSV con fechas dd/mm/aaaa y día ≤ 12 intercambia día y mes
    (por `cellDates`). Puede haber movimientos guardados con la fecha cambiada.
- La app Next anterior (`dashboard-finanzas`, sin desplegar) guardaba las plantillas con
  **nombres de cabecera** y el hash como sha256(fecha|importe|descripción).
- **Febrero de 2026, Casa:** ingresos y gastos muy por encima de lo normal; parece un
  traspaso entre cuentas propias marcado como `normal`. Lo debe revisar Ricardo.

## 5. Decisiones tomadas (y por qué)

- **Cache Components está activo** (`next.config.ts`). Cualquier lectura de cookies,
  `searchParams` o la hora va dentro de `<Suspense>`; los layouts no esperan la sesión.
  `createClient()` hace `await connection()`. Las redirecciones fijas (`/`, `/contabilidad`,
  `/pagos`) están en `next.config.ts`. `error.tsx` usa `retry()` (API de Next 16).
- **Balance activo:** la pestaña va en la URL (`?balance=personal`) y la persona elegida por
  admin en la cookie `fc_admin_view`. Ambas se validan contra el rol en `lib/data/session.ts`.
  Las Server Actions reciben la pestaña, nunca un owner ni un userId.
- **Tokens:** se usan los nombres exactos de la especificación como variables CSS. En
  Tailwind, el dorado es `brand` / `brand-soft`, porque `muted` y `accent` son fondos en shadcn.
- **Resumen:**
  - el selector de admin también aparece en el Resumen;
  - el gasto por concepto sale solo de movimientos;
  - la media de 12 meses de Supermercado cuenta solo desde la primera compra registrada;
  - cualquier importe negativo es gasto, incluidos los traspasos a ahorro (regla literal).
- **Paleta del gráfico:** el verde y el dorado de los tokens dan ΔE 14,2 con visión normal
  (mínimo recomendado: 15). Se compensa con orden fijo, leyenda, tooltip y tabla.
- **Balances (fase 2), decidido por Ricardo el 18/11/2026:**
  - el Real de un concepto enlazado sale **solo de su origen** (`link_source`): movimientos
    (`flow = normal`), Pagos (`amex_expenses`) o Supermercado (`supermarket_purchases`).
    Así «Compra» = compras de Supermercado y no cuenta también los cargos del banco. En el
    Resumen, el gasto por concepto sigue saliendo de los movimientos;
  - se entrega en dos partes: (1) solo lectura (hoja anual Real / Presupuesto / Desvío, móvil
    mes a mes, clic en una celda → sus movimientos); (2) edición (importes manuales,
    comentarios, + Concepto) con un script 05 de permisos de escritura;
  - el rol admin y el Balance de Andrea se prueban con `FC_ADMIN_EMAIL` / `FC_ADMIN_PASSWORD`
    en `.env.test.local` (los añade Ricardo).
- **Amex y Pagos, decidido por Ricardo el 18/11/2026** (cambia la especificación funcional 5.5/5.6):
  - no hay vínculos automáticos: al apuntar un gasto en el módulo de Pagos se marca la
    casilla **AMEX** y se elige **concepto** (obligatorio). Se guarda una vez en
    `amex_expenses` (`wallet = 'amex'` si es Amex; si no, `wallet` = la persona), sale en la
    lista de la Amex y suma en el Balance de ese concepto;
  - por eso, en Balances, un gasto de `amex_expenses` con concepto suma en ese concepto
    enlazado **sea cual sea su origen** (ya aplicado en `lib/data/balance.ts`; sin cambio de
    cifras porque hoy ninguno tiene concepto). No hay doble conteo: el cargo de la tarjeta en
    el banco es `card_settlement`;
  - los 702 gastos de Amex existentes se quedan como están: Ricardo les asignará concepto a
    mano más adelante;
  - una compra de Supermercado pagada con Amex (`payment_type = 'amex'`) **sí aparece en la
    lista de la Amex** (confirmado por Ricardo, como en la especificación funcional 5.5): se
    crea su gasto en `amex_expenses` con `purchase_id` y concepto Casa › Compra; editar o
    borrar la compra lo actualiza. En el Balance cuenta una sola vez, en «Compra», porque los
    gastos con `purchase_id` ya se excluyen. Por defecto `paid_by = 'otros'` (Casa), con
    selector «Pagado por» en el formulario.
- **Conceptos de Andrea, según la lista de Ricardo (18/11/2026)**, aplicados con la sesión
  admin y copia previa de sus tablas: subtotales «Total Ingresos» y «Seguros»; renombrados
  (con importes, comentarios y periodicidad): Salario UCM → UCM, Clínica Alandez → Alández,
  Diez → Díez y Bonilla, Proxidental (Getafe) → Proxidental, Seguro Ocaso/AMA (V/TA)/AXA/
  AMA (R.C.) → OCASO/AMA (VITA)/AXA/AMA (R.C), Cuota Autónomos → Cuota autónomos, Gastos
  Comunes Ricardo → Gastos comunes casa, Ahorro mensual viajes → Viajes, Otros Ahorro →
  Otras inversiones; nuevos (a mano): Clínica Prieto & Serrano, Curaprox, Cursos y
  ponencias, Joana, Hacienda, Andbank. Los ingresos que no estaban en la lista (Otros, El
  Rosario, Adelaida Parra, Sanitas Valdebebas, Las Tablas) siguen activos en Total Ingresos.
  **Archivados** los gastos variables (Gastos de Pagos: Ocio, Belleza, Compras, Coche, Otros
  gastos; sin nada apuntado): por eso **no se puede apuntar a mano un gasto en el Balance de
  Andrea** (la app avisa); decisión de Ricardo. Sumas de `andrea_balance` por año y bloque
  iguales antes y después. La app de producción tiene nombres fijos en su código: allí los
  renombrados pueden verse vacíos.
- **Conceptos de Casa, según la lista de Ricardo (18/11/2026):** subtotales Total Ingresos
  (Traspaso Ricardo, Traspaso Andrea, Otros ingresos, Plan Ahorro Sabadell), Suministros
  (Comunidad, Electricidad, Sunflower, Agua, Verisure) y Suscripciones (Costco, Amex,
  Vorwerk, Netflix, ChatGpt); sueltos Farmacia/Suplementos, Compra, Ocio, Amazon, Cosas de
  Casa, Seguro Hogar, Otros gastos. Origen: banco, salvo Compra (Supermercado) y Otros gastos
  (gastos a mano). Los 1.022 movimientos de Casa siguen sin concepto (se asignan en Revisar).
  Los de Gastos tienen `pagos_visible` (se ofrecen en la Amex y en el ➕ al elegir Casa).
- **Selector de concepto (comprobado el 18/11/2026):** en Movimientos, la columna y el filtro
  ofrecen solo los conceptos del Balance de la pestaña; en el formulario de gastos a mano
  (Amex y ➕), los del Balance elegido en «Cuenta en el Balance de». Andrea no tiene conceptos
  de gastos para ese formulario (sus fijos son «a mano» y los variables están archivados).
- **Conceptos de Ricardo, según su lista (18/11/2026):** subtotales Total ingresos, Casa,
  Gastos Financieros, Coche, Suscripciones, Salud/Belleza, Transporte y Ocio; los nombres
  repetidos llevan su grupo entre paréntesis («Otros (Coche)», «Transferencias (gasto)»…).
  Renombrados con sus movimientos: Indexa → Indexa común, Belleza → Peluquería, Salud →
  Otros (Salud/Belleza), Gastos financieros → Otros gastos (financieros), Préstamo →
  Préstamo Master, Seguro Coche → Seguro, Coche/Transporte/Ocio → Otros (…), Aportación a
  Casa → Transferencias (gasto). Costco y Otras suscripciones se quedan en Suscripciones.
  Archivados los subtotales vacíos Suministros y Gastos de Pagos. **Todos toman el importe
  del banco** (antes Ocio, Deporte, Belleza, Compras, Coche y Otros gastos tenían origen
  Pagos y sus 188 movimientos no contaban); los de Gastos tienen `pagos_visible` para el
  formulario de gastos a mano. Comprobado: 456 movimientos con concepto, todos cuentan.
  Hay copia previa de las tablas de los tres Balances (fuera del repositorio).
- **El bloque «Ahorro» se llama «Inversión»** en toda la app (decisión de Ricardo); el
  «Ahorro» del Resumen (ingresos − gastos) no cambia.
- **Modo manual en Balances, decidido por Ricardo el 18/11/2026:** botón «Modo manual» (no en
  Desvío). En Real, cada celda de concepto es una casilla: lo escrito se guarda al salir o con
  Intro como importe a mano (manda sobre el automático; vacía = vuelve el automático, o 0 en un
  concepto manual). En Presupuesto, la casilla es la partida del mes (vacía = sin partida).
  Subtotales, totales y resultado se recalculan al momento en el navegador (`applyCellEdits` /
  `recalcSheet` en `lib/calc/balance.ts`) y luego llega la hoja guardada. Ordenador y móvil.
- **Modelo operativo de la Amex, explicado por Ricardo el 23/11/2026** (sustituye a lo
  anterior sobre gastos de la Amex en los Balances):
  - se paga con la Amex (Ricardo o Andrea) → se apunta en la **lista de la Amex** como
    pendiente → cada uno **transfiere desde su cuenta** (Ricardo: Bankinter) **a la cuenta de
    Casa** donde se carga la Amex → se marca como traspasado. Algunos gastos (la compra) **no se
    traspasan**: son de Casa. La Amex se cobra hacia el día 2; el extracto **cierra el 26**;
  - por eso la **lista de la Amex es un registro aparte y NO suma en ningún Balance**
    (`.neq("wallet","amex")` en `lib/data/balance.ts` y en `listManualPayments`): el gasto
    cuenta en el Balance personal por la transferencia del extracto y en Casa por el cargo de
    la Amex (concepto Casa › Amex). Los gastos a mano **sin** Amex (Bankinter, efectivo…)
    siguen sumando (decisión de Ricardo; ojo con cargar luego ese gasto desde el extracto);
  - en un gasto de la Amex se elige **«Lo paga»: Casa · Ricardo · Andrea** (formulario y bot).
    Persona → pendiente de traspaso por defecto; Casa → `paid_by = 'otros'`, nunca pendiente.
    El concepto se sigue pidiendo, solo informativo. Compras del Súper con Amex → Casa, sin
    traspaso. Reglas en `lib/calc/pagos.ts` (`amexPayer`, `amexPeriod`, `amexCycle`);
  - pestaña Amex: resumen y filtro por «Lo paga» y **cuadre del periodo** (27 → 26) por
    persona: gastado, traspasado, pendiente; y Casa (sin traspaso). **En vivo**: la pestaña se
    refresca cada 30 s y al volver a ella. Comprobado: periodo 27/10–26/11 = base de datos.
- **Bot de Telegram para apuntar gastos (20/11/2026):** mensaje libre → Claude
  (`claude-opus-5-5`, esfuerzo bajo, salida estructurada, `fallbacks: "default"`;
  `lib/telegram/parse.ts`) saca importe, descripción, fecha, Amex y medio de pago → botones
  **Casa · Ricardo · Andrea** → si no es Amex y no se dijo el medio, botones con los de quien
  escribe → se guarda en `amex_expenses` con las reglas del formulario (concepto sugerido del
  Balance o «Otros gastos»; pendiente si Amex y no Casa; comentario «Apuntado desde
  Telegram») → botón «Deshacer». Webhook `app/api/telegram` (público en el proxy, protegido
  por `TELEGRAM_WEBHOOK_SECRET`); solo atiende a `TELEGRAM_USERS` («idTelegram:persona,…»);
  escribe con `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts`, solo para el bot).
  Estado de los botones en `telegram_pending` (**script 12**, RLS sin políticas).
  **Funcionando desde el 20/11/2026:** bot **@rqs_casa_bot**; script 12 ejecutado; claves en
  Vercel (producción y preview, sensibles) y en `.env.local`; webhook registrado con
  `secret_token` y `allowed_updates` message + callback_query; comando /ayuda. Autorizado:
  Ricardo (`TELEGRAM_USERS=1169906598:ricardo`); Andrea, pendiente de su id (escribe /start y
  el bot se lo dice). Al cambiar `TELEGRAM_USERS` hay que volver a desplegar. Probado: Claude
  entiende 6 mensajes de ejemplo (coma decimal, miles, «ayer», «el lunes», medio de pago,
  «hola» → pregunta); primer gasto real de Ricardo guardado bien (Bankinter, Otros gastos).
  **Selector de concepto (20/11/2026, decisión de Ricardo):** tras Balance y medio de pago, el
  bot muestra los conceptos de gastos de ese Balance tal como están en la app (los que ofrece
  el formulario de gastos a mano: enlazados a Pagos o con `pagos_visible`, sin archivar), en
  su orden, con los grupos (subtotales) que se abren y «‹ Volver», y arriba el sugerido (⭐,
  por historial de `amex_expenses`). Con un solo concepto (Andrea: «Otros gastos») no
  pregunta. Desde este cambio, «+ Concepto» marca `pagos_visible` en todo concepto de gastos
  automático (antes solo si el origen era Pagos); se marcaron Casa › Comisiones Financieras y
  Plan Ahorro Sabadell, que no salían.
- **Resumen sale de Balances, decidido por Ricardo el 18/11/2026** (antes: todos los
  movimientos del banco del Balance, con o sin concepto, y Andrea salía a 0): tarjetas, YTD,
  gráfico de 12 meses y gasto por concepto = hoja de Balances «Real» del Balance elegido
  (`getBalance` en `lib/data/summary.ts`). Ingresos = Total ingresos; Gastos = Total gastos;
  **Ahorro = Ingresos − Gastos** (lo invertido cuenta como ahorro); tasa = ahorro ÷ ingresos.
  Los movimientos sin concepto no cuentan hasta que se les asigna uno. Supermercado y Amex no
  cambian. Comprobado (Casa, Ricardo, Andrea): YTD = suma enero–noviembre de Balances.
- **Resumen · acumulado del año (18/11/2026):** las tarjetas Ingresos, Gastos, Ahorro y Tasa
  de ahorro llevan en pequeño «YTD <año>» (acumulado de enero al mes elegido) (`yearToDate` en
  `lib/calc/summary.ts`, mismas reglas que el mes; tasa = ahorro ÷ ingresos del año). Sale de
  la tendencia de 12 meses (siempre incluye enero..mes).
- **Sin grupo «Total ingresos» (18/11/2026, decisión de Ricardo):** duplicaba el total del
  bloque. Quitado en Casa, Ricardo y Andrea con `fc_delete_concept`; sus conceptos quedan
  sueltos en Ingresos, en el mismo orden y con todo lo que tenían.
- **Formato de cifras, decidido por Ricardo el 18/11/2026:** todos los importes de dinero de
  la app con **1 decimal y «€»** («1.234,6 €»), también la hoja de Balances (antes redondeada
  al euro y sin «€») y los ejes de gráficos; porcentajes con 1 decimal; recuentos, enteros.
  Todo sale de `lib/format.ts` (`formatAmount`, `formatSignedAmount`, `formatCellRounded`…).
  Las casillas de edición siguen admitiendo y mostrando céntimos exactos.
- **Menú lateral plegable (ordenador, 18/11/2026):** icono en la cabecera del menú para
  ocultarlo y botón arriba a la izquierda para mostrarlo. Se recuerda en el navegador
  (`localStorage` `fc-sidebar`) y se aplica antes de pintar con un script en `app/layout.tsx`
  que pone `data-sidebar="closed"` en `<html>`; las reglas están en `globals.css` **fuera de
  `@layer`** (si no, `lg:flex` / `lg:pl-[260px]` mandan). Ojo: tras cambiar `globals.css`,
  una compilación local puede reutilizar CSS antiguo; `rm -rf .next` lo arregla.
- **Hoja anual de Balances a lo ancho (18/11/2026):** la página de Balances usa hasta 1840 px
  (`data-wide` + `has-[[data-wide]]` en `app-shell.tsx`; el resto sigue en 1240 px). Tabla más
  compacta: en 1440 px caben los 12 meses y el Total (también Andrea con Notas); en modo manual
  caben a partir de ~1600 px. Si no caben, la tabla va en su caja con scroll propio, cabecera
  de meses y columna de conceptos fijas, altura ajustada a la pantalla (la barra horizontal
  queda a la vista) y barra siempre visible (`.scrollbar-visible` en `globals.css`).
- **Ocultar fila (como en Excel):** icono de ojo junto a la papelera de cada concepto en
  Balances (tabla y móvil). Es el mismo «Ocultar» del menú «⋯»: solo para quien la oculta
  (`user_preferences`), sigue sumando, y se ven con «N filas ocultas · Mostrar».
- **Extractos y lo escrito a mano:** al pulsar «Importar», si algún movimiento cae en un
  concepto enlazado al banco y mes con importe escrito a mano, se listan esos casos y en cada
  uno se elige «Mantener lo escrito» (por defecto) o «Usar el extracto» (se borra lo escrito
  en esa celda tras importar). Decisión de Ricardo: uno por uno.
- **Columna «Notas» en el Balance de Andrea** (ordenador), a la derecha de Concepto: es el
  texto de periodicidad (`andrea_concepts.periodicity`), editable ahí mismo. La periodicidad
  pasa a ser texto libre también en «Editar…» (antes un desplegable de 4 valores, que borraba
  textos como «Día 20 c/trim»). "" = vaciado a propósito: ya no se recurre al texto antiguo
  de `andrea_periodicity`.
- **Script 11 ejecutado** (18/11/2026). Borrado probado con la sesión de Ricardo: un concepto
  de prueba con 1 € escrito pasó su importe a «Otros (Ahorro)»; se limpió después.
- **Borrar conceptos, decidido por Ricardo el 18/11/2026** (antes un concepto solo se
  archivaba): icono de papelera a la izquierda de cada concepto en Balances (tabla y móvil).
  Avisa de lo que tiene y adónde va; al confirmar, **todo lo asignado pasa a su «Otros»**:
  el «Otros…» de su mismo grupo; si no, el «Otros…» suelto del bloque (primero «Otros gastos»
  / «Otros ingresos» / «Otras inversiones»); si no hay, se crea (o se recupera si está
  archivado). Movimientos, gastos a mano y compras cambian de concepto; importes escritos y
  presupuesto se suman si el destino ya tiene ese mes; comentarios se juntan. Un subtotal
  se borra y sus conceptos quedan sueltos. Lo hace `fc_delete_concept` (**script 11**,
  SECURITY DEFINER, todo o nada, solo en los Balances del rol). Sin el script, la app avisa.
- **Gastos a mano: Balance + casilla Amex, decidido por Ricardo el 18/11/2026** (sustituye a
  «paga Andrea o Ricardo; va a Casa o al Balance de quien pagó»):
  - el formulario (lista de la Amex, ➕ y editar desde Movimientos) pide **Balance** (Casa ·
    Ricardo · Andrea), concepto de ese Balance y la casilla **Amex** (marcada por defecto en
    la lista de la Amex, sin marcar en el ➕). Sin Amex se sigue eligiendo medio de pago (los
    de quien apunta). Se mantiene «Pendiente de traspaso» y «Marcar como traspasados»;
  - ya no se pregunta «Pagado por». `paid_by` se rellena solo: con Amex, la persona del
    Balance (en Casa, quien apunta o el que ya tenía); sin Amex, quien apunta. En
    Supermercado se quitó también el selector (las compras antiguas conservan el suyo);
  - la lista de la Amex resume y filtra **por Balance** (el del concepto; sin concepto, el
    de quien pagó; compras del Súper y antiguos «otros», Casa) — `balanceOf` en
    `lib/calc/pagos.ts`, la misma regla que usa Movimientos;
  - Andrea recupera «Otros gastos» (gastos a mano) para poder apuntarle gastos; sus demás
    variables siguen archivados. Las compras del Súper con Amex siguen saliendo en la Amex;
  - probado con Ricardo (390 px): alta Amex en Andrea › Otros gastos (pendiente marcado),
    alta con ➕ sin Amex en Casa con Bankinter, ambos borrados; cifras de la Amex iguales
    antes y después.
- **Movimientos sustituye a Pagos, decidido por Ricardo el 18/11/2026** (cambio tras la fase 5;
  sustituye a la pantalla única de Pagos con selector, que duró unas horas):
  - menú: Resumen · Contabilidad (Balances, Presupuesto) · Supermercado · **Movimientos**.
    Movimientos ya no está dentro de Contabilidad y la sección Pagos desaparece;
  - `/movimientos`: pestañas **Casa · <persona> · Amex** (`?balance=personal`, `?ver=amex`;
    admin elige la persona con su selector, como en Balances) y botón **Extractos**
    (`/movimientos/extractos`, antes «Cargar extracto»). «Revisar» sigue en
    `/movimientos/revisar` (solo movimientos del banco);
  - Casa y la persona: **una sola lista** con los movimientos del banco y los gastos
    apuntados a mano (`amex_expenses` sin `purchase_id`), por fecha, con la etiqueta
    «A mano». Cada gasto a mano sale en una sola pestaña: la del Balance de su concepto; sin
    concepto, la de quien pagó («otros», en Casa). Los de la Amex salen además en la pestaña
    Amex. Filtros: «Cuenta» tiene «Gastos apuntados a mano»; «Ingresos» y «No cuentan» los
    ocultan. Tocar uno abre el formulario de siempre (el de la Amex si se pagó con ella);
  - el formulario de alta (➕) **se queda como estaba** (tarjetas del banco, efectivo y Amex),
    por decisión de Ricardo, aunque un pago con tarjeta del banco puede quedar también en el
    extracto;
  - redirecciones en `next.config.ts`: `/contabilidad/movimientos/*`, `/pagos`,
    `/pagos/amex`, `/pagos/personales`. El origen «pagos» de los conceptos se llama ahora
    «Gastos apuntados a mano»;
  - el «+ Nuevo» medio de pago se crea para la persona del formulario (no la de la cookie);
  - probado (18/11/2026) con Ricardo (390 y 1440 px) y admin (390 px): Ricardo noviembre
    5 a mano / 392,45 €, Andrea 16 a mano (como en Pagos); alta con ➕ en Casa, abrir desde la
    lista y borrar, sin errores ni scroll horizontal.
- **Pagos, decidido por Ricardo el 18/11/2026** (fase 4):
  - paga siempre **Andrea o Ricardo**; «otros» solo se conserva en los gastos antiguos (al
    editarlos se puede dejar, y entonces van a Casa). En Supermercado con Amex, «Pagado por»
    es Andrea o Ricardo (por defecto quien ha entrado);
  - el gasto va al Balance de quien pagó **o a Casa**. Si Ricardo apunta algo que pagó
    Andrea, va al Balance de Andrea aunque él no lo vea: los nombres de los conceptos de Pagos
    de todos salen de la función `fc_pagos_concepts()` (script 08);
  - concepto obligatorio: se sugiere por gastos parecidos ya clasificados (misma regla que al
    cargar extractos); si no hay, «Otros gastos» de ese Balance. Casa no tiene ninguno: la app
    lo crea (enlazado, origen Pagos) la primera vez que se guarda un gasto en Casa;
  - «Pendiente de traspaso» se marca por defecto si el gasto va a un Balance personal y no
    si va a Casa (se puede cambiar).
- **Balances, detalles de la entrega 1:**
  - lo escrito a mano (`andrea_balance`) cuenta en cualquier mes, también futuros, como en
    producción; lo automático, solo hasta el mes en curso;
  - `andrea_balance` se casa con el concepto por `concept_id` o, si falta, por nombre dentro
    del Balance. Si queda algún importe sin concepto, la pantalla lo avisa (no suma);
  - Pagos: no cuentan los gastos con `purchase_id` (ya cuentan en Supermercado). Las compras
    de Supermercado sin concepto van a «Compra» de Casa;
  - desvío = real − presupuesto solo donde hay presupuesto y el mes ha empezado; en Gastos,
    negativo es bueno. Hoy `monthly_budgets` está vacía: Presupuesto y Desvío salen «—»;
  - hoja anual de ordenador redondeada al euro (13 columnas no caben con céntimos); el
    importe exacto va en el `title`. Móvil con 2 decimales;
  - conceptos archivados solo aparecen si tienen algún importe en el año.
- **Balances, entrega 2:**
  - quitar un importe a mano o un comentario borra su fila (`andrea_balance` /
    `andrea_comments`). Un concepto se archiva o, desde el 18/11/2026, se borra (ver
    «Borrar conceptos»);
  - renombrar cambia también `concept` (y pone `concept_id`) en importes y comentarios;
  - orden compartido en `andrea_concepts.sort_order` (se renumera de 10 en 10 al mover);
    filas ocultas por usuario en `user_preferences` (`key = 'balance_hidden'`,
    `value = {owner: [ids]}`); siguen sumando, como en producción;
  - periodicidad en `andrea_concepts.periodicity`; si está vacía se muestra la de
    `andrea_periodicity` (por nombre);
  - «rellenar año» solo para conceptos manuales: escribe el importe en los 12 meses;
  - las celdas se escriben buscando la fila existente (por `concept_id` o nombre) y
    actualizándola; si no hay, se inserta. No se usa upsert para no depender de índices únicos.
- **Supermercado:** datos (18/11/2026): 160 compras (dic. 2024 – oct. 2026), 496 líneas, todas
  con `catId`; ninguna pagada con Amex; ya no hay años «0026». Una compra tiene un total
  distinto de la suma de sus líneas: el gasto del mes usa el total y el detalle lo avisa. Las
  medias por categoría usan las líneas. Con Cache Components, la página lee la sesión antes
  de la hora (`new Date()` necesita un acceso dinámico previo).
- **Balance de Andrea en producción** (`dashboard-rqs.vercel.app/js/andrea.js`): todo manual.
  Importes de `andrea_balance` por nombre de concepto y mes (en positivo), conceptos fijos en
  el código + `andrea_concepts`; resultado = ingresos − gastos − ahorro; las filas ocultas
  suman; orden, ocultos, renombres y borrados de conceptos fijos solo en `localStorage`.
- **Datos (18/11/2026):** ningún gasto de `amex_expenses` ni compra de `supermarket_purchases`
  tiene `concept_id`; `andrea_balance`, `andrea_comments` y `andrea_periodicity` no tienen
  filas visibles para `ricardo` (serán de Andrea). El catálogo de Ricardo tiene sus conceptos.
- **Importación:**
  - el archivo se lee en el navegador (`lib/import/parse-file.ts`, SheetJS 0.20.3 desde el
    CDN oficial; la de npm tiene CVE);
  - duplicado = `import_hash` existente **o** ya hay en la cuenta tantos movimientos con la
    clave fecha|importe|descripción normalizada como apariciones lleva el archivo (también con
    la lectura «antigua» de los CSV UTF-8 mal decodificados);
  - hash nuevo = sha256(cuenta|fecha|importe|descripción normalizada), como dice la
    especificación, más `|n` desde la 2.ª fila idéntica del archivo (decisión de Ricardo);
  - plantillas: se leen letras y nombres, y se guardan en **letras** (las entiende producción);
  - concepto sugerido: misma descripción normalizada, o similitud de palabras ≥ 0,6;
  - máximo 3.000 filas por archivo.
- Comprobado con el extracto real de Sabadell (formato .xls binario): las 219 filas dan la
  misma clave de duplicado que la lectura de producción.

## 6. Cómo probar

- `npm run dev` → http://localhost:3000. Producción local: `npm run build && PORT=3100 npm start`.
- GitHub CLI: instalado con Homebrew y autenticado localmente (`gh auth status`, 18/11/2026).
- **Credenciales de prueba:** `.env.test.local` (git lo ignora) con `FC_TEST_EMAIL` y
  `FC_TEST_PASSWORD`. Los valores pueden llevar espacios en los extremos: hay que quitarlos
  al leerlos. Nunca mostrar su contenido.
- Las capturas se hicieron con Playwright instalado en un directorio temporal (no forma
  parte del proyecto). Para volver a usarlo: `npm i playwright` en una carpeta aparte y
  `npx playwright install chromium`.
- Para revisar la maqueta sin datos, se crearon rutas temporales `app/zz-preview/*` con datos
  inventados, añadiendo `/zz-preview` a `PUBLIC_PATHS` en `lib/supabase/proxy.ts`. **Hay que
  borrarlas y restaurar el proxy antes de cada commit.**
- Con Cache Components, `usePathname()` fuera de `<Suspense>` rompe el build en rutas
  dinámicas; las rutas actuales son estáticas.

## 7. Mapa del código

```
app/login, app/sin-acceso              públicas / sin rol
app/(app)/layout.tsx                   carcasa (menú y barra inferior)
app/(app)/resumen                      Paso 2
app/(app)/movimientos                  banco + gastos a mano + Amex (+ extractos/, revisar/,
                                       actions.ts, pagos-actions.ts)
app/(app)/contabilidad                 Balances y Presupuesto
app/(app)/supermercado                 Supermercado
lib/data/                              ÚNICO acceso a datos (session, summary, transactions,
                                       concepts, accounts, imports, query)
lib/calc/summary.ts                    reglas del apartado 6 (puras)
lib/import/                            normalize, parse-file (navegador), suggest, hash (servidor)
lib/balance.ts, lib/labels.ts          roles, Balances, etiquetas compartidas
supabase/sql/                          scripts para que Ricardo los revise y ejecute
```
