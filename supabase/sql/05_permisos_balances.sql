-- =====================================================================
-- Finanzas Casa · Script 05 · Permisos de escritura en Balances (para revisar)
-- =====================================================================
-- Necesario para la entrega 2 de Balances: escribir importes a mano,
-- comentarios por celda, renombrar / reordenar / archivar conceptos y
-- guardar las filas ocultas de cada usuario.
--
-- Qué hace: AÑADE políticas fc_* (como el script 04), usando la función
-- public.fc_allowed_owners() que creó el 04:
--   · andrea_balance, andrea_comments → ver, crear, cambiar y borrar en los
--     Balances del rol (andrea → casa + andrea; ricardo → casa + ricardo;
--     admin → todo). Borrar = quitar un importe escrito a mano o un comentario.
--   · andrea_periodicity → solo ver (la app guarda la periodicidad en
--     andrea_concepts.periodicity).
--   · andrea_concepts → cambiar (renombrar, orden, periodicidad, archivar).
--     No se añade borrar: un concepto se archiva.
--   · user_preferences → cada usuario ve y cambia solo las suyas.
-- Qué NO hace: no borra ni cambia políticas existentes, ni tablas, ni datos.
-- Las políticas se suman (OR) a las que ya hay.
--
-- Requisito: haber ejecutado el script 04 (función fc_allowed_owners).
-- Ejecutar en Supabase → SQL Editor. Todo va en una transacción.
-- Se puede ejecutar dos veces sin daño. Al final hay cómo deshacerlo.
-- =====================================================================

-- 0. (Solo lectura) Antes de ejecutar, para revisar:
-- a) RLS activado en las tablas (rowsecurity = true):
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public'
--    and tablename in ('andrea_balance','andrea_comments','andrea_periodicity','andrea_concepts','user_preferences');
-- b) Políticas actuales de esas tablas:
-- select tablename, policyname, cmd, qual, with_check from pg_policies
--  where schemaname = 'public'
--    and tablename in ('andrea_balance','andrea_comments','andrea_periodicity','andrea_concepts','user_preferences')
--  order by tablename, policyname;
-- c) Filas de andrea_balance por Balance (deberían tener owner y, a ser posible, concept_id):
-- select owner, count(*) as filas, count(concept_id) as con_concept_id
--   from public.andrea_balance group by owner order by owner;

begin;

-- 1. Importes escritos a mano --------------------------------------------
drop policy if exists fc_balance_select on public.andrea_balance;
create policy fc_balance_select on public.andrea_balance for select to authenticated
  using (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_balance_insert on public.andrea_balance;
create policy fc_balance_insert on public.andrea_balance for insert to authenticated
  with check (owner = any (public.fc_allowed_owners()) and user_id = auth.uid());

drop policy if exists fc_balance_update on public.andrea_balance;
create policy fc_balance_update on public.andrea_balance for update to authenticated
  using (owner = any (public.fc_allowed_owners()))
  with check (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_balance_delete on public.andrea_balance;
create policy fc_balance_delete on public.andrea_balance for delete to authenticated
  using (owner = any (public.fc_allowed_owners()));

-- 2. Comentarios por celda ------------------------------------------------
drop policy if exists fc_comments_select on public.andrea_comments;
create policy fc_comments_select on public.andrea_comments for select to authenticated
  using (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_comments_insert on public.andrea_comments;
create policy fc_comments_insert on public.andrea_comments for insert to authenticated
  with check (owner = any (public.fc_allowed_owners()) and user_id = auth.uid());

drop policy if exists fc_comments_update on public.andrea_comments;
create policy fc_comments_update on public.andrea_comments for update to authenticated
  using (owner = any (public.fc_allowed_owners()))
  with check (owner = any (public.fc_allowed_owners()));

drop policy if exists fc_comments_delete on public.andrea_comments;
create policy fc_comments_delete on public.andrea_comments for delete to authenticated
  using (owner = any (public.fc_allowed_owners()));

-- 3. Periodicidad antigua (solo lectura) ----------------------------------
drop policy if exists fc_periodicity_select on public.andrea_periodicity;
create policy fc_periodicity_select on public.andrea_periodicity for select to authenticated
  using (owner = any (public.fc_allowed_owners()));

-- 4. Conceptos: renombrar, orden, periodicidad, archivar -------------------
drop policy if exists fc_concepts_update on public.andrea_concepts;
create policy fc_concepts_update on public.andrea_concepts for update to authenticated
  using (owner = any (public.fc_allowed_owners()))
  with check (owner = any (public.fc_allowed_owners()));

-- 5. Preferencias de cada usuario (filas ocultas del Balance) --------------
drop policy if exists fc_prefs_select on public.user_preferences;
create policy fc_prefs_select on public.user_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists fc_prefs_insert on public.user_preferences;
create policy fc_prefs_insert on public.user_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists fc_prefs_update on public.user_preferences;
create policy fc_prefs_update on public.user_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;

-- ---------------------------------------------------------------------
-- Comprobación (solo lectura): políticas añadidas por este script
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname in ('fc_balance_select','fc_balance_insert','fc_balance_update','fc_balance_delete',
                      'fc_comments_select','fc_comments_insert','fc_comments_update','fc_comments_delete',
                      'fc_periodicity_select','fc_concepts_update',
                      'fc_prefs_select','fc_prefs_insert','fc_prefs_update')
 order by tablename, policyname;

-- ---------------------------------------------------------------------
-- Para deshacer (si hiciera falta):
-- drop policy if exists fc_balance_select on public.andrea_balance;
-- drop policy if exists fc_balance_insert on public.andrea_balance;
-- drop policy if exists fc_balance_update on public.andrea_balance;
-- drop policy if exists fc_balance_delete on public.andrea_balance;
-- drop policy if exists fc_comments_select on public.andrea_comments;
-- drop policy if exists fc_comments_insert on public.andrea_comments;
-- drop policy if exists fc_comments_update on public.andrea_comments;
-- drop policy if exists fc_comments_delete on public.andrea_comments;
-- drop policy if exists fc_periodicity_select on public.andrea_periodicity;
-- drop policy if exists fc_concepts_update on public.andrea_concepts;
-- drop policy if exists fc_prefs_select on public.user_preferences;
-- drop policy if exists fc_prefs_insert on public.user_preferences;
-- drop policy if exists fc_prefs_update on public.user_preferences;
-- ---------------------------------------------------------------------
