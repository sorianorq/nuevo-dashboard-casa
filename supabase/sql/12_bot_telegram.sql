-- =====================================================================
-- Finanzas Casa · Script 12 · Bot de Telegram (para revisar)
-- =====================================================================
-- Necesario para apuntar gastos desde Telegram (decisión de Ricardo,
-- 20/11/2026).
--
-- Qué hace: CREA la tabla public.telegram_pending, donde el bot guarda un
-- gasto mientras se eligen los botones (Balance y, si hace falta, medio de
-- pago) y, ya guardado, el id del gasto para poder deshacerlo.
--   · Tiene RLS activado y NINGUNA política: ningún usuario de la app la
--     puede leer ni escribir. Solo el servidor del bot, con la clave de
--     servicio de Supabase (que se salta RLS), la usa.
-- Qué NO hace: no cambia ninguna otra tabla, política ni dato.
--
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

create table if not exists public.telegram_pending (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  -- Persona que escribe (andrea | ricardo).
  person text not null check (person in ('andrea', 'ricardo')),
  -- Lo que Claude ha entendido del mensaje: importe, descripción, fecha, amex…
  payload jsonb not null,
  -- Balance elegido con los botones (casa | andrea | ricardo).
  owner text check (owner in ('casa', 'andrea', 'ricardo')),
  -- Gasto creado en amex_expenses (para «Deshacer»).
  expense_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists telegram_pending_created_at on public.telegram_pending (created_at);

alter table public.telegram_pending enable row level security;

commit;

-- Comprobación (solo lectura): debe salir una fila con rowsecurity = true.
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'telegram_pending';

-- ---------------------------------------------------------------------
-- Deshacer:
-- drop table if exists public.telegram_pending;
-- ---------------------------------------------------------------------
