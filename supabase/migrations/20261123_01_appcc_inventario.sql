-- APPCC (2): inventario de arranque, productos hechos/congelados en stock,
-- recuento mensual y alérgenos visibles para todos. Solo añade cosas.

-- Lotes que no vienen de un albarán (inventario de arranque o recuento)
alter table public.lotes_mp add column if not exists origen text not null default 'albaran'
  check (origen in ('albaran','inventario','recuento'));
alter table public.lotes_mp alter column caducidad drop not null;   -- en el inventario puede no saberse

-- Recuentos mensuales y ajustes de stock (cantidad negativa = falta, positiva = sobra)
create table if not exists public.recuentos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  observaciones text not null default '',
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  created_at timestamptz not null default now()
);
create table if not exists public.stock_ajustes (
  id uuid primary key default gen_random_uuid(),
  recuento_id uuid references public.recuentos(id) on delete cascade,
  lote_id uuid not null references public.lotes_mp(id),
  cantidad numeric(12,3) not null,
  created_at timestamptz not null default now()
);
create index if not exists stock_ajustes_lote on public.stock_ajustes (lote_id);
create index if not exists stock_ajustes_recuento on public.stock_ajustes (recuento_id);

-- El stock de cada lote tiene en cuenta también los ajustes de recuento
drop view if exists public.lotes_mp_stock;
create view public.lotes_mp_stock with (security_invoker = true) as
select l.*,
  l.cantidad
  - coalesce((select sum(c.cantidad) from public.produccion_consumos c where c.lote_id = l.id), 0)
  + coalesce((select sum(a.cantidad) from public.stock_ajustes a where a.lote_id = l.id), 0) as restante
from public.lotes_mp l;
revoke all on public.lotes_mp_stock from anon;

-- Descuento por orden de caducidad: lo que no tiene caducidad conocida (existencias
-- antiguas del inventario de arranque) se gasta primero.
create or replace function public.appcc_descontar_produccion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record; r record; l record;
  uds numeric; falta numeric; disp numeric; q numeric;
begin
 begin  -- si algo falla aquí, la hoja de producción se guarda igualmente
  delete from produccion_consumos where produccion_id = new.id;
  for p in
    select pr.id as producto_id,
           coalesce(nullif(regexp_replace(coalesce(x->>'cocidas',''), '[^0-9.,]', '', 'g'), ''),
                    nullif(regexp_replace(coalesce(x->>'masa',''), '[^0-9.,]', '', 'g'), ''), '0') as uds_txt
    from jsonb_array_elements(coalesce(new.productos, '[]'::jsonb)) x
    join productos pr on pr.id::text = x->>'prodId' or upper(trim(pr.nombre)) = upper(trim(x->>'nombre'))
  loop
    uds := replace(p.uds_txt, ',', '.')::numeric;
    continue when uds is null or uds <= 0;
    for r in select materia_id, cantidad from recetas where producto_id = p.producto_id loop
      falta := r.cantidad * uds;
      for l in
        select s.id, s.restante from lotes_mp_stock s
        where s.materia_id = r.materia_id and s.estado = 'aceptado' and s.restante > 0
        order by s.caducidad nulls first, s.created_at  -- lo sin caducidad conocida (existencias antiguas) primero
      loop
        exit when falta <= 0;
        disp := l.restante;  -- la vista ya descuenta lo consumido, incluido lo de esta misma hoja
        continue when disp <= 0;
        q := least(disp, falta);
        insert into produccion_consumos (produccion_id, materia_id, lote_id, cantidad) values (new.id, r.materia_id, l.id, q);
        falta := falta - q;
      end loop;
      if falta > 0.0005 then
        insert into produccion_consumos (produccion_id, materia_id, lote_id, cantidad) values (new.id, r.materia_id, null, falta);
      end if;
    end loop;
  end loop;
 exception when others then
  raise warning 'APPCC: no se pudo descontar el stock de la producción %: %', new.id, sqlerrm;
 end;
  return new;
end $$;

-- Productos ya hechos guardados (congelados, cajas preparadas...). Lote = fecha de fabricación.
create table if not exists public.stock_terminados (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id),
  producto_nombre text not null,
  cantidad numeric(12,2) not null check (cantidad >= 0),
  unidad text not null default 'ud',
  fecha_fabricacion date not null,
  consumo_preferente date,
  ubicacion text not null default '',
  estado text not null default 'en_stock' check (estado in ('en_stock','gastado','retirado')),
  motivo text,
  usuario_id uuid references public.usuarios(id),
  usuario_nombre text,
  created_at timestamptz not null default now()
);

-- Alérgenos de cada producto (según sus recetas) visibles para todo el equipo,
-- aunque las recetas solo las vean los administradores.
create or replace function public.alergenos_productos()
returns table (producto_id uuid, alergenos text[], tiene_receta boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce((select array_agg(distinct a order by a) from recetas r join materias_primas m on m.id = r.materia_id, unnest(m.alergenos) a where r.producto_id = p.id), '{}'),
         exists (select 1 from recetas r where r.producto_id = p.id)
  from productos p where p.activo and public.usuario_activo()
$$;
revoke all on function public.alergenos_productos() from public, anon;
grant execute on function public.alergenos_productos() to authenticated;

-- Seguridad
alter table public.recuentos enable row level security;
alter table public.stock_ajustes enable row level security;
alter table public.stock_terminados enable row level security;
revoke all on public.recuentos, public.stock_ajustes, public.stock_terminados from anon;
create policy equipo_recuentos_ver on public.recuentos for select to authenticated using (public.usuario_activo());
create policy admin_recuentos on public.recuentos for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy equipo_ajustes_ver on public.stock_ajustes for select to authenticated using (public.usuario_activo());
create policy admin_ajustes on public.stock_ajustes for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy equipo_terminados on public.stock_terminados for all to authenticated using (public.usuario_activo()) with check (public.usuario_activo());

-- Índices que pidió el asesor de Supabase
create index if not exists appcc_temperaturas_equipo on public.appcc_temperaturas (equipo_id);
create index if not exists lotes_mp_recepcion on public.lotes_mp (recepcion_id);
create index if not exists recetas_materia on public.recetas (materia_id);
create index if not exists produccion_consumos_materia on public.produccion_consumos (materia_id);
