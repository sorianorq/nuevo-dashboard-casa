-- =====================================================================
-- Finanzas Casa · Script 17 · Bancos conectados con Enable Banking
-- =====================================================================
-- Petición de Ricardo (26/11/2026): traer los movimientos de las cuentas
-- desde el banco (Enable Banking, PSD2) en lugar de subir extractos, con
-- un botón. Solo lectura de movimientos: nada de pagos ni saldos.
--
-- Qué hace: CREA dos tablas.
--   · bank_sessions: cada permiso dado en un banco (estado de la
--     conexión, hasta cuándo vale y las cuentas que el banco ha dejado ver:
--     nombre y últimos 4 dígitos del IBAN, nunca el IBAN entero).
--   · bank_links: qué cuenta de la app corresponde a qué cuenta del banco.
--   · RLS: cada persona solo ve, crea, cambia y borra sus propias
--     conexiones (user_id = auth.uid()). Quien conecta un banco es quien
--     puede traer sus movimientos; la otra persona no ve la conexión.
-- Qué NO hace: no cambia ninguna otra tabla, política ni dato. Los
-- movimientos se siguen guardando en transactions, como con los extractos.
--
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar dos veces sin daño.
-- Al final hay cómo deshacerlo.
-- =====================================================================

begin;

create table if not exists public.bank_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  aspsp_name text not null,
  aspsp_country text not null default 'ES',
  -- Valor aleatorio de la ida al banco; se comprueba a la vuelta.
  state text not null unique,
  -- Sesión de Enable Banking (solo cuando el banco ha dado el permiso).
  session_id text,
  valid_until timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'closed')),
  -- [{ uid, name, last4, currency }]
  accounts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_links (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  bank_session_id uuid not null references public.bank_sessions (id) on delete cascade,
  -- uid de la cuenta en Enable Banking (vale mientras la sesión esté activa).
  eb_account_uid text not null,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bank_sessions enable row level security;
alter table public.bank_links enable row level security;

drop policy if exists fc_bank_sessions_own on public.bank_sessions;
create policy fc_bank_sessions_own on public.bank_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists fc_bank_links_own on public.bank_links;
create policy fc_bank_links_own on public.bank_links for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;

-- Comprobación: debe devolver 2 políticas.
-- select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('bank_sessions', 'bank_links');

-- Deshacer:
-- drop table if exists public.bank_links;
-- drop table if exists public.bank_sessions;
