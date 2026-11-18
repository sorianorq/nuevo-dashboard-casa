# Estado del proyecto · traspaso entre sesiones

Última actualización: 18/11/2026 (permisos aplicados) · último commit de código: `5819a74`.

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

**Sin verificar todavía:** guardar de verdad (concepto, flujo, importación, nueva cuenta o
concepto) y el rol admin. Las importaciones no se han probado contra la base de datos real.

## 3. Pendiente (en este orden)

1. ~~Ricardo ejecuta el script 04~~ (hecho el 18/11/2026).
2. ~~Volver a probar con sesión real~~ (hecho; ver apartado 2).
3. ~~Comparar con `supabase/sql/comprobaciones/resumen_marzo_2026_casa.sql`~~ (hecho el
   18/11/2026: la consulta 1, sin RLS, coincide al céntimo con la app; lo excluido en marzo
   son una liquidación de tarjeta en Casa y traspasos internos en Ricardo, sin filas sin Balance).
4. Probar una importación real con un extracto (Ricardo decide si se guarda).
   - 18/11/2026, **solo vista previa** (sin guardar) con un .xls de Sabadell en la cuenta de
     Casa correcta: la plantilla guardada encaja; los meses ya guardados salen enteros como
     duplicados (mismo recuento por mes que en la base de datos) y los meses posteriores, como
     nuevos. Las demás cuentas dan casi todo nuevo o ninguna fila válida, como se esperaba.
   - **Pendiente de decidir:** dos movimientos idénticos en el mismo archivo (misma fecha,
     importe y descripción; p. ej. dos transferencias iguales el mismo día) dan el mismo
     `import_hash`, y la app descarta el segundo como «repetido en el archivo». Ha pasado en
     este extracto con un abono que parece legítimo.
5. Fase 2 en adelante: Balances, Presupuesto, Supermercado, American Express, Pagos y el
   alta rápida del ➕ (hoy todas son «Próximamente»).

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
- **Importación:**
  - el archivo se lee en el navegador (`lib/import/parse-file.ts`, SheetJS 0.20.3 desde el
    CDN oficial; la de npm tiene CVE);
  - duplicado = `import_hash` existente **o** clave fecha|importe|descripción normalizada
    igual a un movimiento ya guardado en la cuenta (también con la lectura «antigua» de los
    CSV UTF-8 mal decodificados) **o** repetido en el archivo;
  - hash nuevo = sha256(cuenta|fecha|importe|descripción normalizada), como dice la especificación;
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
