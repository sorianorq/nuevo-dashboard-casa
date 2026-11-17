# Finanzas Casa · Especificación para desarrollo

App de contabilidad doméstica de Andrea y Ricardo. App nueva, construida desde cero, conectada a la base de datos de Supabase **existente** (sin migrar datos). Documento funcional completo (para humanos): https://claude.ai/artifact/87GvojJjrk5WAT77UMhLj4 · Maquetas: https://claude.ai/artifact/99Yo98ka24Nb727EkDWWzF

---

## 1. Stack y principios

- Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Recharts, `@supabase/ssr`. Despliegue en Vercel.
- Una sola app **responsive**: móvil (barra inferior) y ordenador (menú lateral).
- **Seguridad:** todo acceso a datos con la sesión del usuario (clave anon + RLS). La `service_role` solo en el servidor y solo si es imprescindible; **nunca** se acepta un `userId` enviado desde el navegador: el usuario sale siempre de la sesión.
- Importes con 2 decimales y formato `es-ES` (1.234,56 €), dígitos `tabular-nums`, alineados a la derecha. Fechas dd/mm/aaaa.
- Código e identificadores en inglés; textos de la interfaz en español.

## 2. Usuarios, roles y Balances

- 3 usuarios de Supabase Auth. Rol en `user_roles(user_id, role)` con `role ∈ {ricardo, andrea, admin}`. `profiles` **no se usa**.
- Cada dato pertenece a un **Balance** (`owner`): `casa`, `andrea` o `ricardo`.
- Visibilidad:
  - `andrea` → Casa + Andrea · `ricardo` → Casa + Ricardo · `admin` → todo.
  - Resumen, Supermercado y American Express → todos.
- **Admin:** en Balances, Movimientos, Presupuesto y Pagos aparece arriba, centrado, el selector `Admin · ver datos de: [Andrea | Ricardo]`; las subpestañas pasan a ser `Casa | <persona elegida>`.
- Mapeo de cuentas: `accounts.ownership_scope` = `common` → casa, `ricardo` → ricardo, `andrea` → andrea.

## 3. Navegación

```
Resumen
Contabilidad
  ├─ Balances      → pestañas [Casa | <usuario>]
  ├─ Movimientos   → pestañas [Casa | <usuario>] + botón «Cargar extracto»
  └─ Presupuesto   → pestañas [Casa | <usuario>]
Supermercado
Pagos
  ├─ American Express (compartida)
  └─ Pagos (los del usuario)
```

- **Ordenador:** menú lateral fijo (≈260 px). Secciones principales con icono, 15 px, negrita. Contabilidad y Pagos con flecha desplegable; abiertas muestran subsecciones sangradas con línea guía vertical; por defecto abierta la sección actual; varias pueden estar abiertas. Sección sin hijos activa = fondo acento y texto blanco. Arriba: logo + botón «+ Añadir gasto». Abajo: usuario + Ajustes.
- **Móvil:** barra inferior `Resumen · Contabilidad · ➕ · Súper · Pagos`; el ➕ abre el alta rápida de gasto (hoja inferior) desde cualquier pantalla. Subsecciones = pestañas segmentadas arriba.
- Cambio automático por ancho (breakpoint `lg` para el menú lateral).

## 4. Diseño · estilo A (claro y cálido)

Definir como tokens (CSS variables + tema Tailwind/shadcn), nunca colores sueltos en componentes:

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#F7F5F0` | Fondo app |
| `--surface` | `#FFFFFF` | Tarjetas, menú, tablas |
| `--border` | `#E7E2D8` | Bordes |
| `--text` | `#14171F` | Texto principal, botón primario |
| `--muted` | `#5B6170` | Texto secundario |
| `--accent` | `#8A6A2F` | Activo, barras, destacados |
| `--accent-soft` | `#F6EFE2` | Fondos activos |
| `--positive` | `#0F766E` | Ingresos, mejoras |
| `--warning` | `#B4500B` | Excesos, empeoramientos |
| `--track` | `#EEEAE2` | Fondo de barras de progreso y pestañas |

- Tipografía **Manrope** (400–800) vía `next/font`. Título de página 28 px (móvil) / 32 px (ordenador); etiqueta de sección encima en mayúsculas 12 px acento; texto 14 px; mínimo 11 px.
- Tarjetas radio 16 px, borde 1 px; botones ≥ 44 px de alto; pestañas segmentadas sobre `--track`.
- Ingresos con «+» en `--positive`; gastos con «−». El color nunca es la única señal (▲/▼ o signo).
- Accesibilidad: contraste ≥ 4,5:1, foco visible, `aria-label` en botones de solo icono.
- Preparado para modo oscuro (otro juego de tokens), aunque no se implementa ahora.

## 5. Base de datos (existente, ya preparada con los scripts 01 y 03)

Tablas y columnas que usa la app (no renombrar ni borrar nada):

- **`user_roles`** `(user_id uuid pk, role text)`.
- **`accounts`** `(id, user_id, name, bank, account_type, currency, ownership_scope, created_at)`.
- **`import_templates`** `(id, user_id, account_id, header_row, data_start_row, start_column, date_column, description_column, amount_column, balance_column, …)` · única `(user_id, account_id)`.
- **`transactions`** `(id, user_id, account_id, transaction_date date, amount numeric (gasto negativo), description, movement_type 'expense'|'income', balance, import_hash, category_group, category_subgroup, category, owner, concept_id, flow, note, created_at)`.
  - `owner` = Balance (casa/andrea/ricardo). En importaciones nuevas lo elige el usuario.
  - `flow` ∈ `normal | internal_transfer | card_settlement`. **Solo `normal` cuenta** en ingresos/gastos.
  - Duplicados: únicos `(account_id, import_hash)`.
  - `category_*` = categorías antiguas: solo lectura, no se usan para cálculos.
- **`andrea_concepts`** = **catálogo único de conceptos** `(id, user_id, owner, concept, section 'ingresos'|'gastos'|'ahorro', kind 'manual'|'linked'|'subtotal', parent_id, pagos_visible, link_source, periodicity, sort_order, archived)` · única `(owner, concept)`.
  - `subtotal` = suma de sus hijos (`parent_id`). `linked` = su importe real sale de los movimientos/pagos/compras asignados. `manual` = importe escrito en el Balance.
  - `pagos_visible = true` → aparece en el desplegable de Pagos de ese owner (bloque «Gastos de Pagos»).
- **`andrea_balance`** `(id, user_id, owner, year, month, concept text, concept_id, section, amount)` · importes manuales del Balance (y sobrescrituras manuales de conceptos enlazados). Única nueva `(owner, year, month, concept)`.
- **`andrea_comments`** `(…, owner, year, month, concept, concept_id, comment)`; **`andrea_periodicity`** `(…, owner, concept, concept_id, periodicity)`.
- **`amex_expenses`** = tabla de **Pagos** `(id, user_id, expense_date, concept text = descripción, amount numeric positivo, paid_by 'andrea'|'ricardo'|'otros', pending, comments, import_hash, wallet 'amex'|'andrea'|'ricardo', payment_method_id, concept_id, purchase_id, transaction_id)`.
- **`payment_methods`** `(id, owner 'andrea'|'ricardo', name, kind 'tarjeta'|'efectivo'|'otro', sort_order, archived)`.
- **`supermarket_purchases`** `(id, user_id, purchase_date, store_name, payment_type 'tarjeta'|'efectivo'|'otros'|'amex', total, items jsonb, concept_id)`.
  - `items` = `[{catId, concept, amount}]`. **Agrupar siempre por `catId`** (los nombres cambiaron).
  - `purchase_batches` / `purchase_items` = **no usar** (duplicados antiguos).
- **`monthly_budgets`** `(id, year, month, owner, concept_id, budget_amount, …)` · vacía · única `(owner, year, month, concept_id)`.
- **`user_preferences`** `(user_id, key, value jsonb)` · **`product_category_map`** (fase futura) · **`concept_rules`** (sin uso).

Categorías de Supermercado (`catId` → nombre): frutas Frutas y Verduras · carnes Carnes y Aves · pescados Pescados y Mariscos · legumbres Pasta, legumbres y frutos secos · lacteos Lácteos y Huevos · embutidos Embutidos · panaderia Panadería y Bollería · bebidas Bebidas · conservas Conservas · snacks Snacks y Dulces · limpieza Limpieza · higiene Higiene y Cuidados · congelados Alimentos congelados · otros Otros.

**Permisos (RLS):** hoy hay políticas antiguas laxas. El endurecimiento por `owner`/rol se hará con un script de estreno aparte (no en la fase 1). Mientras, la app debe **filtrar igualmente por owner y rol en todas las consultas** y centralizar esa lógica en un único módulo de acceso a datos.

## 6. Reglas de cálculo

| Indicador | Cálculo |
|---|---|
| Ingresos / gastos del mes | Suma de `transactions` con `flow='normal'` del Balance (ingreso `amount>0`, gasto `amount<0`) |
| Ahorro | Ingresos − gastos |
| Tasa de ahorro | Ahorro / ingresos (%); variación en puntos vs mes anterior |
| Gasto Supermercado del mes | Suma de `supermarket_purchases.total` del mes |
| % Supermercado vs mes anterior | Mes en curso: gasto del día 1 a hoy vs gasto del mes anterior del día 1 hasta la **primera fecha de compra igual o posterior** al día de hoy (si no hay, mes completo). Mes cerrado: mes completo vs mes completo |
| Desvío Supermercado vs media 12 m | € y % frente a la media de los 12 meses cerrados anteriores; en mes en curso, frente a la media proporcional a los días transcurridos |
| Amex del mes | Suma de `amex_expenses` con `wallet='amex'` del mes; pendiente = suma con `pending=true` (todas las fechas) |
| Real de un concepto enlazado | Suma de movimientos + pagos + compras con ese `concept_id` en el mes, salvo valor manual en `andrea_balance` |
| Duplicado al importar | `import_hash` = hash de cuenta + fecha + importe + descripción normalizada |

Doble conteo: los cargos `card_settlement` (recibo de la Amex en el banco) no suman; los gastos reales están en Pagos.

## 7. Pantallas de la fase 1

### Resumen
Selector de mes ‹ › y de vista (Casa / usuario). Tarjetas: Ingresos, Gastos, Ahorro, Tasa de ahorro (con variación vs mes anterior). Gráfico 12 meses: barras ingresos/gastos + línea de ahorro. Gasto por concepto (barras; presupuesto cuando exista). Tarjeta Supermercado (gasto, % vs mes anterior, desvío vs media 12 m, minigráfica 12 meses). Tarjeta Amex en 2 columnas (gastado en el mes | pendiente de traspaso). En ordenador: 4 tarjetas en fila, gráfico ⅔ + Supermercado/Amex ⅓, categorías en 2 columnas.

### Movimientos
Pestañas Casa / usuario. Buscador y filtros (mes, cuenta, concepto, tipo). Aviso «N sin concepto · Revisar» (revisión uno a uno). Móvil: lista agrupada por día; ordenador: tabla (fecha, descripción, cuenta, concepto, importe). Concepto editable con desplegable con buscador (conceptos del Balance, agrupados por bloque; opción «+ Nuevo concepto»); al cambiarlo, ofrecer aplicarlo a los movimientos parecidos. `flow` editable (normal / traspaso propio / liquidación de tarjeta). 

**Cargar extracto** (3 pasos): (1) Balance (Casa o el del usuario) + cuenta (filtrada por Balance; crear nueva) + archivo CSV/XLS/XLSX (los .xls de los bancos pueden ser HTML); plantilla de columnas recordada por cuenta en `import_templates`. (2) Previsualización: duplicados marcados (no se importan), concepto **sugerido por historial** (movimiento anterior más parecido del mismo Balance: misma descripción normalizada → su concepto; si no, similitud de texto), editable. (3) Resumen «N nuevos · N duplicados · N sin concepto». Sin reglas fijas.

### Resto de secciones (fases 2–5, no en la fase 1)
Balances (hoja anual Real/Presupuesto/Desvío), Presupuesto, Supermercado, American Express y Pagos personales: en la fase 1 solo existen sus rutas con una pantalla «Próximamente» dentro del layout, para validar navegación y permisos.

## 8. Fuera de alcance por ahora
Alertas (email/WhatsApp), lectura de tickets por foto, análisis avanzado de extractos, modo oscuro.
