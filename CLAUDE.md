# Finanzas Casa · instrucciones para Claude Code

- La especificación está en `docs/ESPECIFICACION.md`. Léela entera antes de cambiar código y síguela; si algo no está claro o contradice el código, pregunta antes de inventar.
- Conecta con la base de datos de Supabase **existente**. Prohibido borrar, renombrar o cambiar tipos de tablas o columnas existentes. Cualquier cambio de esquema va en un fichero nuevo en `supabase/sql/` que Ricardo revisa y ejecuta a mano; no lo ejecutes tú.
- Nunca escribas datos reales en código, tests, logs ni commits. Las claves solo en `.env.local` (fuera de git).
- Sesión obligatoria en todas las rutas salvo `/login`. El usuario y su rol salen siempre de la sesión en el servidor; nunca de un parámetro del navegador.
- Todo el acceso a datos pasa por un único módulo (`lib/data/`), que aplica el filtro por Balance (`owner`) y rol. Las pantallas no hacen consultas sueltas.
- Movimientos: solo `flow = 'normal'` cuenta en ingresos y gastos.
- Supermercado: usar `supermarket_purchases` y agrupar por `catId`. No usar `purchase_batches` / `purchase_items`.
- Estilo A: colores solo mediante los tokens de la especificación; Manrope; cifras `tabular-nums` y formato `es-ES`.
- Next.js: esta versión puede traer cambios incompatibles con lo que conoces. Antes de usar una API, consulta la documentación incluida en `node_modules/next/dist/docs/` y respeta los avisos de obsolescencia.
- Antes de dar algo por terminado: `npm run lint`, `npm run build` y prueba manual en ancho móvil (390 px) y ordenador (1440 px).
- Commits pequeños y con mensaje en español. No hagas push salvo que Ricardo lo pida.

@AGENTS.md
