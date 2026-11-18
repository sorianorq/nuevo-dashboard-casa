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
8. **Fase 5 · Presupuesto y alta rápida.** Presupuesto **hecho y probado** (18/11/2026,
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
    `andrea_comments`); es lo único que se borra. Un concepto nunca se borra: se archiva;
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
