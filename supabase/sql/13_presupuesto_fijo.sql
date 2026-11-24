-- =====================================================================
-- Finanzas Casa · Script 13 · Presupuesto fijo por concepto (para revisar)
-- =====================================================================
-- Decisión de Ricardo (24/11/2026): el presupuesto es un importe fijo al
-- mes por concepto, igual para todos los meses (ya no mes a mes).
--
-- Qué hace: AÑADE la columna public.andrea_concepts.monthly_budget
-- (importe en euros, vacío = sin presupuesto, no negativo).
--   · Los permisos ya existen: quien puede cambiar un concepto (script 05,
--     política fc_concepts_update) puede cambiar su presupuesto.
-- Qué NO hace: no borra public.monthly_budgets (hoy vacía; la app deja de
-- usarla) ni cambia ningún otro dato o política.
--
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

alter table public.andrea_concepts
  add column if not exists monthly_budget numeric(12, 2);

alter table public.andrea_concepts
  drop constraint if exists andrea_concepts_monthly_budget_check;
alter table public.andrea_concepts
  add constraint andrea_concepts_monthly_budget_check check (monthly_budget is null or monthly_budget >= 0);

commit;

-- Comprobación: debe devolver una fila (numeric).
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'andrea_concepts' and column_name = 'monthly_budget';

-- Deshacer:
-- alter table public.andrea_concepts drop column if exists monthly_budget;
