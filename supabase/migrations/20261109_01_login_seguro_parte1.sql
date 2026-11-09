-- Parte 1 (ya aplicada el 2026-11-09, no rompe nada): infraestructura del login seguro.
alter table public.usuarios add column if not exists auth_user_id uuid unique;

create table if not exists public.login_intentos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists login_intentos_usuario_fecha on public.login_intentos (usuario_id, created_at desc);
alter table public.login_intentos enable row level security;
revoke all on public.login_intentos from anon, authenticated;

create or replace function public.usuarios_login()
returns table (id uuid, nombre text, rol text)
language sql stable security definer set search_path = public
as $$ select u.id, u.nombre, u.rol from public.usuarios u where u.activo order by u.nombre $$;
revoke all on function public.usuarios_login() from public;
grant execute on function public.usuarios_login() to anon, authenticated;

create or replace function public.usuario_activo()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.activo) $$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.activo and u.rol = 'admin') $$;

revoke all on function public.usuario_activo() from public;
revoke all on function public.es_admin() from public;
grant execute on function public.usuario_activo() to authenticated;
grant execute on function public.es_admin() to authenticated;
