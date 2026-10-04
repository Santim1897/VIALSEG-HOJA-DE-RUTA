-- Vialseg · Hoja de ruta v2
-- Almacenamiento por documentos: una fila por registro, agrupada por colección
-- (countries, equipos, fallas, camionetas, jornadas, planes, eventos, cierres, parametros, tipos_falla).
-- El servidor accede con la service_role key; el navegador nunca toca la base directo.

create table if not exists public.vialseg_docs (
  coleccion  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (coleccion, id)
);

create index if not exists vialseg_docs_coleccion_idx on public.vialseg_docs (coleccion);
create index if not exists vialseg_docs_fallas_estado_idx on public.vialseg_docs ((data->>'estado')) where coleccion = 'fallas';

-- RLS activado y sin políticas: con la clave pública (anon) no se puede leer ni escribir nada.
alter table public.vialseg_docs enable row level security;
