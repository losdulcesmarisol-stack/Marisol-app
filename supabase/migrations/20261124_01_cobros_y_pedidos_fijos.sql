-- Fase 1: cobros pendientes en la cuenta del cliente, pedidos fijos (comandas
-- programadas) y pantalla de inicio por usuario. Solo añade cosas.

-- ── Cobros pendientes ("a cuenta del cliente") ───────────────────────────
alter table public.comandas drop constraint if exists comandas_estado_check;
alter table public.comandas add constraint comandas_estado_check check (estado in ('pendiente','cobrada','a_cuenta'));
alter table public.comandas add column if not exists fecha_a_cuenta date;
alter table public.comandas add column if not exists pedido_fijo_id uuid;
create index if not exists comandas_estado on public.comandas (estado);
create index if not exists comandas_cliente on public.comandas (cliente_id);

-- ── Pedidos fijos (lo que un cliente pide siempre ciertos días) ──────────
create table if not exists public.pedidos_fijos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  dias int[] not null default '{}',        -- 1 = lunes ... 7 = domingo
  items jsonb not null default '[]',       -- [{prodId, nombre, icono, qty}]
  activo boolean not null default true,
  notas text not null default '',
  created_at timestamptz not null default now(),
  unique (cliente_id)
);
alter table public.comandas drop constraint if exists comandas_pedido_fijo_fk;
alter table public.comandas add constraint comandas_pedido_fijo_fk foreign key (pedido_fijo_id) references public.pedidos_fijos(id) on delete set null;

-- Recuerda qué días ya se generó cada pedido fijo (aunque luego se cancele la comanda)
create table if not exists public.pedidos_fijos_generados (
  pedido_fijo_id uuid not null references public.pedidos_fijos(id) on delete cascade,
  fecha_entrega date not null,
  comanda_id uuid,
  created_at timestamptz not null default now(),
  primary key (pedido_fijo_id, fecha_entrega)
);

-- Crea las comandas de los pedidos fijos para el día de trabajo (hora de España):
-- hasta las 10:00, para hoy; después, para mañana (igual que la app).
-- Precio: el especial del cliente si lo tiene; si no, el del producto en ese momento.
create or replace function public.generar_pedidos_fijos(p_hasta date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  hoy date := ahora::date;
  desde date := case when extract(hour from ahora) >= 10 then hoy + 1 else hoy end;
  hasta date := greatest(coalesce(p_hasta, desde), desde);
  d date; pf record; its jsonb; tot numeric; nid uuid; n int := 0;
begin
  if auth.role() = 'authenticated' and not public.usuario_activo() then return 0; end if;
  if hasta > hoy + 7 then hasta := hoy + 7; end if;
  d := desde;
  while d <= hasta loop
    for pf in
      select f.*, c.nombre as cliente_nombre, c.precios_especiales
      from pedidos_fijos f join clientes c on c.id = f.cliente_id
      where f.activo and c.activo and extract(isodow from d)::int = any(f.dias)
        and jsonb_array_length(f.items) > 0
        and not exists (select 1 from pedidos_fijos_generados g where g.pedido_fijo_id = f.id and g.fecha_entrega = d)
    loop
      select coalesce(jsonb_agg(jsonb_build_object(
               'prodId', p.id, 'nombre', p.nombre, 'icono', coalesce(p.icono, ''),
               'qty', (i->>'qty')::numeric,
               'precio', coalesce(nullif(pf.precios_especiales->>p.id::text, '')::numeric, p.precio))), '[]'::jsonb)
        into its
      from jsonb_array_elements(pf.items) i join productos p on p.id::text = i->>'prodId'
      where coalesce((i->>'qty')::numeric, 0) > 0;
      continue when jsonb_array_length(its) = 0;
      select round(sum((x->>'qty')::numeric * (x->>'precio')::numeric), 2) into tot from jsonb_array_elements(its) x;
      insert into comandas (fecha_registro, hora_registro, fecha_entrega, cliente_id, cliente_nombre, items, total, estado, pedido_fijo_id, notas_panadero)
      values (hoy, ahora::time, d, pf.cliente_id, pf.cliente_nombre, its, tot, 'pendiente', pf.id, nullif(pf.notas, ''))
      returning id into nid;
      insert into pedidos_fijos_generados (pedido_fijo_id, fecha_entrega, comanda_id) values (pf.id, d, nid);
      n := n + 1;
    end loop;
    d := d + 1;
  end loop;
  return n;
end $$;
revoke all on function public.generar_pedidos_fijos(date) from public, anon;
grant execute on function public.generar_pedidos_fijos(date) to authenticated;

-- Cada hora (es seguro repetirlo: no duplica) se preparan las comandas fijas de hoy y mañana
create extension if not exists pg_cron;
select cron.unschedule('pedidos_fijos') where exists (select 1 from cron.job where jobname = 'pedidos_fijos');
select cron.schedule('pedidos_fijos', '7 * * * *', $$select public.generar_pedidos_fijos()$$);

-- ── Pantalla de inicio de cada usuario ───────────────────────────────────
alter table public.usuarios add column if not exists inicio text not null default '/';
grant select (inicio) on public.usuarios to authenticated;
grant insert (inicio), update (inicio) on public.usuarios to authenticated;

-- ── Seguridad ────────────────────────────────────────────────────────────
alter table public.pedidos_fijos enable row level security;
alter table public.pedidos_fijos_generados enable row level security;
revoke all on public.pedidos_fijos, public.pedidos_fijos_generados from anon;
create policy equipo_pedidos_fijos on public.pedidos_fijos for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo());
create policy equipo_pf_generados_ver on public.pedidos_fijos_generados for select to authenticated using (public.usuario_activo());
