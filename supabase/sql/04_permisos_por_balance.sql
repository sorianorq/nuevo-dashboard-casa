-- =====================================================================
-- Finanzas Casa · Script 04 · Permisos por Balance y rol (para revisar)
-- =====================================================================
-- Problema: con las políticas actuales cada usuario solo ve las filas que
-- creó él (user_id = auth.uid()). Así Ricardo y Andrea no ven los conceptos
-- de Casa (son del usuario admin) ni los movimientos de Casa que importó
-- otra persona.
--
-- Qué hace: AÑADE políticas para que cada rol vea y edite su Balance:
--   andrea → casa + andrea · ricardo → casa + ricardo · admin → todo.
--   Supermercado y Amex (wallet = 'amex') → todos los usuarios con rol.
-- Qué NO hace: no borra ni cambia políticas existentes, ni tablas, ni datos.
-- Las políticas de Postgres se suman (OR): esto solo amplía el acceso a lo
-- que la especificación dice que cada rol debe ver.
--
-- Ejecutar en Supabase → SQL Editor. Todo va en una transacción.
-- Se puede ejecutar dos veces sin daño. Al final hay cómo deshacerlo.
-- =====================================================================

-- 0. (Solo lectura) Políticas actuales, para revisarlas antes:
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename, policyname;

begin;

-- 1. Balances permitidos para el usuario de la sesión ---------------------
create or replace function public.fc_allowed_owners()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case r.role
           when 'admin' then array['casa','andrea','ricardo']
           when 'andrea' then array['casa','andrea']
           when 'ricardo' then array['casa','ricardo']
           else array[]::text[]
         end
    from public.user_roles r
   where r.user_id = auth.uid()
$$;

revoke all on function public.fc_allowed_owners() from public;
grant execute on function public.fc_allowed_owners() to authenticated;

-- 2. Movimientos -------------------------------------------------------------
drop policy if exists fc_tx_select on public.transactions;
create policy fc_tx_select on public.transactions for select to authenticated
  using (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_tx_update on public.transactions;
create policy fc_tx_update on public.transactions for update to authenticated
  using (owner = any (public.fc_allowed_owners()))
  with check (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_tx_insert on public.transactions;
create policy fc_tx_insert on public.transactions for insert to authenticated
  with check (owner = any (public.fc_allowed_owners()) and user_id = auth.uid());

-- 3. Catálogo de conceptos ---------------------------------------------------
drop policy if exists fc_concepts_select on public.andrea_concepts;
create policy fc_concepts_select on public.andrea_concepts for select to authenticated
  using (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_concepts_insert on public.andrea_concepts;
create policy fc_concepts_insert on public.andrea_concepts for insert to authenticated
  with check (owner = any (public.fc_allowed_owners()) and user_id = auth.uid());

-- 4. Cuentas (ownership_scope: common → casa) -------------------------------
drop policy if exists fc_accounts_select on public.accounts;
create policy fc_accounts_select on public.accounts for select to authenticated
  using ((case ownership_scope when 'common' then 'casa' else ownership_scope end)
         = any (public.fc_allowed_owners()));

drop policy if exists fc_accounts_insert on public.accounts;
create policy fc_accounts_insert on public.accounts for insert to authenticated
  with check ((case ownership_scope when 'common' then 'casa' else ownership_scope end)
              = any (public.fc_allowed_owners()) and user_id = auth.uid());

-- 5. Plantillas de importación: las de cuentas que el usuario puede ver ----
drop policy if exists fc_templates_select on public.import_templates;
create policy fc_templates_select on public.import_templates for select to authenticated
  using (exists (
    select 1 from public.accounts a
     where a.id = import_templates.account_id
       and (case a.ownership_scope when 'common' then 'casa' else a.ownership_scope end)
           = any (public.fc_allowed_owners())));

-- 6. Presupuesto -------------------------------------------------------------
drop policy if exists fc_budgets_select on public.monthly_budgets;
create policy fc_budgets_select on public.monthly_budgets for select to authenticated
  using (owner = any (public.fc_allowed_owners()));

-- 7. Compartidos: Supermercado y Amex (lectura para cualquier rol) ---------
drop policy if exists fc_super_select on public.supermarket_purchases;
create policy fc_super_select on public.supermarket_purchases for select to authenticated
  using (cardinality(public.fc_allowed_owners()) > 0);

drop policy if exists fc_amex_select on public.amex_expenses;
create policy fc_amex_select on public.amex_expenses for select to authenticated
  using (wallet = 'amex' and cardinality(public.fc_allowed_owners()) > 0
         or wallet = any (public.fc_allowed_owners()));

commit;

-- ---------------------------------------------------------------------
-- Comprobación (solo lectura): políticas añadidas
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public' and policyname like 'fc\_%'
 order by tablename, policyname;

-- ---------------------------------------------------------------------
-- Para deshacer (si hiciera falta):
-- drop policy if exists fc_tx_select on public.transactions;
-- drop policy if exists fc_tx_update on public.transactions;
-- drop policy if exists fc_tx_insert on public.transactions;
-- drop policy if exists fc_concepts_select on public.andrea_concepts;
-- drop policy if exists fc_concepts_insert on public.andrea_concepts;
-- drop policy if exists fc_accounts_select on public.accounts;
-- drop policy if exists fc_accounts_insert on public.accounts;
-- drop policy if exists fc_templates_select on public.import_templates;
-- drop policy if exists fc_budgets_select on public.monthly_budgets;
-- drop policy if exists fc_super_select on public.supermarket_purchases;
-- drop policy if exists fc_amex_select on public.amex_expenses;
-- drop function if exists public.fc_allowed_owners();
-- ---------------------------------------------------------------------
