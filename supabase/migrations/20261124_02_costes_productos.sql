-- Fase 3: coste de cada producto (solo lo ven y cambian los administradores)
-- para calcular lo que se gana con cada uno en Informes. Solo añade cosas.
create table if not exists public.productos_coste (
  producto_id uuid primary key references public.productos(id) on delete cascade,
  coste numeric(10,4) not null check (coste >= 0),
  updated_at timestamptz not null default now()
);
alter table public.productos_coste enable row level security;
revoke all on public.productos_coste from anon;
grant select, insert, update, delete on public.productos_coste to authenticated;
drop policy if exists admin_productos_coste on public.productos_coste;
create policy admin_productos_coste on public.productos_coste for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
