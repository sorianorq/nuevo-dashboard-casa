-- =====================================================================
-- Finanzas Casa · Script 19 · Cerrar los permisos abiertos de cuentas y
-- movimientos (sustituye al script 18)
-- =====================================================================
-- Hallazgo (26/11/2026): accounts y transactions tienen dos políticas
-- anteriores a esta app, household_accounts y household_transactions,
-- con USING (true) WITH CHECK (true) para cualquier usuario con sesión.
-- Como las políticas se suman (OR), anulan las del script 04: cualquier
-- usuario podía leer, crear, cambiar y borrar cuentas y movimientos de
-- cualquier Balance (comprobado: el usuario de pruebas creó una cuenta y
-- un movimiento en el Balance de Andrea y borró una cuenta con
-- movimientos, que se llevó sus movimientos en cascada). El script 18 no
-- llegó a aplicarse.
--
-- Qué hace:
--   1. QUITA household_accounts y household_transactions.
--   2. Cuentas: permite quitar las de tus Balances (fc_accounts_delete) y
--      AÑADE una regla RESTRICTIVA: nunca se borra una cuenta con
--      movimientos (la app los pasa antes a otra cuenta o a «Cuenta Raw»).
--   3. Plantillas: permite quitar las de cuentas de tus Balances.
-- Con esto quedan, para cuentas y movimientos, solo las políticas por
-- Balance del script 04: andrea → casa + andrea · ricardo → casa +
-- ricardo · admin → todo.
--
-- Qué NO hace: no toca datos ni otras tablas. Los movimientos no se pueden
-- borrar desde la app (nunca se ha podido: no hay política de borrado).
-- OJO: si la app anterior (dashboard-rqs.vercel.app) se sigue usando y
-- dependía de household_*, dejará de poder escribir fuera de lo que
-- permiten las políticas por Balance.
--
-- Requisito: script 04 (public.fc_allowed_owners()).
-- Ejecutar en Supabase → SQL Editor. Todo va en una transacción.
-- Se puede ejecutar dos veces sin daño. Al final hay cómo deshacerlo.
-- =====================================================================

begin;

-- 1. Permisos abiertos de la app anterior --------------------------------
drop policy if exists household_accounts on public.accounts;
drop policy if exists household_transactions on public.transactions;

-- 2. Cuentas: quitar solo en tus Balances y solo si está vacía -------------
drop policy if exists fc_accounts_delete on public.accounts;
create policy fc_accounts_delete on public.accounts for delete to authenticated
  using ((case ownership_scope when 'common' then 'casa' else ownership_scope end)
         = any (public.fc_allowed_owners()));

drop policy if exists fc_accounts_delete_vacia on public.accounts;
create policy fc_accounts_delete_vacia on public.accounts as restrictive for delete to authenticated
  using (not exists (select 1 from public.transactions t where t.account_id = accounts.id));

-- 3. Plantillas de columnas de las cuentas de tus Balances -----------------
drop policy if exists fc_templates_delete on public.import_templates;
create policy fc_templates_delete on public.import_templates for delete to authenticated
  using (exists (
    select 1 from public.accounts a
     where a.id = import_templates.account_id
       and (case a.ownership_scope when 'common' then 'casa' else a.ownership_scope end)
           = any (public.fc_allowed_owners())));

commit;

-- Comprobación: no debe salir ninguna household_*, y sí fc_accounts_delete,
-- fc_accounts_delete_vacia (RESTRICTIVE) y fc_templates_delete.
-- select tablename, policyname, permissive, cmd from pg_policies
--  where schemaname = 'public' and tablename in ('accounts', 'transactions', 'import_templates')
--  order by tablename, cmd, policyname;
--
-- ¿Hay más políticas abiertas (true) en otras tablas?
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and (qual = 'true' or with_check = 'true');

-- Deshacer (vuelve a dejarlo como estaba):
-- begin;
-- create policy household_accounts on public.accounts for all to authenticated using (true) with check (true);
-- create policy household_transactions on public.transactions for all to authenticated using (true) with check (true);
-- drop policy if exists fc_accounts_delete on public.accounts;
-- drop policy if exists fc_accounts_delete_vacia on public.accounts;
-- drop policy if exists fc_templates_delete on public.import_templates;
-- commit;
