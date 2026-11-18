-- =====================================================================
-- Finanzas Casa · Script 10 · Escribir en Presupuesto (para revisar)
-- =====================================================================
-- Necesario para la fase 5 (Presupuesto: + Partida, cambiar importe,
-- quitar partida, Copiar mes anterior, Proponer con histórico).
--
-- Qué hace: AÑADE políticas fc_* en monthly_budgets (como los scripts 04,
-- 05 y 07), usando public.fc_allowed_owners() del script 04: cada rol puede
-- crear, cambiar y quitar partidas de los Balances que ve (andrea → Casa +
-- Andrea · ricardo → Casa + Ricardo · admin → todos). La tabla no tiene
-- user_id, así que la regla es solo por Balance (owner).
-- Qué NO hace: no borra ni cambia políticas existentes, tablas, columnas ni datos.
--
-- Requisito: script 04 ejecutado.
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- =====================================================================

-- 0. (Solo lectura) Columnas de monthly_budgets: la app escribe year, month,
--    owner, concept_id, budget_amount y category_group (= nombre del
--    concepto). Si alguna otra sale con is_nullable = NO y sin valor por
--    defecto, avisa antes de seguir.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'monthly_budgets'
 order by ordinal_position;

begin;

drop policy if exists fc_budgets_insert on public.monthly_budgets;
create policy fc_budgets_insert on public.monthly_budgets for insert to authenticated
  with check (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_budgets_update on public.monthly_budgets;
create policy fc_budgets_update on public.monthly_budgets for update to authenticated
  using (owner = any (public.fc_allowed_owners()))
  with check (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_budgets_delete on public.monthly_budgets;
create policy fc_budgets_delete on public.monthly_budgets for delete to authenticated
  using (owner = any (public.fc_allowed_owners()));

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Comprobación (solo lectura): políticas de monthly_budgets
-- ---------------------------------------------------------------------
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'monthly_budgets'
 order by policyname;

-- ---------------------------------------------------------------------
-- Para deshacer (si hiciera falta):
-- drop policy if exists fc_budgets_insert on public.monthly_budgets;
-- drop policy if exists fc_budgets_update on public.monthly_budgets;
-- drop policy if exists fc_budgets_delete on public.monthly_budgets;
-- ---------------------------------------------------------------------
