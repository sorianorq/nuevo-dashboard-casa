# Estado del proyecto · traspaso entre sesiones

Última actualización: 18/11/2026 (permisos aplicados, filas idénticas al importar).

Este documento resume lo hecho, lo pendiente y las decisiones tomadas, para que
cualquier sesión nueva pueda continuar sin el historial del chat. Léelo después
de `CLAUDE.md` y `docs/ESPECIFICACION.md`. Actualízalo al terminar cada paso.

## 1. Situación en una frase

La **fase 1 está programada** (Pasos 0–3) y los **permisos por Balance ya están
aplicados** (script 04 ejecutado por Ricardo el 18/11/2026). El Resumen de Casa (marzo de 2026)
coincide con la base de datos completa. Falta probar el guardado real.

## 2. Hecho

| Paso | Commit | Contenido |
|---|---|---|
| 0 | `9cb6312` | Next.js 16.4 (App Router, TS, Tailwind 4, ESLint), shadcn/ui (base-nova, Base UI), Recharts, `@supabase/ssr`. `.env.local` solo con URL y clave anon. |
| 1 | `35ce583` | Tokens del estilo A, Manrope, formato es-ES (`lib/format.ts`), login, `proxy.ts`, rol desde `user_roles`, pestañas de Balance y selector de admin, menú lateral y barra inferior con ➕ («Próximamente»), rutas de todas las secciones. |
| 2 | `d2fb7d1` | Resumen: reglas del apartado 6 en `lib/calc/summary.ts` (funciones puras), consultas en `lib/data/summary.ts`, gráfico de 12 meses con vista de tabla, gasto por concepto, Supermercado y Amex. |
| 3 | `609153c` | Movimientos (filtros, lista o tabla, concepto con buscador, «+ Nuevo concepto», aplicar a parecidos, tipo de flujo), revisión uno a uno de movimientos sin concepto, Cargar extracto en 3 pasos. |
| 2a | (este) | Balances, solo lectura: hoja anual Real / Presupuesto / Desvío (ordenador), mes a mes (móvil), subtotales plegables, clic en un importe automático → sus movimientos. Reglas en `lib/calc/balance.ts`, datos en `lib/data/balance.ts`. Comprobado con la sesión de `ricardo` (Casa y Ricardo 2026): totales por bloque iguales a una suma directa en la base de datos; 390 y 1440 px sin errores ni desbordamiento. |
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
5. **Fase 2 · Balances.** Entrega 1 (solo lectura) hecha el 18/11/2026; ver apartado 2.
   Falta:
   - Ricardo añade `FC_ADMIN_EMAIL` / `FC_ADMIN_PASSWORD` a `.env.test.local` → probar rol
     admin y comparar el Balance de Andrea con producción (criterio de la fase 2);
   - entrega 2: importes manuales, comentarios por celda, + Concepto / + Añadir, ocultar,
     reordenar y renombrar (en `user_preferences` / `andrea_concepts`), con un script 05 de
     permisos de escritura sobre `andrea_balance`, `andrea_comments`, `andrea_periodicity`
     y `user_preferences` (el 04 no los cubre);
   - también sin probar: guardar concepto, flujo, nueva cuenta o nuevo concepto en Movimientos.
6. Fases 3–5: Supermercado, Pagos (Amex y personales), Presupuesto y el alta rápida del ➕.

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
app/(app)/contabilidad/movimientos     Paso 3 (+ cargar/, revisar/, actions.ts)
lib/data/                              ÚNICO acceso a datos (session, summary, transactions,
                                       concepts, accounts, imports, query)
lib/calc/summary.ts                    reglas del apartado 6 (puras)
lib/import/                            normalize, parse-file (navegador), suggest, hash (servidor)
lib/balance.ts, lib/labels.ts          roles, Balances, etiquetas compartidas
supabase/sql/                          scripts para que Ricardo los revise y ejecute
```
