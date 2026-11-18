-- =====================================================================
-- Finanzas Casa · Script 06 · Dar el rol admin a una cuenta (para revisar)
-- =====================================================================
-- La app lee el rol de public.user_roles (user_id, role). Una cuenta sin
-- fila ahí entra en «Sin acceso». Este script le da el rol admin.
--
-- Antes de ejecutar: sustituye CORREO_DE_LA_CUENTA (las dos veces) por el
-- correo exacto de la cuenta, tal como sale en Authentication → Users.
-- No guardes el fichero con el correo real (es solo para pegarlo en el
-- SQL Editor).
--
-- Qué hace: si la cuenta no tiene rol, lo crea como admin; si ya tiene uno,
-- lo cambia a admin. No toca nada más.
-- Ejecutar en Supabase → SQL Editor.
-- =====================================================================

-- 0. (Solo lectura) Cuentas y roles actuales:
-- select u.email, r.role
--   from auth.users u
--   left join public.user_roles r on r.user_id = u.id
--  order by u.email;

begin;

insert into public.user_roles (user_id, role)
select u.id, 'admin'
  from auth.users u
 where lower(u.email) = lower('CORREO_DE_LA_CUENTA')
on conflict (user_id) do update set role = excluded.role;

commit;

-- Comprobación (solo lectura): debe salir una fila con role = admin.
select u.email, r.role
  from auth.users u
  join public.user_roles r on r.user_id = u.id
 where lower(u.email) = lower('CORREO_DE_LA_CUENTA');

-- ---------------------------------------------------------------------
-- Para deshacer (quitarle el rol; la cuenta volvería a «Sin acceso»):
-- delete from public.user_roles
--  where user_id = (select id from auth.users where lower(email) = lower('CORREO_DE_LA_CUENTA'));
-- ---------------------------------------------------------------------
