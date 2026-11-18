-- =====================================================================
-- Finanzas Casa · Script 09 · Nombre de concepto único por Balance (para revisar)
-- =====================================================================
-- Necesario para la fase 4 (Pagos) y para crear conceptos en Casa.
--
-- Problema encontrado el 18/11/2026: andrea_concepts sigue teniendo la regla
-- antigua «andrea_concepts_user_id_concept_key» = único (user_id, concept).
-- Como Ricardo ya tiene «Otros gastos» en su Balance, no puede crear
-- «Otros gastos» en Casa (ni «Ocio», «Compras»… si ya los tiene): la base de
-- datos lo rechaza aunque sean Balances distintos. La especificación dice
-- que la regla es única (owner, concept): un nombre por Balance.
--
-- Qué hace:
--   1. (solo lectura) enseña las reglas UNIQUE de andrea_concepts y si hay
--      nombres repetidos dentro de un mismo Balance;
--   2. crea la regla única (owner, concept) si no existe;
--   3. quita la regla antigua (user_id, concept);
--   4. pide a la API de Supabase que recargue el esquema (para que vea la
--      función fc_pagos_concepts del script 08).
-- Qué NO hace: no borra ni cambia tablas, columnas ni datos.
--
-- Si el paso 1 devuelve filas en «repetidos», PARA y avisa: el paso 2
-- fallaría (y la transacción no cambiaría nada).
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- =====================================================================

-- 1. Revisión (solo lectura) -------------------------------------------------
select conname as regla, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.andrea_concepts'::regclass and contype = 'u';

select owner, lower(concept) as repetidos, count(*)
  from public.andrea_concepts
 group by owner, lower(concept)
having count(*) > 1;

-- Comprobación del script 08 (debe devolver 1 fila):
select proname from pg_proc where proname = 'fc_pagos_concepts';

begin;

-- 2. Única por Balance (si no existe ya una regla sobre (owner, concept))
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.andrea_concepts'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) = 'UNIQUE (owner, concept)'
  ) then
    alter table public.andrea_concepts
      add constraint andrea_concepts_owner_concept_key unique (owner, concept);
  end if;
end $$;

-- 3. Quitar la regla antigua por usuario
alter table public.andrea_concepts drop constraint if exists andrea_concepts_user_id_concept_key;

commit;

-- 4. Recargar el esquema de la API
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Comprobación final (solo lectura): debe quedar UNIQUE (owner, concept)
-- y no UNIQUE (user_id, concept)
-- ---------------------------------------------------------------------
select conname as regla, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'public.andrea_concepts'::regclass and contype = 'u';

-- ---------------------------------------------------------------------
-- Para deshacer (si hiciera falta; fallará si ya hay un mismo nombre en dos
-- Balances creado por el mismo usuario):
-- alter table public.andrea_concepts add constraint andrea_concepts_user_id_concept_key unique (user_id, concept);
-- ---------------------------------------------------------------------
